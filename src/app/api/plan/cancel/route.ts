import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';
import { currentPlan } from '@/lib/plan';
import { shopifyAccountUrl } from '@/lib/shopify-billing';
import { getMember, syncSubscription } from '@/lib/fulfillment';
import { sendCancellation } from '@/lib/email';
import { formatDate, money } from '@/lib/money';
import { quoteFor, refundEarlyCancel } from '@/lib/yearly-server';

export const runtime = 'nodejs';

/**
 * Cancel: no more charges; access continues to the end of the billing period.
 * Yearly plans in their first 3 months: pay the monthly price for the months
 * used, the rest is refunded, and access ends when the last counted month ends.
 */
export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
  const plan = await currentPlan(user.id);
  if (!plan) return NextResponse.json({ error: 'You have no active plan.' }, { status: 409 });
  if (plan.subscription.provider === 'shopify') return NextResponse.json({ error: `Your plan is billed through CES Marketplace. Manage it at ${shopifyAccountUrl()}`, url: shopifyAccountUrl() }, { status: 409 });
  const sub = plan.subscription;

  if (sub.stripe_schedule_id) {
    await stripe().subscriptionSchedules.release(sub.stripe_schedule_id); // drops a pending downgrade
    await admin().from('subscriptions').update({ stripe_schedule_id: null, pending_product_ids: null, pending_change_at: null }).eq('id', sub.id);
  }
  if (sub.early_cancel_at || sub.cancel_at_period_end) return NextResponse.json({ error: 'Your plan is already canceled.' }, { status: 409 });

  const quote = await quoteFor({ ...sub, provider: 'stripe' });
  if (quote?.eligible) {
    const refund = await refundEarlyCancel({ ...sub, provider: 'stripe' }, quote);
    await syncSubscription(sub.stripe_subscription_id);
    const ends = quote.accessUntil.toISOString();
    const m = await getMember(user.id);
    if (m) await sendCancellation(m, sub.stripe_subscription_id, ends, { refundCents: refund, chargedCents: quote.chargedCents, monthsUsed: quote.monthsUsed });
    return NextResponse.json({
      ok: true,
      message: `Canceled. You paid the monthly price for ${quote.monthsUsed} month${quote.monthsUsed === 1 ? '' : 's'}, and ${money(refund)} is being refunded to your card. You keep access through ${formatDate(ends)}.`,
    });
  }

  await stripe().subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: true });
  await syncSubscription(sub.stripe_subscription_id);

  const member = await getMember(user.id);
  if (member) await sendCancellation(member, sub.stripe_subscription_id, sub.current_period_end);
  return NextResponse.json({ ok: true, message: `Canceled. You keep access through ${formatDate(sub.current_period_end)}, and you won't be charged again.` });
}
