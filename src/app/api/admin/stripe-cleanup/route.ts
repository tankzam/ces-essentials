import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { admin } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { STRIPE_SOURCE } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// TEMPORARY: removes the CES Essentials objects from the CES Wallet Stripe
// account before moving to a dedicated account. Touches ONLY objects whose
// IDs we recorded AND whose metadata.source is "CES Essentials". Anything
// else is reported and left alone. Protected by SETUP_SECRET.

function authorized(req: Request): boolean {
  const secret = process.env.SETUP_SECRET;
  const given = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!secret || given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

const ours = (o: { metadata?: Record<string, string> | null }) => o.metadata?.source === STRIPE_SOURCE;

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const s = stripe();
  const db = admin();
  const body = (await req.json().catch(() => ({}))) as { webhookId?: string; portalId?: string; pmcId?: string; dryRun?: boolean };
  const dry = body.dryRun !== false;
  const done: string[] = [];
  const skipped: string[] = [];

  // Safety: nobody has paid through this account for CES Essentials.
  const { count: subs } = await db.from('subscriptions').select('id', { count: 'exact', head: true });
  const { count: customers } = await db.from('profiles').select('id', { count: 'exact', head: true }).not('stripe_customer_id', 'is', null);
  if ((subs ?? 0) > 0) return NextResponse.json({ error: 'Subscriptions exist; not cleaning up.' }, { status: 409 });

  // Prices and products we created (archive: Stripe does not allow deleting used objects).
  const { data: products } = await db.from('products').select('id, stripe_product_id, stripe_price_id');
  for (const p of products ?? []) {
    if (p.stripe_price_id) {
      const price = await s.prices.retrieve(p.stripe_price_id);
      if (!ours(price)) skipped.push(`price ${price.id} (not tagged)`);
      else {
        if (!dry && price.active) await s.prices.update(price.id, { active: false });
        done.push(`archived price ${price.id} (${p.id})`);
      }
    }
    if (p.stripe_product_id) {
      const prod = await s.products.retrieve(p.stripe_product_id);
      if (!ours(prod)) skipped.push(`product ${prod.id} (not tagged)`);
      else {
        if (!dry && prod.active) await s.products.update(prod.id, { active: false });
        done.push(`archived product ${prod.id} (${p.id})`);
      }
    }
  }

  if (body.webhookId) {
    const w = await s.webhookEndpoints.retrieve(body.webhookId);
    if (!ours(w)) skipped.push(`webhook ${w.id} (not tagged)`);
    else {
      if (!dry) await s.webhookEndpoints.del(w.id);
      done.push(`deleted webhook ${w.id} (${w.url})`);
    }
  }
  if (body.portalId) {
    const c = await s.billingPortal.configurations.retrieve(body.portalId);
    if (!ours(c) || c.is_default) skipped.push(`portal config ${c.id} (not tagged or default)`);
    else {
      if (!dry && c.active) await s.billingPortal.configurations.update(c.id, { active: false });
      done.push(`deactivated portal config ${c.id}`);
    }
  }
  if (body.pmcId) {
    const c = await s.paymentMethodConfigurations.retrieve(body.pmcId);
    if (c.name !== 'CES Essentials — card only' || c.is_default) skipped.push(`payment method config ${c.id} (not ours or default)`);
    else {
      if (!dry && c.active) await s.paymentMethodConfigurations.update(c.id, { active: false });
      done.push(`deactivated payment method config ${c.id}`);
    }
  }

  // Forget the old account's IDs so setup recreates them in the new account.
  if (!dry) await db.from('products').update({ stripe_product_id: null, stripe_price_id: null }).neq('id', '');

  return NextResponse.json({ dryRun: dry, customersWithStripeId: customers ?? 0, done, skipped });
}
