import { requireAdminPage } from '@/lib/accounts';
import { admin } from '@/lib/supabase/admin';
import { allProducts, planLabel } from '@/lib/catalog';

export const metadata = { title: 'Policy Log — CES Essentials Admin' };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdminPage();
  const { q = '' } = await searchParams;
  const db = admin();
  let memberIds: string[] | null = null;
  const term = q.trim().replace(/[%,()]/g, '');
  if (term) {
    const { data } = await db.from('profiles').select('id').ilike('email', `%${term}%`).limit(200);
    memberIds = (data ?? []).map((d) => d.id);
  }
  let query = db
    .from('policy_acceptances')
    .select('id, accepted_at, ip, user_agent, wording_snapshot, version_snapshot, profiles(email), orders(product_ids, expected_total_cents, quantity, organization_id)')
    .order('accepted_at', { ascending: false })
    .limit(200);
  if (memberIds) query = query.in('member_id', memberIds.length ? memberIds : ['00000000-0000-0000-0000-000000000000']);
  const [{ data: rows }, products] = await Promise.all([query, allProducts()]);

  const when = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' });

  return (
    <>
      <h1 className="text-[32px] font-extrabold tracking-tight">Policy Log</h1>
      <p className="text-muted">Every refund-policy checkbox at checkout, with the exact wording the member agreed to. Use it as proof in a dispute. Times are Eastern.</p>
      <form className="flex gap-3" action="/admin/policy">
        <input name="q" type="search" defaultValue={q} placeholder="Search by email" aria-label="Search by email" className="min-h-12 flex-1 rounded-lg border border-[#C8C7BF] bg-white px-3 text-base" />
        <button className="min-h-12 rounded-[10px] bg-navy px-5 font-bold text-white">Search</button>
      </form>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[820px] border-collapse text-[15px]">
          <thead>
            <tr className="text-left text-[13px] uppercase tracking-wider text-subtle">
              <th className="px-4 py-3.5">Date &amp; time</th>
              <th className="px-4 py-3.5">Member</th>
              <th className="px-4 py-3.5">Order</th>
              <th className="px-4 py-3.5">Policy version</th>
              <th className="px-4 py-3.5">IP</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).length === 0 && <tr className="border-t border-line"><td colSpan={5} className="px-4 py-4 text-muted">No entries.</td></tr>}
            {(rows ?? []).map((r) => {
              const p = (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles) as { email: string } | null;
              const o = (Array.isArray(r.orders) ? r.orders[0] : r.orders) as { product_ids: string[]; quantity: number; organization_id: string | null } | null;
              const prods = (o?.product_ids ?? []).map((id) => products.find((x) => x.id === id)).filter(Boolean) as { id: string; name: string; kind: string }[];
              const order = o?.organization_id ? `${prods[0]?.name ?? 'Company'} × ${o.quantity}` : planLabel(prods) === 'Your custom plan' ? 'Custom' : planLabel(prods);
              return (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="px-4 py-3.5 whitespace-nowrap">{when(r.accepted_at)}</td>
                  <td className="px-4 py-3.5">{p?.email}</td>
                  <td className="px-4 py-3.5">{order}</td>
                  <td className="px-4 py-3.5">
                    <details>
                      <summary className="cursor-pointer underline">v{r.version_snapshot} (view wording)</summary>
                      <p className="mt-2 max-w-[340px] rounded-lg bg-cream p-3 text-sm">{r.wording_snapshot}</p>
                      <p className="mt-1 max-w-[340px] text-xs text-subtle">{r.user_agent}</p>
                    </details>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-sm">{r.ip}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
