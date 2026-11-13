import 'server-only';
import type Stripe from 'stripe';
import { admin } from '@/lib/supabase/admin';
import { stripe, idOf, toDate } from '@/lib/stripe';
import { allProducts, servicesFor, type ProductRow } from '@/lib/catalog';
import { getSettings } from '@/lib/settings';
import { GRACE_PERIOD_MS, STRIPE_SOURCE } from '@/lib/env';
import { MIN_SEATS } from '@/lib/company';
import { sendAccessPaused, sendCodePoolAlert, sendServiceSetup, type SetupInfo } from '@/lib/email';

export type AccessStatus = 'active' | 'grace' | 'paused' | 'ended';

export interface Member {
  id: string;
  email: string;
  full_name: string;
  stripe_customer_id: string | null;
  access_disabled: boolean;
}

export async function getMember(id: string): Promise<Member | null> {
  const { data } = await admin().from('profiles').select('id, email, full_name, stripe_customer_id, access_disabled').eq('id', id).maybeSingle();
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
 * Mirrors a Stripe subscription into Supabase and recalculates entitlements —
 * for the member (individual plan) or for every employee (company plan).
 * Safe to call any number of times for the same subscription.
 *
 * Nothing is turned on unless (a) a checkout order for this subscription was
 * paid with the amount the server expected, and (b) each item's Stripe price
 * matches the price in the products table.
 */
export async function syncSubscription(stripeSubscriptionId: string): Promise<void> {
  const sub = await stripe().subscriptions.retrieve(stripeSubscriptionId, { expand: ['items.data.price'] });
  if (sub.metadata?.source !== STRIPE_SOURCE) return;

  const db = admin();
  const orgId = sub.metadata.organization_id || null;
  const member = !orgId && sub.metadata.member_id ? await getMember(sub.metadata.member_id) : null;
  if (!orgId && !member) throw new Error(`No member or company for subscription ${sub.id}`);

  const { data: existing } = await db
    .from('subscriptions')
    .select('id, past_due_since, access_paused_at, pending_change_at, keep_product_ids, keep_until')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle();

  // Grace period clock: starts at the first failure, clears once paid.
  let pastDueSince: string | null = existing?.past_due_since ?? null;
  if (sub.status === 'past_due' || sub.status === 'unpaid') pastDueSince ??= new Date().toISOString();
  else pastDueSince = null;

  const access = accessFor(sub.status, pastDueSince);
  const period = periodOf(sub);
  const scheduleId = idOf(sub.schedule);
  const keepActive = existing?.keep_until && Date.parse(existing.keep_until) > Date.now();

  const row = {
    member_id: member?.id ?? null,
    organization_id: orgId,
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
    ...(keepActive ? {} : { keep_product_ids: null, keep_until: null }),
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
    const qty = item.quantity ?? 1;
    const ok =
      price.unit_amount === product.price_cents &&
      price.currency === product.currency &&
      price.recurring?.interval === (product.billing_interval ?? 'month') &&
      (orgId ? product.kind === 'company_package' && qty >= MIN_SEATS : product.kind !== 'company_package' && qty === 1);
    if (ok) verified.push(product);
    return [{
      subscription_id: subscriptionRowId,
      product_id: product.id,
      stripe_subscription_item_id: item.id,
      unit_amount_cents: price.unit_amount ?? 0,
      quantity: qty,
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

  let granted = verified;
  if (keepActive && existing?.keep_product_ids?.length) {
    granted = [...verified, ...products.filter((p) => existing.keep_product_ids.includes(p.id))];
  }
  const wanted = approved ? servicesFor(granted) : [];
  const scope: Scope = { subscriptionRowId, source: orgId ? 'organization' : 'subscription', organizationId: orgId };

  if (member) {
    await applyEntitlements(member, scope, wanted, access);
    if (access === 'paused' && !existing?.access_paused_at && pastDueSince) await sendAccessPaused(member, pastDueSince);
    return;
  }

  // Company plan: every current employee gets the plan; removed ones lose it.
  if (orgId) {
    await db.from('organizations').update({ plan_product_id: verified[0]?.id ?? null }).eq('id', orgId);
    const now = Date.now();
    const { data: people } = await db
      .from('organization_members')
      .select('profile_id, status, remove_at')
      .eq('organization_id', orgId)
      .eq('role', 'employee');
    for (const person of people ?? []) {
      const p = await getMember(person.profile_id);
      if (!p) continue;
      const gone = person.status === 'removed' || (person.status === 'removing' && person.remove_at && Date.parse(person.remove_at) <= now);
      if (gone && person.status !== 'removed') {
        await db
          .from('organization_members')
          .update({ status: 'removed', removed_at: new Date().toISOString() })
          .eq('organization_id', orgId)
          .eq('profile_id', person.profile_id);
      }
      await applyEntitlements(p, scope, gone ? [] : wanted, access);
    }
    if (access === 'paused' && !existing?.access_paused_at && pastDueSince) {
      const { data: org } = await db.from('organizations').select('hr_profile_id').eq('id', orgId).single();
      const hr = org?.hr_profile_id ? await getMember(org.hr_profile_id) : null;
      if (hr) await sendAccessPaused(hr, pastDueSince);
    }
  }
}

export interface Scope {
  subscriptionRowId: string | null; // null for manual (admin) grants
  source: 'subscription' | 'organization' | 'manual';
  organizationId: string | null;
}

const sameScope = (e: { subscription_id: string | null; source: string }, s: Scope) =>
  (e.subscription_id ?? null) === s.subscriptionRowId && e.source === s.source;

/**
 * Sets one member's entitlements for one source (a subscription, a company
 * plan, or an admin grant). A service the member already gets from another
 * active source is left alone.
 */
export async function applyEntitlements(member: Member, scope: Scope, wanted: string[], subAccess: AccessStatus) {
  const db = admin();
  const now = new Date();
  const access: AccessStatus = member.access_disabled && subAccess !== 'ended' ? 'paused' : subAccess;
  const [{ data: current }, { data: services }] = await Promise.all([
    db.from('entitlements').select('service_id, status, subscription_id, source').eq('member_id', member.id),
    db.from('services').select('id, activation_delay_hours'),
  ]);
  const delay = new Map((services ?? []).map((s) => [s.id as string, s.activation_delay_hours as number]));
  const currentMap = new Map((current ?? []).map((e) => [e.service_id as string, e]));

  const newlyOn: string[] = [];
  for (const serviceId of wanted) {
    const prev = currentMap.get(serviceId);
    if (prev && !sameScope(prev, scope) && (prev.status === 'active' || prev.status === 'grace')) continue;
    const startingFresh = !prev || prev.status === 'ended' || !sameScope(prev, scope);
    const update: Record<string, unknown> = {
      member_id: member.id,
      service_id: serviceId,
      subscription_id: scope.subscriptionRowId,
      source: scope.source,
      organization_id: scope.organizationId,
      status: access,
      ends_at: access === 'ended' ? now.toISOString() : null,
      updated_at: now.toISOString(),
    };
    if (startingFresh) {
      update.starts_at = now.toISOString();
      update.available_at = new Date(now.getTime() + (delay.get(serviceId) ?? 0) * 3600_000).toISOString();
    }
    // Every service this source turns on gets its setup email. Sending is idempotent (email_log),
    // so a retry after a failed email sends what's missing and nothing twice.
    if (hasAccess(access)) newlyOn.push(serviceId);
    const { error } = await db.from('entitlements').upsert(update, { onConflict: 'member_id,service_id' });
    if (error) throw error;
  }

  // Services this source no longer includes (downgrade, cancellation, removal).
  const dropped = (current ?? [])
    .filter((e) => sameScope(e, scope) && e.status !== 'ended' && !wanted.includes(e.service_id as string))
    .map((e) => e.service_id as string);
  if (dropped.length) {
    let q = db
      .from('entitlements')
      .update({ status: 'ended', ends_at: now.toISOString(), updated_at: now.toISOString() })
      .eq('member_id', member.id)
      .eq('source', scope.source)
      .in('service_id', dropped);
    q = scope.subscriptionRowId ? q.eq('subscription_id', scope.subscriptionRowId) : q.is('subscription_id', null);
    await q;
  }

  for (const serviceId of newlyOn) {
    await fulfill(member, serviceId, scope.subscriptionRowId ?? 'manual');
  }
}

/** Re-applies a member's access after an admin activates or deactivates them. */
export async function resyncMember(memberId: string) {
  const db = admin();
  const member = await getMember(memberId);
  if (!member) return;
  const { data: subs } = await db
    .from('subscriptions')
    .select('id, stripe_subscription_id, provider')
    .eq('member_id', memberId)
    .not('status', 'in', '(canceled,incomplete_expired)');
  const { refreshShopifySubscription } = await import('@/lib/shopify-billing');
  for (const s of subs ?? []) {
    if (s.provider === 'shopify') await refreshShopifySubscription(s.id);
    else await syncSubscription(s.stripe_subscription_id);
  }
  const { data: orgLinks } = await db
    .from('organization_members')
    .select('organization_id')
    .eq('profile_id', memberId)
    .eq('role', 'employee');
  for (const o of orgLinks ?? []) {
    const { data: orgSub } = await db
      .from('subscriptions')
      .select('id, stripe_subscription_id, provider')
      .eq('organization_id', o.organization_id)
      .not('status', 'in', '(canceled,incomplete_expired)')
      .maybeSingle();
    if (orgSub?.provider === 'shopify') await refreshShopifySubscription(orgSub.id);
    else if (orgSub) await syncSubscription(orgSub.stripe_subscription_id);
  }
  const { data: manual } = await db
    .from('entitlements')
    .select('service_id, status')
    .eq('member_id', memberId)
    .eq('source', 'manual')
    .neq('status', 'ended');
  if (manual?.length) {
    await applyEntitlements(member, { subscriptionRowId: null, source: 'manual', organizationId: null }, manual.map((m) => m.service_id), 'active');
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
  if (provider?.website_url) info.links!.push({ href: provider.website_url, label: serviceId === 'discount_club' ? 'Go to CES Discount Club' : `Go to ${provider.name}` });
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
    .is('assigned_to', null).eq('retired', false);
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
async function fulfill(member: Member, serviceId: string, keySuffix: string) {
  const info = await setupInfo(serviceId, member.id, { assignCode: true });
  if (info.waitingForCode) return; // the daily job emails it once codes are uploaded
  await sendServiceSetup(member, info, keySuffix);
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
    if (info.code) await sendServiceSetup(member, info, e.subscription_id ?? 'manual');
  }
}
