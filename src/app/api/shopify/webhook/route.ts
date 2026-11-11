import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { handleShopifyOrderVoided, handleShopifyPaidOrder, verifyShopifyWebhook, type ShopifyOrder } from '@/lib/shopify-billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Shopify order webhooks for the CES Marketplace store. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyShopifyWebhook(raw, req.headers.get('x-shopify-hmac-sha256'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  const topic = req.headers.get('x-shopify-topic') ?? 'unknown';
  const eventId = req.headers.get('x-shopify-event-id') || req.headers.get('x-shopify-webhook-id') || `${topic}:${Date.now()}`;
  const body = JSON.parse(raw);

  const db = admin();
  const { data: seen } = await db.from('shopify_events').select('processed_at').eq('id', eventId).maybeSingle();
  if (seen?.processed_at) return NextResponse.json({ received: true, duplicate: true });
  if (!seen) await db.from('shopify_events').insert({ id: eventId, topic, shopify_order_id: String(body.id ?? body.order_id ?? '') });

  try {
    if (topic === 'orders/paid') await handleShopifyPaidOrder(body as ShopifyOrder);
    else if (topic === 'orders/cancelled') await handleShopifyOrderVoided(body.id);
    else if (topic === 'refunds/create') {
      // A refund that covers the whole order ends that month's access.
      const refunded = (body.transactions ?? []).reduce((s: number, t: { amount?: string; kind?: string }) => s + (t.kind === 'refund' ? parseFloat(t.amount ?? '0') : 0), 0);
      const { data: inv } = await db.from('invoices').select('amount_paid_cents').eq('stripe_invoice_id', `shopify:${body.order_id}`).maybeSingle();
      if (inv && Math.round(refunded * 100) >= inv.amount_paid_cents) await handleShopifyOrderVoided(body.order_id);
    }
    await db.from('shopify_events').update({ processed_at: new Date().toISOString(), error: null }).eq('id', eventId);
    return NextResponse.json({ received: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('shopify webhook failed', topic, eventId, message);
    await db.from('shopify_events').update({ error: message }).eq('id', eventId);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 }); // Shopify retries
  }
}
