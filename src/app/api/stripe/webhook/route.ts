import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe, idOf, toDate } from '@/lib/stripe';
import { env, STRIPE_SOURCE } from '@/lib/env';
import { admin } from '@/lib/supabase/admin';
import { getMember, syncSubscription } from '@/lib/fulfillment';
import { sendCompanyWelcome, sendPaymentFailed, sendReceipt, sendWelcome } from '@/lib/email';
import { planLabel } from '@/lib/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// This Stripe account is shared with CES Wallet. Every handler ignores objects
// that are not tagged source="CES Essentials".

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, signature ?? '', env.stripeWebhookSecret());
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const db = admin();
  const { data: seen } = await db.from('stripe_events').select('processed_at').eq('id', event.id).maybeSingle();
  if (seen?.processed_at) return NextResponse.json({ received: true, duplicate: true });
  if (!seen) await db.from('stripe_events').insert({ id: event.id, type: event.type });

  try {
    await handle(event);
    await db.from('stripe_events').update({ processed_at: new Date().toISOString(), error: null }).eq('id', event.id);
    return NextResponse.json({ received: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('stripe webhook failed', event.type, event.id, message);
    await db.from('stripe_events').update({ error: message }).eq('id', event.id);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 }); // Stripe retries
  }
}

async function handle(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return checkoutCompleted(event.data.object);
    case 'checkout.session.expired':
      return checkoutExpired(event.data.object);
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      if (event.data.object.metadata?.source !== STRIPE_SOURCE) return;
      return syncSubscription(event.data.object.id);
    case 'invoice.paid':
      return invoicePaid(event.data.object);
    case 'invoice.payment_failed':
      return invoiceFailed(event.data.object);
    default:
      return;
  }
}

async function checkoutCompleted(session: Stripe.Checkout.Session) {
  if (session.metadata?.source !== STRIPE_SOURCE) return;
  if (session.payment_status !== 'paid') return; // async methods finish later
  const db = admin();
  const { data: order } = await db.from('orders').select('*').eq('id', session.metadata.order_id).maybeSingle();
  if (!order || order.stripe_checkout_session_id !== session.id) throw new Error(`Order not found for session ${session.id}`);
  if (order.status === 'paid') return;

  const subscriptionId = idOf(session.subscription);

  // Verify the amount and the exact prices charged before turning anything on.
  const lineItems = await stripe().checkout.sessions.listLineItems(session.id, { limit: 100 });
  const expected = (order.items as { stripe_price_id: string; price_cents: number; quantity?: number }[])
    .map((i) => `${i.stripe_price_id}:${i.price_cents}:${i.quantity ?? 1}`)
    .sort();
  const charged = lineItems.data.map((li) => `${li.price?.id}:${li.price?.unit_amount}:${li.quantity ?? 1}`).sort();
  const amountOk =
    session.amount_total === order.expected_total_cents &&
    session.currency === order.currency &&
    JSON.stringify(expected) === JSON.stringify(charged);

  if (!amountOk) {
    await db
      .from('orders')
      .update({ status: 'amount_mismatch', stripe_subscription_id: subscriptionId })
      .eq('id', order.id);
    console.error('CES Essentials amount mismatch', { order: order.id, expected: order.expected_total_cents, got: session.amount_total });
    return;
  }

  await db
    .from('orders')
    .update({ status: 'paid', paid_at: new Date().toISOString(), stripe_subscription_id: subscriptionId })
    .eq('id', order.id);

  if (subscriptionId) await syncSubscription(subscriptionId);

  const member = await getMember(order.member_id);
  const { data: products } = await db.from('products').select('id, name, kind').in('id', order.product_ids);
  if (order.organization_id) {
    await db.from('organizations').update({ status: 'active' }).eq('id', order.organization_id);
    await db.from('business_requests').update({ status: 'signed_up' }).eq('organization_id', order.organization_id);
    if (member) await sendCompanyWelcome({ id: member.id, email: member.email, name: member.full_name }, products?.[0]?.name ?? 'Company plan', order.quantity);
    return;
  }
  if (member) await sendWelcome({ id: member.id, email: member.email, name: member.full_name }, planLabel(products ?? []));
}

async function checkoutExpired(session: Stripe.Checkout.Session) {
  if (session.metadata?.source !== STRIPE_SOURCE) return;
  await admin().from('orders').update({ status: 'expired' }).eq('stripe_checkout_session_id', session.id).eq('status', 'pending');
}

function subscriptionIdOf(invoice: Stripe.Invoice): string | null {
  return idOf(invoice.parent?.subscription_details?.subscription ?? null);
}

/** Returns the subscription and member if this invoice belongs to CES Essentials. */
async function ownInvoice(invoice: Stripe.Invoice) {
  const subId = subscriptionIdOf(invoice);
  if (!subId) return null;
  const meta = invoice.parent?.subscription_details?.metadata;
  let source = meta?.source;
  let memberId = meta?.member_id;
  let orgId = meta?.organization_id;
  if (!source) {
    const sub = await stripe().subscriptions.retrieve(subId);
    source = sub.metadata?.source;
    memberId = sub.metadata?.member_id;
    orgId = sub.metadata?.organization_id;
  }
  if (source !== STRIPE_SOURCE) return null;
  if (orgId) {
    // Company bills go to the HR contact.
    const { data: org } = await admin().from('organizations').select('hr_profile_id').eq('id', orgId).single();
    memberId = org?.hr_profile_id ?? undefined;
  }
  if (!memberId) return null;
  const member = await getMember(memberId);
  return member ? { subId, member, orgId: orgId ?? null } : null;
}

async function saveInvoice(invoice: Stripe.Invoice, memberId: string, subId: string, orgId: string | null) {
  const db = admin();
  const { data: subRow } = await db.from('subscriptions').select('id').eq('stripe_subscription_id', subId).maybeSingle();
  const description = invoice.lines?.data?.map((l) => l.description).filter(Boolean).join(', ') || 'CES Essentials membership';
  await db.from('invoices').upsert(
    {
      stripe_invoice_id: invoice.id,
      member_id: memberId,
      organization_id: orgId,
      quantity: invoice.lines?.data?.reduce((n, l) => Math.max(n, l.quantity ?? 0), 0) || null,
      subscription_id: subRow?.id ?? null,
      amount_due_cents: invoice.amount_due,
      amount_paid_cents: invoice.amount_paid,
      currency: invoice.currency,
      status: invoice.status ?? 'open',
      description,
      hosted_invoice_url: invoice.hosted_invoice_url ?? null,
      invoice_pdf_url: invoice.invoice_pdf ?? null,
      period_start: toDate(invoice.period_start),
      period_end: toDate(invoice.period_end),
      paid_at: toDate(invoice.status_transitions?.paid_at),
    },
    { onConflict: 'stripe_invoice_id' },
  );
  return description;
}

async function invoicePaid(invoice: Stripe.Invoice) {
  const own = await ownInvoice(invoice);
  if (!own) return;
  await syncSubscription(own.subId); // clears the grace clock, restores paused access
  const description = await saveInvoice(invoice, own.member.id, own.subId, own.orgId);
  if (invoice.amount_paid > 0) {
    await sendReceipt(own.member, {
      id: invoice.id!,
      amountCents: invoice.amount_paid,
      paidAt: toDate(invoice.status_transitions?.paid_at),
      description,
      hostedUrl: invoice.hosted_invoice_url ?? null,
    });
  }
}

async function invoiceFailed(invoice: Stripe.Invoice) {
  const own = await ownInvoice(invoice);
  if (!own) return;
  await saveInvoice(invoice, own.member.id, own.subId, own.orgId);
  // First-time checkout failures never reach here as an active plan; this is a renewal.
  const db = admin();
  await db
    .from('subscriptions')
    .update({ past_due_since: new Date().toISOString() })
    .eq('stripe_subscription_id', own.subId)
    .is('past_due_since', null);
  await syncSubscription(own.subId);
  await sendPaymentFailed(own.member, invoice.id!, invoice.attempt_count ?? 1);
}
