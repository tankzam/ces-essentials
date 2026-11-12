import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { healthcareOnSale, HEALTHCARE, includesHealthcare } from '@/lib/healthcare';
import { DISCOUNT_CLUB, type PublicCatalog, type Selection } from '@/lib/catalog-shared';

export interface ProductRow {
  id: string;
  name: string;
  kind: 'package' | 'addon' | 'company_package';
  price_cents: number;
  currency: string;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  active: boolean;
  public: boolean;
  badge: string | null;
  sort_order: number;
  product_services: { service_id: string }[];
}

export async function allProducts(): Promise<ProductRow[]> {
  const { data, error } = await admin()
    .from('products')
    .select('*, product_services(service_id)')
    .order('sort_order');
  if (error) throw error;
  return data as ProductRow[];
}

export async function publicCatalog(): Promise<PublicCatalog> {
  const [products, services, healthcare] = await Promise.all([
    allProducts(),
    admin().from('services').select('id, name, public_description, sort_order').order('sort_order'),
    healthcareOnSale(),
  ]);
  if (services.error) throw services.error;
  return {
    products: products
      .filter((p) => p.active && p.public && (p.kind === 'package' || p.kind === 'addon'))
      .filter((p) => healthcare || !includesHealthcare(p))
      .map((p) => ({
        id: p.id,
        name: p.name,
        kind: p.kind as 'package' | 'addon',
        priceCents: p.price_cents,
        badge: p.badge,
        serviceIds: p.product_services.map((s) => s.service_id),
      })),
    services: services.data.filter((s) => healthcare || s.id !== HEALTHCARE).map((s) => ({ id: s.id, name: s.name, description: s.public_description })),
  };
}

export class SelectionError extends Error {}

/**
 * Turns what the browser asked for into products and a total, using only the
 * products table. Prices from the browser are never read.
 */
export async function resolveSelection(input: unknown): Promise<{ products: ProductRow[]; totalCents: number }> {
  const sel = input as Partial<Selection> & { plan?: unknown; addons?: unknown };
  const products = await allProducts();
  const buyable = products.filter((p) => p.active && p.public);

  let chosen: ProductRow[];
  if (typeof sel?.plan === 'string') {
    const p = buyable.find((x) => x.id === sel.plan && x.kind === 'package');
    if (!p) throw new SelectionError('That plan is not available.');
    chosen = [p];
  } else if (Array.isArray(sel?.addons)) {
    const ids = [...new Set(sel.addons.filter((x): x is string => typeof x === 'string'))];
    chosen = ids.map((id) => {
      const p = buyable.find((x) => x.id === id && x.kind === 'addon');
      if (!p) throw new SelectionError('One of the items you picked is not available.');
      return p;
    });
    if (chosen.length === 0) throw new SelectionError('Pick at least one item.');
  } else {
    throw new SelectionError('Choose a plan first.');
  }

  if (chosen.some(includesHealthcare) && !(await healthcareOnSale())) {
    throw new SelectionError('Virtual Healthcare and the All-in-One plan are not available right now. Please choose Essential or other items.');
  }
  for (const p of chosen) {
    if (!p.stripe_price_id) throw new Error(`Product ${p.id} has no Stripe price. Run scripts/setup-stripe.mjs.`);
  }
  return { products: chosen, totalCents: chosen.reduce((s, p) => s + p.price_cents, 0) };
}

/** Services a set of products unlocks. Discount Club comes with any purchase. */
export function servicesFor(products: ProductRow[]): string[] {
  const set = new Set(products.flatMap((p) => p.product_services.map((s) => s.service_id)));
  if (products.length > 0) set.add(DISCOUNT_CLUB);
  return [...set];
}

export function planLabel(products: { id: string; name: string; kind: string }[]): string {
  if (products.length === 1 && products[0].kind !== 'addon') return products[0].name;
  return 'Your custom plan';
}
