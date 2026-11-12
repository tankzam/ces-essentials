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

/** Archives the Stripe prices of every product that includes healthcare, so Stripe can never charge for it. */
export async function stopHealthcareOnStripe(): Promise<string[]> {
  const { data } = await admin().from('products').select('id, stripe_price_id, product_services(service_id)');
  const done: string[] = [];
  for (const p of data ?? []) {
    if (!includesHealthcare(p) || !p.stripe_price_id) continue;
    const price = await stripe().prices.retrieve(p.stripe_price_id);
    if (price.active) await stripe().prices.update(p.stripe_price_id, { active: false });
    done.push(p.id);
  }
  return done;
}
