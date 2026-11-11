import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';
import { admin } from '@/lib/supabase/admin';
import { allProducts, servicesFor, planLabel, type ProductRow } from '@/lib/catalog';
import { applyEntitlements, getMember, type AccessStatus } from '@/lib/fulfillment';
import { sendAccessPaused, sendCompanyWelcome, sendReceipt, sendWelcome } from '@/lib/email';
import { getSetting } from '@/lib/settings';
import { shopifyGraphql } from '@/lib/shopify';
import { GRACE_PERIOD_MS } from '@/lib/env';
import { MIN_SEATS } from '@/lib/company';

// Shopify (CES Marketplace) as the payment processor.
//
// Checkout: cesessentials.com creates the account, the order and the refund-policy
// record, then sends the buyer to a Shopify cart link with each item on its
// monthly selling plan and the CES order id as a hidden line property.
// Shopify's subscription app bills each month; every paid order (first or
// renewal) arrives as an orders/paid webhook and extends access one month.
// No renewal by the end of the paid month -> 2-day grace -> access pauses.

export type PaymentProvider = 'stripe' | 'shopify';

export async function paymentProvider(): Promise<PaymentProvider> {
  return (await getSetting('payment_provider')) === 'shopify' ? 'shopify' : 'stripe';
}

const storefront = () => (process.env.SHOPIFY_STOREFRONT_URL || 'https://cesmarketplace.com').replace(/\/$/, '');
const numericId = (gid: string) => gid.split('/').pop()!;

// ───────────────────────── Checkout link ─────────────────────────

export class ShopifyNotReady extends Error {}

export function shopifyCheckoutUrl(opts: { orderId: string; products: ProductRow[]; quantity?: number; email: string }): string {
  const params = new URLSearchParams();
  for (const p of opts.products) {
    const row = p as ProductRow & { shopify_variant_id?: string | null; shopify_selling_plan_id?: string | null };
    if (!row.shopify_variant_id || !row.shopify_selling_plan_id) {
      throw new ShopifyNotReady(`${p.name} isn't set up for monthly billing in Shopify yet.`);
    }
    params.append('items[][id]', numericId(row.shopify_variant_id));
    params.append('items[][quantity]', String(opts.quantity ?? 1));
    params.append('items[][selling_plan]', numericId(row.shopify_selling_plan_id));
    params.append('items[][properties][_ces_order]', opts.orderId);
  }
  params.append('return_to', `/checkout?checkout[email]=${encodeURIComponent(opts.email)}`);
  // Empty the cart first so nothing else rides along.
  return `${storefront()}/cart/clear?return_to=${encodeURIComponent(`/cart/add?${params.toString()}`)}`;
}

/** Where members manage or cancel a Shopify subscription and see receipts. */
export const shopifyAccountUrl = () => `${storefront()}/account`;

// ───────────────────────── Webhooks ─────────────────────────

export function verifyShopifyWebhook(rawBody: string, hmacHeader: string | null): boolean {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret || !hmacHeader) return false;
  const digest = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function registerShopifyWebhooks(callbackUrl: string) {
  const topics = ['ORDERS_PAID', 'ORDERS_CANCELLED', 'REFUNDS_CREATE'];
  const out: Record<string, string> = {};
  for (const topic of topics) {
    const r = await shopifyGraphql<{ webhookSubscriptionCreate: { webhookSubscription: { id: string } | null; userErrors: { message: string }[] } }>(
      `mutation($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) { webhookSubscription { id } userErrors { message } }
      }`,
      { topic, sub: { uri: callbackUrl, format: 'JSON' } },
    );
    out[topic] = r.webhookSubscriptionCreate.userErrors.length
      ? `error: ${r.webhookSubscriptionCreate.userErrors.map((e) => e.message).join('; ')}`
      : `ok (${r.webhookSubscriptionCreate.webhookSubscription?.id})`;
  }
  return out;
}

/** Reads the monthly selling plan attached to each CES product (set up in the Shopify Subscriptions app). */
export async function syncShopifySellingPlans() {
  const db = admin();
  const products = (await allProducts()) as (ProductRow & { shopify_product_id?: string | null })[];
  const out: Record<string, string> = {};
  for (const p of products) {
    if (!p.shopify_product_id) {
      out[p.id] = 'no Shopify product';
      continue;
    }
    const r = await shopifyGraphql<{
      product: { sellingPlanGroups: { nodes: { name: string; sellingPlans: { nodes: { id: string; name: string; billingPolicy: { interval?: string; intervalCount?: number } }[] } }[] } } | null;
    }>(
      `query($id: ID!) {
        product(id: $id) {
          sellingPlanGroups(first: 10) {
            nodes { name sellingPlans(first: 10) { nodes { id name billingPolicy { ... on SellingPlanRecurringBillingPolicy { interval intervalCount } } } } }
          }
        }
      }`,
      { id: p.shopify_product_id },
    );
    const plans = r.product?.sellingPlanGroups.nodes.flatMap((g) => g.sellingPlans.nodes) ?? [];
    const monthly = plans.find((pl) => pl.billingPolicy?.interval === 'MONTH' && (pl.billingPolicy.intervalCount ?? 1) === 1);
    await db.from('products').update({ shopify_selling_plan_id: monthly?.id ?? null }).eq('id', p.id);
    out[p.id] = monthly ? `monthly plan "${monthly.name}"` : plans.length ? 'has plans, but none bill every 1 month' : 'no subscription plan attached';
  }
  return out;
}

// ───────────────────────── Paid orders ─────────────────────────

interface ShopifyLine {
  variant_id: number | null;
  quantity: number;
  price: string;
  properties?: { name: string; value: string }[];
  selling_plan_allocation?: unknown;
}
export interface ShopifyOrder {
  id: number;
  name: string;
  email?: string | null;
  contact_email?: string | null;
  customer?: { email?: string | null } | null;
  currency: string;
  total_price: string;
  financial_status?: string;
  cancelled_at?: string | null;
  order_status_url?: string;
  processed_at?: string;
  created_at?: string;
  line_items: ShopifyLine[];
}

const addMonth = (d: Date) => {
  const n = new Date(d);
  n.setUTCMonth(n.getUTCMonth() + 1);
  return n;
};

function accessForPeriod(periodEnd: string | null, now = Date.now()): AccessStatus {
  if (!periodEnd) return 'ended';
  const end = Date.parse(periodEnd);
  if (now <= end) return 'active';
  if (now - end <= GRACE_PERIOD_MS) return 'grace';
  if (now - end <= 30 * 24 * 3600 * 1000) return 'paused';
  return 'ended';
}

/** One paid Shopify order (first purchase or monthly renewal) → one more month of access. */
export async function handleShopifyPaidOrder(order: ShopifyOrder) {
  const db = admin();
  const products = (await allProducts()) as (ProductRow & { shopify_variant_id?: string | null })[];
  const byVariant = new Map(products.filter((p) => p.shopify_variant_id).map((p) => [numericId(p.shopify_variant_id!), p]));

  // Only CES Essentials lines; the store may sell other things too.
  const lines = order.line_items.filter((l) => l.variant_id && byVariant.has(String(l.variant_id)));
  if (lines.length === 0) return { skipped: 'no CES Essentials items' };

  // Price check against the products table before anything turns on.
  const verified: ProductRow[] = [];
  let quantity = 1;
  for (const l of lines) {
    const p = byVariant.get(String(l.variant_id))!;
    const priceOk = Math.round(parseFloat(l.price) * 100) === p.price_cents && order.currency === 'USD';
    const qtyOk = p.kind === 'company_package' ? l.quantity >= MIN_SEATS : l.quantity === 1;
    if (!priceOk || !qtyOk) throw new Error(`Order ${order.name}: ${p.id} charged ${l.price} x${l.quantity}, expected ${(p.price_cents / 100).toFixed(2)}`);
    verified.push(p);
    if (p.kind === 'company_package') quantity = l.quantity;
  }

  // Which CES order / member is this?
  const cesOrderId = lines.flatMap((l) => l.properties ?? []).find((pr) => pr.name === '_ces_order')?.value;
  const email = (order.email || order.contact_email || order.customer?.email || '').toLowerCase();
  let memberId: string | null = null;
  let orgId: string | null = null;
  let firstOrder = false;

  if (cesOrderId) {
    const { data: o } = await db.from('orders').select('*').eq('id', cesOrderId).maybeSingle();
    if (!o) throw new Error(`Order ${order.name}: CES order ${cesOrderId} not found`);
    const expected = [...(o.product_ids as string[])].sort().join(',');
    const got = verified.map((p) => p.id).sort().join(',');
    if (expected !== got) {
      await db.from('orders').update({ status: 'amount_mismatch', shopify_order_id: String(order.id) }).eq('id', o.id);
      throw new Error(`Order ${order.name}: items ${got} don't match CES order (${expected})`);
    }
    memberId = o.member_id;
    orgId = o.organization_id;
    firstOrder = o.status !== 'paid';
    if (firstOrder) {
      await db.from('orders').update({ status: 'paid', paid_at: new Date().toISOString(), shopify_order_id: String(order.id), provider: 'shopify' }).eq('id', o.id);
    }
  } else {
    // Renewal: match by the buyer's email.
    const { data: prof } = await db.from('profiles').select('id').eq('email', email).maybeSingle();
    if (!prof) throw new Error(`Order ${order.name}: no CES account for ${email || 'unknown email'}`);
    memberId = prof.id;
    const { data: hr } = await db.from('organizations').select('id').eq('hr_profile_id', prof.id).maybeSingle();
    if (verified.some((p) => p.kind === 'company_package') && hr) orgId = hr.id;
  }

  // The member's (or company's) Shopify subscription record: extend one month.
  const key = orgId ? `shopify:org:${orgId}` : `shopify:member:${memberId}`;
  const { data: existing } = await db.from('subscriptions').select('id, current_period_end').eq('stripe_subscription_id', key).maybeSingle();
  const from = existing?.current_period_end && Date.parse(existing.current_period_end) > Date.now() ? new Date(existing.current_period_end) : new Date();
  const periodEnd = addMonth(from).toISOString();
  const { data: sub, error } = await db
    .from('subscriptions')
    .upsert(
      {
        stripe_subscription_id: key,
        provider: 'shopify',
        member_id: orgId ? null : memberId,
        organization_id: orgId,
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: periodEnd,
        cancel_at_period_end: false,
        past_due_since: null,
        access_paused_at: null,
        ended_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'stripe_subscription_id' },
    )
    .select('id')
    .single();
  if (error) throw error;

  await db.from('subscription_items').delete().eq('subscription_id', sub.id);
  await db.from('subscription_items').insert(
    verified.map((p, i) => ({
      subscription_id: sub.id,
      product_id: p.id,
      stripe_subscription_item_id: `shopify:${order.id}:${i}`,
      unit_amount_cents: p.price_cents,
      quantity: p.kind === 'company_package' ? quantity : 1,
      price_verified: true,
    })),
  );
  if (orgId) await db.from('organizations').update({ plan_product_id: verified[0].id, status: 'active' }).eq('id', orgId);

  const description = verified.map((p) => `${quantity > 1 && p.kind === 'company_package' ? `${quantity} × ` : ''}CES Essentials — ${p.name}`).join(', ');
  const amountCents = Math.round(parseFloat(order.total_price) * 100);
  const paidAt = order.processed_at || order.created_at || new Date().toISOString();
  await db.from('invoices').upsert(
    {
      stripe_invoice_id: `shopify:${order.id}`,
      member_id: memberId,
      organization_id: orgId,
      subscription_id: sub.id,
      amount_due_cents: amountCents,
      amount_paid_cents: amountCents,
      currency: 'usd',
      status: 'paid',
      description,
      hosted_invoice_url: order.order_status_url ?? null,
      paid_at: paidAt,
      quantity: orgId ? quantity : null,
    },
    { onConflict: 'stripe_invoice_id' },
  );

  await refreshShopifySubscription(sub.id);

  // Emails (each is sent once, however often Shopify retries).
  const member = memberId ? await getMember(memberId) : null;
  if (member) {
    if (orgId) {
      if (firstOrder) await sendCompanyWelcome({ id: member.id, email: member.email, name: member.full_name }, verified[0].name, quantity);
      await db.from('business_requests').update({ status: 'signed_up' }).eq('organization_id', orgId);
    } else if (firstOrder) {
      await sendWelcome({ id: member.id, email: member.email, name: member.full_name }, planLabel(verified));
    }
    await sendReceipt(member, { id: `shopify:${order.id}`, amountCents, paidAt, description, hostedUrl: order.order_status_url ?? null });
  }
  return { ok: true, subscription: key, paidThrough: periodEnd };
}

/** Cancelled or fully refunded order: that month of access ends now. */
export async function handleShopifyOrderVoided(orderId: number) {
  const db = admin();
  const { data: inv } = await db.from('invoices').select('subscription_id').eq('stripe_invoice_id', `shopify:${orderId}`).maybeSingle();
  if (!inv?.subscription_id) return { skipped: 'not a CES Essentials order' };
  await db.from('invoices').update({ status: 'void' }).eq('stripe_invoice_id', `shopify:${orderId}`);
  await db.from('subscriptions').update({ current_period_end: new Date(Date.now() - GRACE_PERIOD_MS - 1000).toISOString() }).eq('id', inv.subscription_id);
  await refreshShopifySubscription(inv.subscription_id);
  return { ok: true };
}

/** Applies access for a Shopify subscription from its paid-through date. */
export async function refreshShopifySubscription(subscriptionRowId: string) {
  const db = admin();
  const { data: sub } = await db.from('subscriptions').select('*').eq('id', subscriptionRowId).single();
  if (!sub || sub.provider !== 'shopify') return;
  const access = accessForPeriod(sub.current_period_end);
  const status = access === 'active' ? 'active' : access === 'ended' ? 'canceled' : 'past_due';
  const pastDueSince = access === 'active' ? null : sub.current_period_end;
  const pausedNow = access === 'paused' && !sub.access_paused_at;
  await db
    .from('subscriptions')
    .update({
      status,
      past_due_since: pastDueSince,
      access_paused_at: access === 'paused' ? (sub.access_paused_at ?? new Date().toISOString()) : null,
      ended_at: access === 'ended' ? (sub.ended_at ?? new Date().toISOString()) : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sub.id);

  const { data: items } = await db.from('subscription_items').select('product_id').eq('subscription_id', sub.id);
  const products = (await allProducts()).filter((p) => (items ?? []).some((i) => i.product_id === p.id));
  const wanted = access === 'ended' ? [] : servicesFor(products);
  const scope = { subscriptionRowId: sub.id as string, source: (sub.organization_id ? 'organization' : 'subscription') as 'organization' | 'subscription', organizationId: sub.organization_id as string | null };

  if (sub.member_id) {
    const m = await getMember(sub.member_id);
    if (m) {
      await applyEntitlements(m, scope, wanted, access);
      if (pausedNow && pastDueSince) await sendAccessPaused(m, pastDueSince);
    }
  } else if (sub.organization_id) {
    const { data: people } = await db.from('organization_members').select('profile_id, status, remove_at').eq('organization_id', sub.organization_id).eq('role', 'employee');
    for (const person of people ?? []) {
      const m = await getMember(person.profile_id);
      if (!m) continue;
      const gone = person.status === 'removed' || (person.status === 'removing' && person.remove_at && Date.parse(person.remove_at) <= Date.now());
      if (gone && person.status !== 'removed') {
        await db.from('organization_members').update({ status: 'removed', removed_at: new Date().toISOString() }).eq('organization_id', sub.organization_id).eq('profile_id', person.profile_id);
      }
      await applyEntitlements(m, scope, gone ? [] : wanted, access);
    }
    if (pausedNow && pastDueSince) {
      const { data: org } = await db.from('organizations').select('hr_profile_id').eq('id', sub.organization_id).single();
      const hr = org?.hr_profile_id ? await getMember(org.hr_profile_id) : null;
      if (hr) await sendAccessPaused(hr, pastDueSince);
    }
  }
}

/** Daily: Shopify subscriptions whose month ran out without a renewal. */
export async function refreshAllShopifySubscriptions() {
  const { data } = await admin().from('subscriptions').select('id').eq('provider', 'shopify').neq('status', 'canceled');
  for (const s of data ?? []) await refreshShopifySubscription(s.id);
  return data?.length ?? 0;
}
