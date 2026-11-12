import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { shopifyGraphql } from '@/lib/shopify';

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
