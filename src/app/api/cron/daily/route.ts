import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { env, GRACE_PERIOD_MS } from '@/lib/env';
import { deliverWaitingCodes, syncSubscription } from '@/lib/fulfillment';
import { finishRemovals } from '@/lib/hr';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Vercel Cron. Backup for missed webhooks: pauses access once the 2-day grace
 * period is over, and emails codes to members who waited on an empty pool.
 * (Access checks also apply the grace period live, so nobody keeps access
 * between runs.)
 */
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${env.cronSecret()}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const cutoff = new Date(Date.now() - GRACE_PERIOD_MS).toISOString();
  const { data: overdue } = await admin()
    .from('subscriptions')
    .select('stripe_subscription_id')
    .lt('past_due_since', cutoff)
    .is('access_paused_at', null);

  const errors: string[] = [];
  for (const s of overdue ?? []) {
    try {
      await syncSubscription(s.stripe_subscription_id);
    } catch (e) {
      errors.push(`${s.stripe_subscription_id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  try {
    await finishRemovals(); // employees whose last paid month has ended
  } catch (e) {
    errors.push(`removals: ${e instanceof Error ? e.message : e}`);
  }
  try {
    await deliverWaitingCodes();
  } catch (e) {
    errors.push(`codes: ${e instanceof Error ? e.message : e}`);
  }
  return NextResponse.json({ paused_checked: overdue?.length ?? 0, errors });
}
