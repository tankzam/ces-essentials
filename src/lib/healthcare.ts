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
export async function stopHealthcareOnStripe(): Promise<{ done: string[]; problems: string[] }> {
  const { data } = await admin().from('products').select('id, name, stripe_price_id, stripe_product_id, product_services(service_id)');
  const done: string[] = [];
  const problems: string[] = [];
  const why = (e: unknown) => (e instanceof Error ? e.message : String(e));
  for (const p of data ?? []) {
    if (!includesHealthcare(p)) continue;
    try {
      if (p.stripe_product_id) {
        const product = await stripe().products.retrieve(p.stripe_product_id);
        // A product's default price can't be archived while it is the default, so clear it first.
        if (product.default_price) await stripe().products.update(p.stripe_product_id, { default_price: '' });
      }
      if (p.stripe_price_id) {
        const price = await stripe().prices.retrieve(p.stripe_price_id);
        if (price.active) await stripe().prices.update(p.stripe_price_id, { active: false });
      }
      if (p.stripe_product_id) {
        const product = await stripe().products.retrieve(p.stripe_product_id);
        if (product.active) await stripe().products.update(p.stripe_product_id, { active: false });
      }
      done.push(p.name);
    } catch (e) {
      // Already deleted in Stripe = nothing left to charge with.
      if (e instanceof Error && /No such (product|price)/i.test(e.message)) {
        done.push(`${p.name} (already deleted in Stripe)`);
        continue;
      }
      console.error('stopHealthcareOnStripe', p.id, e);
      problems.push(`${p.name}: ${why(e)}`);
    }
  }
  return { done, problems };
}
