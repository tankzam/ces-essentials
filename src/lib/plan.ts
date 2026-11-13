import 'server-only';
import { admin } from '@/lib/supabase/admin';

export interface PlanState {
  subscription: {
    id: string;
    stripe_subscription_id: string;
    stripe_schedule_id: string | null;
    status: string;
    current_period_start: string | null;
    current_period_end: string | null;
    early_cancel_at: string | null;
    early_cancel_refund_cents: number | null;
    cancel_at_period_end: boolean;
    past_due_since: string | null;
    pending_product_ids: string[] | null;
    pending_change_at: string | null;
    provider: 'stripe' | 'shopify';
  };
  items: { product_id: string; stripe_subscription_item_id: string; unit_amount_cents: number; price_verified: boolean }[];
}

/** The member's current (not ended) subscription, if any. */
export async function currentPlan(memberId: string): Promise<PlanState | null> {
  const db = admin();
  const { data: subscription } = await db
    .from('subscriptions')
    .select('id, stripe_subscription_id, stripe_schedule_id, status, current_period_start, current_period_end, early_cancel_at, early_cancel_refund_cents, cancel_at_period_end, past_due_since, pending_product_ids, pending_change_at, provider')
    .eq('member_id', memberId)
    .not('status', 'in', '(canceled,incomplete_expired)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!subscription) return null;
  const { data: items } = await db
    .from('subscription_items')
    .select('product_id, stripe_subscription_item_id, unit_amount_cents, price_verified')
    .eq('subscription_id', subscription.id);
  return { subscription, items: items ?? [] };
}
