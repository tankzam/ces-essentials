import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { shopifyGraphql, syncShopifyProducts } from '@/lib/shopify';
import { syncShopifySellingPlans } from '@/lib/shopify-billing';
import { includesHealthcare } from '@/lib/healthcare';
import { STRIPE_SOURCE } from '@/lib/env';

/**
 * Copies each product's name from the products table to Stripe (product name,
 * shown on checkout pages, invoices, and receipts) and Shopify (product title).
 */
export async function syncProductNames(): Promise<{ updated: string[]; problems: string[] }> {
  const { data } = await admin().from('products').select('id, name, stripe_product_id, shopify_product_id').order('sort_order');
  const updated: string[] = [];
  const problems: string[] = [];
  const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
  for (const p of data ?? []) {
    if (p.stripe_product_id) {
      try {
        const current = await stripe().products.retrieve(p.stripe_product_id);
        if (current.name !== p.name) {
          await stripe().products.update(p.stripe_product_id, { name: p.name });
          updated.push(`Stripe: ${p.name}`);
        }
      } catch (e) {
        if (!/No such product/i.test(why(e))) problems.push(`Stripe ${p.name}: ${why(e)}`);
      }
    }
    if (p.shopify_product_id) {
      try {
        const title = `CES Essentials — ${p.name}`;
        const r = await shopifyGraphql<{ product: { title: string } | null }>(`query($id: ID!) { product(id: $id) { title } }`, { id: p.shopify_product_id });
        if (r.product && r.product.title !== title) {
          const u = await shopifyGraphql<{ productUpdate: { userErrors: { message: string }[] } }>(
            `mutation($product: ProductUpdateInput!) { productUpdate(product: $product) { userErrors { message } } }`,
            { product: { id: p.shopify_product_id, title } },
          );
          if (u.productUpdate.userErrors.length) throw new Error(u.productUpdate.userErrors.map((x) => x.message).join('; '));
          updated.push(`Shopify: ${p.name}`);
        }
      } catch (e) {
        problems.push(`Shopify ${p.name}: ${why(e)}`);
      }
    }
  }
  return { updated, problems };
}

/**
 * Creates anything missing: a Stripe product and recurring price (monthly or
 * yearly, from the products table) for every active product that Stripe may
 * sell (never healthcare), then the Shopify products and their subscription
 * plans. Never changes an existing Stripe price.
 */
export async function setUpProducts(): Promise<{ created: string[]; problems: string[] }> {
  const db = admin();
  const { data } = await db
    .from('products')
    .select('id, name, price_cents, currency, active, billing_interval, stripe_product_id, stripe_price_id, product_services(service_id)')
    .order('sort_order');
  const created: string[] = [];
  const problems: string[] = [];
  const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
  for (const p of data ?? []) {
    if (!p.active || p.stripe_price_id || includesHealthcare(p)) continue;
    try {
      const productId =
        p.stripe_product_id ?? (await stripe().products.create({ name: p.name, metadata: { source: STRIPE_SOURCE, product_id: p.id } })).id;
      const price = await stripe().prices.create({
        product: productId,
        unit_amount: p.price_cents,
        currency: p.currency,
        recurring: { interval: p.billing_interval === 'year' ? 'year' : 'month' },
        metadata: { source: STRIPE_SOURCE, product_id: p.id },
      });
      await db.from('products').update({ stripe_product_id: productId, stripe_price_id: price.id }).eq('id', p.id);
      created.push(`Stripe: ${p.name} (${p.billing_interval === 'year' ? 'yearly' : 'monthly'})`);
    } catch (e) {
      problems.push(`Stripe ${p.name}: ${why(e)}`);
    }
  }
  try {
    const results = await syncShopifyProducts();
    for (const r of results) {
      if (r.action === 'created') created.push(`Shopify: ${data?.find((p) => p.id === r.id)?.name ?? r.id}`);
      if (r.action === 'error') problems.push(`Shopify ${r.id}: ${r.error}`);
    }
    await syncShopifySellingPlans();
  } catch (e) {
    problems.push(`Shopify: ${why(e)}`);
  }
  return { created, problems };
}
