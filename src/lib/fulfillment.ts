import 'server-only';
import type Stripe from 'stripe';
import { admin } from '@/lib/supabase/admin';
import { stripe, idOf, toDate } from '@/lib/stripe';
import { allProducts, servicesFor, type ProductRow } from '@/lib/catalog';
import { getSettings } from '@/lib/settings';
import { GRACE_PERIOD_MS, STRIPE_SOURCE } from '@/lib/env';
import { sendAccessPaused, sendCodePoolAlert, sendServiceSetup, type SetupInfo } from '@/lib/email';

export type AccessStatus = 'active' | 'grace' | 'paused' | 'ended';

export interface Member {
  id: string;
  email: string;
  full_name: string;
  stripe_customer_id: string | null;
}

export async function getMember(id: string): Promise<Member | null> {
  const { data } = await admin().from('profiles').select('id, email, full_name, stripe_customer_id').eq('id', id).maybeSingle();
  return data;
}

/** Access level for a Stripe subscription status, applying the 2-day grace period. */
export function accessFor(status: string, pastDueSince: string | null, now = Date.now()): AccessStatus {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due': {
      const since = pastDueSince ? Date.parse(pastDueSince) : now;
      return now - since <= GRACE_PERIOD_MS ? 'grace' : 'paused';
    }
    case 'canceled':
    case 'incomplete_expired':
      return 'ended';
    default: // unpaid, paused, incomplete
      return 'paused';
  }
}

/** Entitlement status as of right now (a 'grace' row may have run out since it was written). */
export function effectiveStatus(e: { status: AccessStatus }, sub: { past_due_since: string | null } | null): AccessStatus {
  if (e.status === 'grace' && sub?.past_due_since && Date.now() - Date.parse(sub.past_due_since) > GRACE_PERIOD_MS) {
    return 'paused';
  }
  return e.status;
}

export const hasAccess = (s: AccessStatus) => s === 'active' || s === 'grace';

function periodOf(sub: Stripe.Subscription) {
  const items = sub.items.data;
  const starts = items.map((i) => i.current_period_start).filter(Boolean);
  const ends = items.map((i) => i.current_period_end).filter(Boolean);
  return {
    start: toDate(starts.length ? Math.min(...starts) : null),
    end: toDate(ends.length ? Math.min(...ends) : null),
  };
}

/**
 * Mirrors a Stripe subscription into Supabase and recalculates the member's
 * entitlements. Safe to call any number of times for the same subscription.
 *
 * Nothing is turned on unless (a) a checkout order for this subscription was
 * paid with the amount the server expected, and (b) each item's Stripe price
 * matches the price in the products table.
 */
export async function syncSubscription(stripeSubscriptionId: string): Promise<void> {
  const sub = await stripe().subscriptions.retrieve(stripeSubscriptionId, { expand: ['items.data.price'] });
  if (sub.metadata?.source !== STRIPE_SOURCE) return;

  const db = admin();
  const memberId = sub.metadata.member_id;
  const member = memberId ? await getMember(memberId) : null;
  if (!member) throw new Error(`No member for subscription ${sub.id}`);

  const { data: existing } = await db
    .from('subscriptions')
    .select('id, past_due_since, access_paused_at, pending_change_at')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle();

  // Grace period clock: starts at the first failure, clears once paid.
  let pastDueSince: string | null = existing?.past_due_since ?? null;
  if (sub.status === 'past_due' || sub.status === 'unpaid') pastDueSince ??= new Date().toISOString();
  else pastDueSince = null;

  const access = accessFor(sub.status, pastDueSince);
  const period = periodOf(sub);
  const scheduleId = idOf(sub.schedule);

  const row = {
    member_id: member.id,
    stripe_subscription_id: sub.id,
    stripe_schedule_id: scheduleId,
    status: sub.status,
    current_period_start: period.start,
    current_period_end: period.end,
    cancel_at_period_end: sub.cancel_at_period_end || !!sub.cancel_at,
    canceled_at: toDate(sub.canceled_at),
    ended_at: toDate(sub.ended_at),
    past_due_since: pastDueSince,
    access_paused_at: access === 'paused' ? (existing?.access_paused_at ?? new Date().toISOString()) : null,
    updated_at: new Date().toISOString(),
    // A pending downgrade is shown until it takes effect.
    ...(!scheduleId || (existing?.pending_change_at && Date.parse(existing.pending_change_at) <= Date.now())
      ? { pending_product_ids: null, pending_change_at: null }
      : {}),
  };
  const { data: saved, error } = await db
    .from('subscriptions')
    .upsert(row, { onConflict: 'stripe_subscription_id' })
    .select('id')
    .single();
  if (error) throw error;
  const subscriptionRowId = saved.id as string;

  // Items, with price verification against the products table.
  const products = await allProducts();
  const byPrice = new Map(products.filter((p) => p.stripe_price_id).map((p) => [p.stripe_price_id!, p]));
  const verified: ProductRow[] = [];
  const itemRows = sub.items.data.flatMap((item) => {
    const price = item.price as Stripe.Price;
    const product = byPrice.get(price.id);
    if (!product) return [];
    const ok =
      price.unit_amount === product.price_cents &&
      price.currency === product.currency &&
      price.recurring?.interval === 'month' &&
      (item.quantity ?? 1) === 1;
    if (ok) verified.push(product);
    return [{
      subscription_id: subscriptionRowId,
      product_id: product.id,
      stripe_subscription_item_id: item.id,
      unit_amount_cents: price.unit_amount ?? 0,
      price_verified: ok,
    }];
  });
  await db.from('subscription_items').delete().eq('subscription_id', subscriptionRowId);
  if (itemRows.length) {
    const { error: itemsError } = await db.from('subscription_items').insert(itemRows);
    if (itemsError) throw itemsError;
  }

  const { count: paidOrders } = await db
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('stripe_subscription_id', sub.id)
    .eq('status', 'paid');
  const approved = (paidOrders ?? 0) > 0;

  const wanted = approved ? servicesFor(verified) : [];
  await applyEntitlements(member, subscriptionRowId, wanted, access);

  if (access === 'paused' && !existing?.access_paused_at && pastDueSince) {
    await sendAccessPaused(member, pastDueSince);
  }
}

async function applyEntitlements(member: Member, subscriptionRowId: string, wanted: string[], access: AccessStatus) {
  const db = admin();
  const now = new Date();
  const [{ data: current }, { data: services }] = await Promise.all([
    db.from('entitlements').select('service_id, status, subscription_id').eq('member_id', member.id),
    db.from('services').select('id, activation_delay_hours'),
  ]);
  const delay = new Map((services ?? []).map((s) => [s.id as string, s.activation_delay_hours as number]));
  const currentMap = new Map((current ?? []).map((e) => [e.service_id as string, e]));

  const newlyOn: string[] = [];
  for (const serviceId of wanted) {
    const prev = currentMap.get(serviceId);
    const startingFresh = !prev || prev.status === 'ended' || prev.subscription_id !== subscriptionRowId;
    const update: Record<string, unknown> = {
      member_id: member.id,
      service_id: serviceId,
      subscription_id: subscriptionRowId,
      status: access,
      ends_at: access === 'ended' ? now.toISOString() : null,
      updated_at: now.toISOString(),
    };
    if (startingFresh) {
      update.starts_at = now.toISOString();
      update.available_at = new Date(now.getTime() + (delay.get(serviceId) ?? 0) * 3600_000).toISOString();
      if (hasAccess(access)) newlyOn.push(serviceId);
    }
    const { error } = await db.from('entitlements').upsert(update, { onConflict: 'member_id,service_id' });
    if (error) throw error;
  }

  // Services this subscription no longer includes (downgrade took effect, or cancellation ended).
  const dropped = (current ?? [])
    .filter((e) => e.subscription_id === subscriptionRowId && e.status !== 'ended' && !wanted.includes(e.service_id as string))
    .map((e) => e.service_id as string);
  if (dropped.length) {
    await db
      .from('entitlements')
      .update({ status: 'ended', ends_at: now.toISOString(), updated_at: now.toISOString() })
      .eq('member_id', member.id)
      .eq('subscription_id', subscriptionRowId)
      .in('service_id', dropped);
  }

  for (const serviceId of newlyOn) {
    await fulfill(member, serviceId, subscriptionRowId);
  }
}

/** Codes, links and setup steps for one service (used by emails and My Services). */
export async function setupInfo(serviceId: string, memberId: string, opts: { assignCode: boolean }): Promise<SetupInfo & { waitingForCode?: boolean }> {
  const db = admin();
  const { data: s } = await db
    .from('services')
    .select('id, name, setup_steps, code_type, code_setting_key, open_url_setting_key, providers(*)')
    .eq('id', serviceId)
    .single();
  if (!s) throw new Error(`Unknown service ${serviceId}`);
  const provider = (Array.isArray(s.providers) ? s.providers[0] : s.providers) as {
    name: string; website_url: string | null; app_store_url: string | null; play_store_url: string | null; support_email: string | null;
  } | null;
  const settings = await getSettings([s.code_setting_key, s.open_url_setting_key].filter(Boolean) as string[]);

  const info: SetupInfo & { waitingForCode?: boolean } = {
    serviceId: s.id,
    serviceName: s.name,
    steps: s.setup_steps as string[],
    links: [],
  };

  if (s.code_type === 'pooled') {
    info.codeLabel = 'Your activation code';
    if (opts.assignCode) {
      info.code = await assignCode(memberId, serviceId);
    } else {
      const { data } = await db.from('activation_codes').select('code').eq('service_id', serviceId).eq('assigned_to', memberId).maybeSingle();
      info.code = data?.code ?? null;
    }
    info.waitingForCode = !info.code;
  } else if (s.code_type === 'shared_setting' && s.code_setting_key) {
    info.code = settings[s.code_setting_key] || null;
    info.codeLabel = serviceId === 'healthcare' ? 'Your group code' : 'Company code';
  }

  if (provider?.app_store_url) info.links!.push({ href: provider.app_store_url, label: 'Download on the App Store' });
  if (provider?.play_store_url) info.links!.push({ href: provider.play_store_url, label: 'Get it on Google Play' });
  if (provider?.website_url) info.links!.push({ href: provider.website_url, label: `Go to ${provider.name}` });
  if (s.open_url_setting_key && settings[s.open_url_setting_key]) {
    info.links!.push({ href: settings[s.open_url_setting_key], label: serviceId === 'credit_vpn' ? 'Activate with provider' : `Open ${s.name}` });
  }
  if (serviceId === 'legal_tax') {
    info.extraHtml = '<p><strong>Your account takes 24 to 48 hours to become active.</strong> If the site doesn’t recognize you yet, try again after 48 hours.</p>';
  }
  if (provider?.support_email) {
    info.extraHtml = `${info.extraHtml ?? ''}<p>Need help? Email <a href="mailto:${provider.support_email}">${provider.support_email}</a>.</p>`;
  }
  return info;
}

/** The member's own code (returning members get the same one back); alerts the admin when the pool runs low. */
export async function assignCode(memberId: string, serviceId = 'credit_vpn'): Promise<string | null> {
  const db = admin();
  const { data: code, error } = await db.rpc('assign_activation_code', { p_member: memberId, p_service: serviceId });
  if (error) throw error;

  const { count } = await db
    .from('activation_codes')
    .select('id', { count: 'exact', head: true })
    .eq('service_id', serviceId)
    .is('assigned_to', null);
  const settings = await getSettings(['code_pool_alert_email', 'code_pool_alert_threshold']);
  const threshold = Number(settings.code_pool_alert_threshold || 25);
  if (settings.code_pool_alert_email && (count ?? 0) < threshold) {
    try {
      await sendCodePoolAlert(settings.code_pool_alert_email, count ?? 0, threshold);
    } catch (e) {
      console.error('code pool alert failed', e);
    }
  }
  return (code as string | null) ?? null;
}

/** Runs once when a service turns on: assigns any code and sends the setup email. */
async function fulfill(member: Member, serviceId: string, subscriptionRowId: string) {
  const info = await setupInfo(serviceId, member.id, { assignCode: true });
  if (info.waitingForCode) return; // the daily job emails it once codes are uploaded
  await sendServiceSetup(member, info, subscriptionRowId);
}

/** Daily job: deliver codes to members who were waiting on an empty pool. */
export async function deliverWaitingCodes() {
  const db = admin();
  const { data: rows } = await db
    .from('entitlements')
    .select('member_id, subscription_id, status')
    .eq('service_id', 'credit_vpn')
    .in('status', ['active', 'grace']);
  for (const e of rows ?? []) {
    const { data: has } = await db.from('activation_codes').select('id').eq('assigned_to', e.member_id).maybeSingle();
    if (has) continue;
    const member = await getMember(e.member_id);
    if (!member) continue;
    const info = await setupInfo('credit_vpn', member.id, { assignCode: true });
    if (info.code) await sendServiceSetup(member, info, e.subscription_id);
  }
}
