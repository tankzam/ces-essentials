#!/usr/bin/env node
// One-time Stripe setup for CES Essentials, run against the CES Wallet Stripe
// account. Safe to re-run: it only creates what is missing.
//
//   STRIPE_SECRET_KEY=sk_... NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   NEXT_PUBLIC_SITE_URL=https://cesessentials.com node scripts/setup-stripe.mjs
//
// It creates, all tagged metadata.source = "CES Essentials":
//   1. A Stripe product + monthly price for every row in the products table,
//      and saves the ids back to Supabase.
//   2. A customer-portal configuration that only allows updating the card and
//      viewing invoices (plan changes and cancellations happen on our site).
//   3. A card-only payment method configuration for Checkout.
//   4. A webhook endpoint for this site (prints its signing secret).
//
// It never changes account-wide Stripe settings.

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const SOURCE = 'CES Essentials';
const need = (k) => {
  if (!process.env[k]) throw new Error(`Set ${k}`);
  return process.env[k];
};

const stripe = new Stripe(need('STRIPE_SECRET_KEY'));
const db = createClient(need('NEXT_PUBLIC_SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://cesessentials.com').replace(/\/$/, '');

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
];

async function products() {
  const { data, error } = await db.from('products').select('*').order('sort_order');
  if (error) throw error;
  for (const p of data) {
    let productId = p.stripe_product_id;
    if (!productId) {
      const prod = await stripe.products.create({
        name: `CES Essentials — ${p.name}`,
        metadata: { source: SOURCE, product_id: p.id },
      });
      productId = prod.id;
    }
    let priceId = p.stripe_price_id;
    if (priceId) {
      const price = await stripe.prices.retrieve(priceId);
      if (price.unit_amount !== p.price_cents || price.currency !== p.currency) {
        throw new Error(
          `${p.id}: Stripe price ${priceId} is ${price.unit_amount} but products.price_cents is ${p.price_cents}. ` +
            'Changing a live price affects existing members — handle this deliberately, not with this script.',
        );
      }
    } else {
      const price = await stripe.prices.create({
        product: productId,
        unit_amount: p.price_cents,
        currency: p.currency,
        recurring: { interval: 'month' },
        metadata: { source: SOURCE, product_id: p.id },
      });
      priceId = price.id;
    }
    const { error: upErr } = await db.from('products').update({ stripe_product_id: productId, stripe_price_id: priceId }).eq('id', p.id);
    if (upErr) throw upErr;
    console.log(`✓ ${p.id.padEnd(20)} ${priceId}  $${(p.price_cents / 100).toFixed(2)}/mo`);
  }
}

async function portal() {
  if (process.env.STRIPE_PORTAL_CONFIGURATION_ID) {
    console.log(`✓ portal configuration already set: ${process.env.STRIPE_PORTAL_CONFIGURATION_ID}`);
    return;
  }
  const config = await stripe.billingPortal.configurations.create({
    business_profile: { headline: 'CES Essentials — update your card' },
    default_return_url: `${site}/member/billing`,
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: { enabled: false },
      subscription_cancel: { enabled: false },
      subscription_update: { enabled: false },
    },
    metadata: { source: SOURCE },
  });
  console.log(`✓ portal configuration created. Set STRIPE_PORTAL_CONFIGURATION_ID=${config.id}`);
}

async function paymentMethods() {
  if (process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION_ID) {
    console.log(`✓ payment method configuration already set: ${process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION_ID}`);
    return;
  }
  // Card only (Apple Pay / Google Pay are cards and stay available).
  const off = { display_preference: { preference: 'off' } };
  const config = await stripe.paymentMethodConfigurations.create({
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
  console.log(`✓ payment method configuration created. Set STRIPE_PAYMENT_METHOD_CONFIGURATION_ID=${config.id}`);
}

async function webhook() {
  const url = `${site}/api/stripe/webhook`;
  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  const found = existing.data.find((w) => w.url === url);
  if (found) {
    console.log(`✓ webhook endpoint already exists for ${url} (${found.id}). Its secret is in the Stripe dashboard.`);
    return;
  }
  const ep = await stripe.webhookEndpoints.create({
    url,
    enabled_events: EVENTS,
    description: 'CES Essentials',
    metadata: { source: SOURCE },
  });
  console.log(`✓ webhook endpoint created for ${url}. Set STRIPE_WEBHOOK_SECRET=${ep.secret}`);
}

await products();
await portal();
await paymentMethods();
await webhook();
console.log('Done.');
