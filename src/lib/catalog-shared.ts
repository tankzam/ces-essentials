// Safe for the browser: public fields only, never partner names.

export interface PublicProduct {
  id: string;
  name: string;
  kind: 'package' | 'addon';
  priceCents: number;
  badge: string | null;
  serviceIds: string[];
  /** Billing period. Yearly plans point at the monthly plan they mirror. */
  interval?: 'month' | 'year';
  yearlyOf?: string | null;
}

export interface PublicService {
  id: string;
  name: string;
  description: string;
}

export interface PublicCatalog {
  products: PublicProduct[];
  services: PublicService[];
}

export type Selection = { plan: string } | { addons: string[] };

export const DISCOUNT_CLUB = 'discount_club';

/**
 * "Save $X a month": the cheapest package that covers every picked service and
 * costs less than the picks. Display only — the server recalculates prices.
 */
export function cheaperPackage(catalog: PublicCatalog, addonIds: string[]) {
  const addons = catalog.products.filter((p) => p.kind === 'addon' && addonIds.includes(p.id));
  if (addons.length === 0) return null;
  const total = addons.reduce((s, p) => s + p.priceCents, 0);
  const wanted = new Set(addons.flatMap((p) => p.serviceIds));
  const candidates = catalog.products
    .filter((p) => p.kind === 'package')
    .filter((p) => [...wanted].every((s) => p.serviceIds.includes(s)))
    .filter((p) => p.priceCents < total)
    .sort((a, b) => a.priceCents - b.priceCents);
  const best = candidates[0];
  return best ? { product: best, savingsCents: total - best.priceCents } : null;
}
