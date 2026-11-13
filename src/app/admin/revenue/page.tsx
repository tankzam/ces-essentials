import { requireAdminPage } from '@/lib/accounts';
import { admin } from '@/lib/supabase/admin';
import { allProducts } from '@/lib/catalog';
import { quoteFor } from '@/lib/yearly-server';
import { formatDate, money } from '@/lib/money';
import { AdminAction } from '@/components/AdminAction';
import { paymentProvider } from '@/lib/shopify-billing';

export const metadata = { title: 'Orders & Revenue — CES Essentials Admin' };

export default async function Page() {
  await requireAdminPage();
  const db = admin();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const provider = await paymentProvider();
  const [products, { data: subs }, { data: paid }] = await Promise.all([
    allProducts(),
    db
      .from('subscriptions')
      .select('id, member_id, organization_id, status, provider, stripe_subscription_id, current_period_start, current_period_end, cancel_at_period_end, early_cancel_at, early_cancel_refund_cents, subscription_items(product_id, unit_amount_cents, quantity, price_verified), profiles(email, member_number)')
      .in('status', ['active', 'trialing', 'past_due']),
    db.from('invoices').select('amount_paid_cents').eq('status', 'paid').gte('paid_at', monthStart),
  ]);
  const name = (id: string) => products.find((p) => p.id === id)?.name ?? id;

  let allInOne = 0, starter = 0, starterYearly = 0, custom = 0, companies = 0, seats = 0, mrr = 0;
  const isYearly = (id: string) => products.find((p) => p.id === id)?.billing_interval === 'year';
  const yearlySubs: NonNullable<typeof subs> = [];
  const addonCount = new Map<string, number>();
  for (const s of subs ?? []) {
    const items = (s.subscription_items ?? []) as { product_id: string; unit_amount_cents: number; quantity: number }[];
    // Yearly plans count as 1/12 of their yearly price per month.
    mrr += items.reduce((t, i) => t + Math.round((i.unit_amount_cents * (i.quantity ?? 1)) / (isYearly(i.product_id) ? 12 : 1)), 0);
    if (items.some((i) => isYearly(i.product_id))) yearlySubs.push(s);
    if (s.organization_id) {
      companies++;
      seats += items.reduce((t, i) => t + (i.quantity ?? 1), 0);
    } else if (items.length === 1 && items[0].product_id === 'all_in_one') allInOne++;
    else if (items.length === 1 && items[0].product_id === 'starter') starter++;
    else if (items.length === 1 && items[0].product_id === 'starter_yearly') starterYearly++;
    else {
      custom++;
      for (const i of items) addonCount.set(i.product_id, (addonCount.get(i.product_id) ?? 0) + 1);
    }
  }
  const collected = (paid ?? []).reduce((t, i) => t + i.amount_paid_cents, 0);
  // Yearly plans: what each member would get back if they cancelled today (Shopify refunds are issued by hand).
  const yearlyRows = await Promise.all(
    yearlySubs.map(async (s) => {
      const prof = (Array.isArray(s.profiles) ? s.profiles[0] : s.profiles) as { email: string; member_number: number } | null;
      const q = s.early_cancel_at || s.cancel_at_period_end ? null : await quoteFor(s as Parameters<typeof quoteFor>[0]).catch(() => null);
      return {
        id: s.id,
        who: prof ? `CES-${prof.member_number} · ${prof.email}` : '—',
        via: s.provider === 'shopify' ? 'Shopify' : 'Stripe',
        started: formatDate(s.current_period_start),
        renews: formatDate(s.current_period_end),
        refundNow: s.early_cancel_at
          ? `Refunded ${money(s.early_cancel_refund_cents ?? 0)}`
          : s.cancel_at_period_end
            ? 'Canceled (no refund)'
            : q?.eligible
              ? `${money(q.refundCents)} (${q.monthsUsed} mo used)`
              : 'No refund (after 3 months)',
      };
    }),
  );
  const tiles = [
    { label: 'Collected this month', value: money(collected), sub: 'All paid invoices' },
    { label: 'Monthly recurring', value: money(mrr), sub: 'Active plans, per month' },
    { label: 'All-in-One', value: String(allInOne), sub: `members × ${money(products.find((p) => p.id === 'all_in_one')?.price_cents ?? 0)}` },
    { label: 'Essential', value: String(starter), sub: `members × ${money(products.find((p) => p.id === 'starter')?.price_cents ?? 0)}` },
    { label: 'Essential, yearly', value: String(starterYearly), sub: `members × ${money(products.find((p) => p.id === 'starter_yearly')?.price_cents ?? 0)}/year` },
    { label: 'Custom plans', value: String(custom), sub: 'à la carte members' },
    { label: 'Companies', value: String(companies), sub: `${seats} people billed` },
  ];
  const addons = products.filter((p) => p.kind === 'addon');

  return (
    <>
      <h1 className="text-[32px] font-extrabold tracking-tight">Orders &amp; Revenue</h1>
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5">
        <div>
          <p className="text-sm text-subtle">Checkout goes through</p>
          <p className="text-[22px] font-extrabold">{provider === 'shopify' ? 'Shopify (CES Marketplace)' : 'Stripe'}</p>
          <p className="text-sm text-subtle">Applies to new purchases. Existing members keep billing where they signed up.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {provider !== 'shopify' && <AdminAction body={{ action: 'set_provider', provider: 'shopify' }} confirm="Send all new checkouts through Shopify (CES Marketplace)?">Switch to Shopify</AdminAction>}
          {provider !== 'stripe' && <AdminAction body={{ action: 'set_provider', provider: 'stripe' }} confirm="Send all new checkouts through Stripe?">Switch to Stripe</AdminAction>}
          <AdminAction body={{ action: 'refresh_shopify_plans' }}>Check Shopify plans</AdminAction>
        </div>
        <p className="text-sm text-subtle">
          Virtual Healthcare and All-in-One are {provider === 'shopify' ? <strong className="text-ok">on sale (Shopify checkout)</strong> : <strong className="text-danger">hidden and not sold</strong>}. They are never sold through Stripe, and show on the website only while checkout goes through Shopify.
        </p>
        <div><AdminAction body={{ action: 'sync_product_names' }}>Set up and update products in Stripe and Shopify</AdminAction></div>
        <div><AdminAction body={{ action: 'healthcare_stripe_off' }} confirm="Archive the Virtual Healthcare, All-in-One, and All-in-One (Company) products and prices in Stripe?">Turn healthcare off in Stripe</AdminAction></div>
      </div>
      <p className="text-muted">{monthName}</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-line bg-white p-5">
            <p className="mb-1.5 text-sm text-subtle">{t.label}</p>
            <p className="text-[28px] font-extrabold">{t.value}</p>
            <p className="mt-1 text-sm text-subtle">{t.sub}</p>
          </div>
        ))}
      </div>
      {yearlyRows.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-bold">Yearly plans</h2>
          <p className="text-sm text-subtle">
            Refund if canceled today: first 3 months of the paid year, the monthly price for each month used (a partial month counts as full) is kept and the rest refunded. Stripe refunds happen automatically when the member cancels; for Shopify, issue this amount in Shopify.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-line bg-white">
            <table className="w-full min-w-[720px] border-collapse text-[15px]">
              <thead>
                <tr className="text-left text-[13px] uppercase tracking-wider text-subtle">
                  <th className="px-4 py-3.5">Member</th>
                  <th className="px-4 py-3.5">Billed by</th>
                  <th className="px-4 py-3.5">Year started</th>
                  <th className="px-4 py-3.5">Renews</th>
                  <th className="px-4 py-3.5">Refund if canceled today</th>
                </tr>
              </thead>
              <tbody>
                {yearlyRows.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="px-4 py-3.5 break-all">{r.who}</td>
                    <td className="px-4 py-3.5">{r.via}</td>
                    <td className="px-4 py-3.5">{r.started}</td>
                    <td className="px-4 py-3.5">{r.renews}</td>
                    <td className="px-4 py-3.5 font-bold">{r.refundNow}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[520px] border-collapse text-[15px]">
          <thead>
            <tr className="text-left text-[13px] uppercase tracking-wider text-subtle">
              <th className="px-4 py-3.5">À la carte item</th>
              <th className="px-4 py-3.5">Price</th>
              <th className="px-4 py-3.5">Active</th>
              <th className="px-4 py-3.5">Monthly</th>
            </tr>
          </thead>
          <tbody>
            {addons.map((a) => {
              const n = addonCount.get(a.id) ?? 0;
              return (
                <tr key={a.id} className="border-t border-line">
                  <td className="px-4 py-3.5">{name(a.id)}</td>
                  <td className="px-4 py-3.5">{money(a.price_cents)}</td>
                  <td className="px-4 py-3.5">{n}</td>
                  <td className="px-4 py-3.5 font-bold">{money(n * a.price_cents)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
