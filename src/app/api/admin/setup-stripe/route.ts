import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { admin } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { env, STRIPE_SOURCE } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// One-time Stripe setup, run on the server so the Stripe key never leaves
// Vercel. Same steps as scripts/setup-stripe.mjs; safe to re-run (only
// creates what is missing). Protected by SETUP_SECRET; remove that env var to
// disable the route.

const EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.expired',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'invoice.paid',
  'invoice.payment_failed',
] as const;

function authorized(req: Request): boolean {
  const secret = process.env.SETUP_SECRET;
  const given = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!secret || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const s = stripe();
  const db = admin();
  const out: Record<string, unknown> = {};

  // ?check=1 only reports which Stripe account the key belongs to.
  const acct = await s.accounts.retrieveCurrent();
  out.account = { id: acct.id, name: acct.business_profile?.name ?? acct.settings?.dashboard?.display_name ?? null, descriptor: acct.settings?.payments?.statement_descriptor ?? null, charges_enabled: acct.charges_enabled };
  if (new URL(req.url).searchParams.get('check')) return NextResponse.json(out);

  // 1. Products and monthly prices
  const { data: products, error } = await db.from('products').select('*').order('sort_order');
  if (error) throw error;
  const created: string[] = [];
  for (const p of products) {
    let productId = p.stripe_product_id as string | null;
    if (!productId) {
      productId = (await s.products.create({ name: `CES Essentials — ${p.name}`, metadata: { source: STRIPE_SOURCE, product_id: p.id } })).id;
    }
    let priceId = p.stripe_price_id as string | null;
    if (priceId) {
      const price = await s.prices.retrieve(priceId);
      if (price.unit_amount !== p.price_cents || price.currency !== p.currency) {
        return NextResponse.json({ error: `${p.id}: Stripe price differs from products table. Not changing a live price automatically.` }, { status: 409 });
      }
    } else {
      priceId = (
        await s.prices.create({
          product: productId,
          unit_amount: p.price_cents,
          currency: p.currency,
          recurring: { interval: 'month' },
          metadata: { source: STRIPE_SOURCE, product_id: p.id },
        })
      ).id;
      created.push(p.id);
    }
    await db.from('products').update({ stripe_product_id: productId, stripe_price_id: priceId }).eq('id', p.id);
  }
  out.products = { total: products.length, created };
  out.livemode = (await s.balance.retrieve()).livemode;

  // 2. Customer portal: update card + invoices only
  if (!env.stripePortalConfigId()) {
    const config = await s.billingPortal.configurations.create({
      business_profile: { headline: 'CES Essentials — update your card' },
      default_return_url: `${env.siteUrl()}/member/billing`,
      features: {
        payment_method_update: { enabled: true },
        invoice_history: { enabled: true },
        customer_update: { enabled: false },
        subscription_cancel: { enabled: false },
        subscription_update: { enabled: false },
      },
      metadata: { source: STRIPE_SOURCE },
    });
    out.STRIPE_PORTAL_CONFIGURATION_ID = config.id;
  }

  // 3. Card-only payment method configuration for Checkout
  if (!process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION_ID) {
    const off = { display_preference: { preference: 'off' as const } };
    const pmc = await s.paymentMethodConfigurations.create({
      name: 'CES Essentials — card only',
      card: { display_preference: { preference: 'on' } },
      link: off,
      cashapp: off,
      affirm: off,
      klarna: off,
      afterpay_clearpay: off,
      us_bank_account: off,
      amazon_pay: off,
      zip: off,
      crypto: off,
    });
    out.STRIPE_PAYMENT_METHOD_CONFIGURATION_ID = pmc.id;
  }

  // 4. Webhook endpoint for this site
  const url = `${env.siteUrl()}/api/stripe/webhook`;
  const existing = (await s.webhookEndpoints.list({ limit: 100 })).data.find((w) => w.url === url);
  if (existing) {
    out.webhook = `exists (${existing.id})`;
  } else {
    const ep = await s.webhookEndpoints.create({ url, enabled_events: [...EVENTS], description: 'CES Essentials', metadata: { source: STRIPE_SOURCE } });
    out.webhook = `created (${ep.id})`;
    out.STRIPE_WEBHOOK_SECRET = ep.secret;
  }

  return NextResponse.json(out);
}
