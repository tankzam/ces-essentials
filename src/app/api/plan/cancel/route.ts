import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';
import { currentPlan } from '@/lib/plan';
import { shopifyAccountUrl } from '@/lib/shopify-billing';
import { getMember, syncSubscription } from '@/lib/fulfillment';
import { sendCancellation } from '@/lib/email';
import { formatDate } from '@/lib/money';

export const runtime = 'nodejs';

/** Cancel: no more charges; access continues to the end of the billing month. */
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
  await stripe().subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: true });
  await syncSubscription(sub.stripe_subscription_id);

  const member = await getMember(user.id);
  if (member) await sendCancellation(member, sub.stripe_subscription_id, sub.current_period_end);
  return NextResponse.json({ ok: true, message: `Canceled. You keep access through ${formatDate(sub.current_period_end)}, and you won't be charged again.` });
}
