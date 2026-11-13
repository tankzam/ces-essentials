import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';
import { currentPlan } from '@/lib/plan';
import { shopifyAccountUrl } from '@/lib/shopify-billing';
import { syncSubscription } from '@/lib/fulfillment';

export const runtime = 'nodejs';

/** "Keep my plan" after cancelling, any time before access ends. */
export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
  const plan = await currentPlan(user.id);
  if (!plan || !plan.subscription.cancel_at_period_end) {
    return NextResponse.json({ error: 'There is no cancellation to undo.' }, { status: 409 });
  }
  if (plan.subscription.early_cancel_at) {
    return NextResponse.json({ error: 'This plan was canceled with a refund, so it can’t be restarted. You can buy a new plan any time from the home page.' }, { status: 409 });
  }
  if (plan.subscription.provider === 'shopify') return NextResponse.json({ error: `Your plan is billed through CES Marketplace. Manage it at ${shopifyAccountUrl()}`, url: shopifyAccountUrl() }, { status: 409 });
  await stripe().subscriptions.update(plan.subscription.stripe_subscription_id, { cancel_at_period_end: false });
  await syncSubscription(plan.subscription.stripe_subscription_id);
  return NextResponse.json({ ok: true, message: 'Your plan will keep renewing as usual.' });
}
