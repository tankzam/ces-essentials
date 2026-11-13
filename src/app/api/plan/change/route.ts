import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { admin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';
import { resolveSelection, SelectionError } from '@/lib/catalog';
import { currentPlan } from '@/lib/plan';
import { shopifyAccountUrl } from '@/lib/shopify-billing';
import { syncSubscription } from '@/lib/fulfillment';
import { formatDate } from '@/lib/money';

export const runtime = 'nodejs';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Upgrades (new monthly total is higher) take effect now, with a prorated
 * charge for the rest of the month. Downgrades (lower total) take effect on
 * the next billing date, so nobody pays for a month they lose part of.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return fail('Please log in.', 401);
  const plan = await currentPlan(user.id);
  if (!plan || !['active', 'trialing'].includes(plan.subscription.status)) {
    return fail('Your plan can be changed once your payment is up to date.', 409);
  }

  if (plan.subscription.provider === 'shopify') return NextResponse.json({ error: `Your plan is billed through CES Marketplace. Manage it at ${shopifyAccountUrl()}`, url: shopifyAccountUrl() }, { status: 409 });
  let next;
  try {
    next = await resolveSelection((await req.json().catch(() => ({}))).selection);
  } catch (e) {
    if (e instanceof SelectionError) return fail(e.message);
    throw e;
  }

  // Monthly ↔ yearly switches aren't done here (different billing periods and refund terms).
  const { yearlyPlanOf } = await import('@/lib/yearly-server');
  if ((await yearlyPlanOf(plan.subscription.id)) || next.products.some((p) => p.billing_interval === 'year')) {
    return fail('To switch between monthly and yearly billing, please email us and we will set it up for you.', 409);
  }

  const currentIds = plan.items.map((i) => i.product_id).sort();
  const nextIds = next.products.map((p) => p.id).sort();
  if (JSON.stringify(currentIds) === JSON.stringify(nextIds)) return fail('That is already your plan.');

  const currentTotal = plan.items.reduce((s, i) => s + i.unit_amount_cents, 0);
  const s = stripe();
  const sub = plan.subscription;
  const db = admin();

  // Any earlier pending downgrade is replaced by this change.
  if (sub.stripe_schedule_id) {
    await s.subscriptionSchedules.release(sub.stripe_schedule_id);
    await db.from('subscriptions').update({ stripe_schedule_id: null, pending_product_ids: null, pending_change_at: null }).eq('id', sub.id);
  }

  const order = {
    member_id: user.id,
    kind: 'change',
    product_ids: nextIds,
    items: next.products.map((p) => ({ product_id: p.id, price_cents: p.price_cents, stripe_price_id: p.stripe_price_id })),
    expected_total_cents: next.totalCents,
    stripe_subscription_id: sub.stripe_subscription_id,
  };

  if (next.totalCents > currentTotal) {
    try {
      await s.subscriptions.update(sub.stripe_subscription_id, {
        items: [
          ...plan.items.map((i) => ({ id: i.stripe_subscription_item_id, deleted: true })),
          ...next.products.map((p) => ({ price: p.stripe_price_id!, quantity: 1 })),
        ],
        proration_behavior: 'always_invoice',
        payment_behavior: 'error_if_incomplete',
        cancel_at_period_end: false,
      });
    } catch (e) {
      if (e instanceof Stripe.errors.StripeCardError) return fail('Your card was declined. Update your card in Billing and try again.', 402);
      throw e;
    }
    await db.from('orders').insert({ ...order, status: 'paid', paid_at: new Date().toISOString() });
    await syncSubscription(sub.stripe_subscription_id);
    return NextResponse.json({ ok: true, message: 'Your plan is upgraded. Your new services are in My Services.' });
  }

  // Downgrade at the next billing date via a subscription schedule.
  const schedule = await s.subscriptionSchedules.create({ from_subscription: sub.stripe_subscription_id });
  const phase = schedule.phases[0];
  await s.subscriptionSchedules.update(schedule.id, {
    end_behavior: 'release',
    proration_behavior: 'none',
    phases: [
      {
        start_date: phase.start_date,
        end_date: phase.end_date,
        items: phase.items.map((i) => ({ price: typeof i.price === 'string' ? i.price : i.price.id, quantity: i.quantity ?? 1 })),
        proration_behavior: 'none',
      },
      {
        items: next.products.map((p) => ({ price: p.stripe_price_id!, quantity: 1 })),
        duration: { interval: 'month', interval_count: 1 },
        proration_behavior: 'none',
      },
    ],
    metadata: { source: 'CES Essentials', member_id: user.id },
  });
  const changeAt = new Date(phase.end_date * 1000).toISOString();
  await db
    .from('subscriptions')
    .update({ stripe_schedule_id: schedule.id, pending_product_ids: nextIds, pending_change_at: changeAt })
    .eq('id', sub.id);
  await db.from('orders').insert({ ...order, status: 'paid', paid_at: changeAt });
  return NextResponse.json({ ok: true, message: `Your plan changes on ${formatDate(changeAt)}. You keep everything you have until then.` });
}
