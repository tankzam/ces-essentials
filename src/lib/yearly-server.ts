import 'server-only';
import type Stripe from 'stripe';
import { admin } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { STRIPE_SOURCE } from '@/lib/env';
import { sendRenewalReminder } from '@/lib/email';
import { earlyCancelQuote, type EarlyCancelQuote } from '@/lib/yearly';

export interface YearlySub {
  id: string;
  provider: string;
  stripe_subscription_id: string;
  current_period_start: string | null;
  current_period_end: string | null;
}

/** The yearly product on a subscription, with the monthly price it mirrors. Null for monthly plans. */
export async function yearlyPlanOf(subscriptionId: string) {
  const db = admin();
  const { data: items } = await db.from('subscription_items').select('product_id, unit_amount_cents').eq('subscription_id', subscriptionId);
  const ids = (items ?? []).map((i) => i.product_id);
  if (!ids.length) return null;
  const { data: products } = await db.from('products').select('id, name, price_cents, billing_interval, yearly_of').in('id', ids);
  const yearly = (products ?? []).find((p) => p.billing_interval === 'year');
  if (!yearly) return null;
  const { data: monthly } = yearly.yearly_of
    ? await db.from('products').select('id, name, price_cents').eq('id', yearly.yearly_of).maybeSingle()
    : { data: null };
  const paidItem = (items ?? []).find((i) => i.product_id === yearly.id);
  return {
    product: yearly,
    monthlyCents: monthly?.price_cents ?? Math.round(yearly.price_cents / 12),
    itemCents: paidItem?.unit_amount_cents ?? yearly.price_cents,
  };
}

/** What the member gets back if they cancel now (null for monthly plans). */
export async function quoteFor(sub: YearlySub): Promise<(EarlyCancelQuote & { paidCents: number; planName: string }) | null> {
  const plan = await yearlyPlanOf(sub.id);
  if (!plan || !sub.current_period_start || !sub.current_period_end) return null;
  let paidCents = plan.itemCents;
  if (sub.provider === 'stripe') {
    const s = await stripe().subscriptions.retrieve(sub.stripe_subscription_id, { expand: ['latest_invoice'] });
    const inv = s.latest_invoice as Stripe.Invoice | null;
    if (inv && typeof inv !== 'string') paidCents = inv.amount_paid;
  }
  const q = earlyCancelQuote({
    periodStart: new Date(sub.current_period_start),
    periodEnd: new Date(sub.current_period_end),
    paidCents,
    monthlyCents: plan.monthlyCents,
  });
  return { ...q, paidCents, planName: plan.product.name };
}

/**
 * Stripe yearly plan cancelled inside the first 3 months: refund the unused
 * part of the year to the original card and end access when the last counted
 * month ends. Returns the refund in cents.
 */
export async function refundEarlyCancel(sub: YearlySub, quote: EarlyCancelQuote): Promise<number> {
  const s = stripe();
  const subscription = await s.subscriptions.retrieve(sub.stripe_subscription_id);
  const invoiceId = typeof subscription.latest_invoice === 'string' ? subscription.latest_invoice : subscription.latest_invoice?.id;
  if (!invoiceId) throw new Error('No invoice found for this plan.');

  if (quote.refundCents > 0) {
    const payments = await s.invoicePayments.list({ invoice: invoiceId, status: 'paid', limit: 5 });
    const pay = payments.data[0]?.payment;
    const pi = typeof pay?.payment_intent === 'string' ? pay.payment_intent : pay?.payment_intent?.id;
    const charge = typeof pay?.charge === 'string' ? pay.charge : pay?.charge?.id;
    if (!pi && !charge) throw new Error('No payment found to refund.');
    await s.refunds.create(
      {
        ...(pi ? { payment_intent: pi } : { charge: charge! }),
        amount: quote.refundCents,
        reason: 'requested_by_customer',
        metadata: { source: STRIPE_SOURCE, reason: 'yearly_early_cancel', months_used: String(quote.monthsUsed) },
      },
      { idempotencyKey: `yearly-early-cancel:${sub.stripe_subscription_id}:${invoiceId}` },
    );
  }
  await s.subscriptions.update(sub.stripe_subscription_id, {
    cancel_at: Math.floor(quote.accessUntil.getTime() / 1000),
    proration_behavior: 'none',
  });
  await admin()
    .from('subscriptions')
    .update({ early_cancel_at: new Date().toISOString(), early_cancel_refund_cents: quote.refundCents, updated_at: new Date().toISOString() })
    .eq('id', sub.id);
  return quote.refundCents;
}

/** Daily: email yearly members about 30 days before their plan renews (once per renewal). */
export async function sendRenewalReminders(): Promise<number> {
  const db = admin();
  const now = Date.now();
  const day = 24 * 3600 * 1000;
  const { data: subs } = await db
    .from('subscriptions')
    .select('id, member_id, provider, current_period_end, renewal_reminder_for, cancel_at_period_end, early_cancel_at, status')
    .in('status', ['active', 'trialing'])
    .eq('cancel_at_period_end', false)
    .is('early_cancel_at', null)
    .not('member_id', 'is', null)
    .gte('current_period_end', new Date(now + 20 * day).toISOString())
    .lte('current_period_end', new Date(now + 31 * day).toISOString());
  let sent = 0;
  for (const s of subs ?? []) {
    if (s.renewal_reminder_for && s.renewal_reminder_for === s.current_period_end) continue;
    const plan = await yearlyPlanOf(s.id);
    if (!plan) continue;
    const { data: m } = await db.from('profiles').select('id, email').eq('id', s.member_id).maybeSingle();
    if (!m) continue;
    await sendRenewalReminder(m, { planName: plan.product.name.replace(' (Yearly)', ', yearly'), amountCents: plan.product.price_cents, renewsAt: s.current_period_end, viaShopify: s.provider === 'shopify' });
    await db.from('subscriptions').update({ renewal_reminder_for: s.current_period_end }).eq('id', s.id);
    sent++;
  }
  return sent;
}
