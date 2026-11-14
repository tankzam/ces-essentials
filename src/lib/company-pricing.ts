import 'server-only';
import { allProducts } from '@/lib/catalog';
import { admin } from '@/lib/supabase/admin';
import { healthcareOnSale, includesHealthcare } from '@/lib/healthcare';
import { MIN_SEATS } from '@/lib/company';

export interface CompanyPlan {
  id: string;
  name: string;
  priceCents: number;
  regularCents: number | null;
  serviceIds: string[];
  includes: string[];
}

/** Company plans as sold right now, priced only from the products table. */
export async function companyPlans(): Promise<{ plans: CompanyPlan[]; minSeats: number }> {
  const [products, services, healthcare] = await Promise.all([
    allProducts(),
    admin().from('services').select('id, name, sort_order').order('sort_order'),
    healthcareOnSale(),
  ]);
  const order = (services.data ?? []).map((s) => s.id as string);
  const svcName = new Map((services.data ?? []).map((s) => [s.id as string, s.name as string]));
  const plans = products
    .filter((p) => p.kind === 'company_package' && p.active && (healthcare || !includesHealthcare(p)))
    .map((p) => {
      const ids = p.product_services.map((s) => s.service_id).sort((a, b) => order.indexOf(a) - order.indexOf(b));
      const regular = products.find((r) => r.id === p.id.replace(/_company$/, ''));
      return {
        id: p.id,
        name: p.name.replace(' (Company)', ''),
        priceCents: p.price_cents,
        regularCents: regular?.price_cents ?? null,
        serviceIds: ids,
        includes: ids.map((id) => svcName.get(id) ?? id),
      };
    });
  return { plans, minSeats: MIN_SEATS };
}
