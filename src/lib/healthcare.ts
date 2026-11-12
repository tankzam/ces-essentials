import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';

// Virtual Healthcare (and every plan that includes it, like All-in-One) is not
// sold through Stripe. It is offered only while checkout runs through Shopify.

export const HEALTHCARE = 'healthcare';

export const includesHealthcare = (p: { product_services?: { service_id: string }[]; serviceIds?: string[] }) =>
  (p.product_services?.some((s) => s.service_id === HEALTHCARE) ?? false) || (p.serviceIds?.includes(HEALTHCARE) ?? false);

/** True only while new checkouts go through Shopify. */
export async function healthcareOnSale(): Promise<boolean> {
  const { data } = await admin().from('settings').select('value').eq('key', 'payment_provider').maybeSingle();
  return data?.value === 'shopify';
}

/**
 * Archives, in Stripe, the price AND the product of everything that includes
 * healthcare (Virtual Healthcare à la carte, All-in-One, All-in-One for
 * companies), so Stripe can never charge for it. Archived, not deleted:
 * Stripe keeps the history, and they can be restored later.
 */
export async function stopHealthcareOnStripe(): Promise<string[]> {
  const { data } = await admin().from('products').select('id, name, stripe_price_id, stripe_product_id, product_services(service_id)');
  const done: string[] = [];
  for (const p of data ?? []) {
    if (!includesHealthcare(p)) continue;
    if (p.stripe_price_id) {
      const price = await stripe().prices.retrieve(p.stripe_price_id);
      if (price.active) await stripe().prices.update(p.stripe_price_id, { active: false });
    }
    if (p.stripe_product_id) {
      const product = await stripe().products.retrieve(p.stripe_product_id);
      if (product.active) await stripe().products.update(p.stripe_product_id, { active: false });
    }
    if (p.stripe_price_id || p.stripe_product_id) done.push(p.name);
  }
  return done;
}
