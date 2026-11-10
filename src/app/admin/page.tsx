import Link from 'next/link';
import { AdminAction } from '@/components/AdminAction';
import { ManualActivate } from '@/components/ManualActivate';
import { AddAdmin } from '@/components/AddAdmin';
import { requireAdminPage } from '@/lib/accounts';
import { admin } from '@/lib/supabase/admin';
import { allProducts } from '@/lib/catalog';
import { money } from '@/lib/money';

export const metadata = { title: 'Members — CES Essentials Admin' };

const PAGE = 50;

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireAdminPage();
  const { q = '', page = '1' } = await searchParams;
  const pageNo = Math.max(1, Number(page) || 1);
  const db = admin();

  let query = db.from('profiles').select('id, full_name, email, access_disabled, role, organization_id', { count: 'exact' }).order('created_at', { ascending: false });
  const term = q.trim().replace(/[%,()]/g, '');
  if (term) query = query.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
  const { data: profiles, count } = await query.range((pageNo - 1) * PAGE, pageNo * PAGE - 1);
  const ids = (profiles ?? []).map((p) => p.id);

  const [products, { data: subs }, { data: ents }, { data: codes }, { data: orgLinks }] = await Promise.all([
    allProducts(),
    ids.length ? db.from('subscriptions').select('id, member_id, status, cancel_at_period_end, subscription_items(product_id, unit_amount_cents)').in('member_id', ids).not('status', 'in', '(canceled,incomplete_expired)') : Promise.resolve({ data: [] }),
    ids.length ? db.from('entitlements').select('member_id, service_id, status, source').in('member_id', ids).neq('status', 'ended') : Promise.resolve({ data: [] }),
    ids.length ? db.from('activation_codes').select('assigned_to, code').in('assigned_to', ids) : Promise.resolve({ data: [] }),
    ids.length ? db.from('organization_members').select('profile_id, role, status, organizations(name, plan_product_id)').in('profile_id', ids).neq('status', 'removed') : Promise.resolve({ data: [] }),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));

  const rows = (profiles ?? []).map((p) => {
    const sub = (subs ?? []).find((s) => s.member_id === p.id);
    const myEnts = (ents ?? []).filter((e) => e.member_id === p.id);
    const link = (orgLinks ?? []).find((l) => l.profile_id === p.id && l.role === 'employee');
    const hrLink = (orgLinks ?? []).find((l) => l.profile_id === p.id && l.role === 'hr_admin');
    const org = link && ((Array.isArray(link.organizations) ? link.organizations[0] : link.organizations) as { name: string; plan_product_id: string | null } | null);
    const hrOrg = hrLink && ((Array.isArray(hrLink.organizations) ? hrLink.organizations[0] : hrLink.organizations) as { name: string } | null);
    let plan = '—';
    let price = '—';
    if (sub) {
      const items = (sub.subscription_items ?? []) as { product_id: string; unit_amount_cents: number }[];
      const prods = items.map((i) => productById.get(i.product_id)).filter(Boolean) as { id: string; name: string; kind: string }[];
      plan = prods.length === 1 && prods[0].kind === 'package' ? prods[0].name : `Custom: ${prods.map((x) => x.name).join(' + ')}`;
      price = money(items.reduce((s, i) => s + i.unit_amount_cents, 0));
    } else if (org) {
      plan = `${org.name} · ${productById.get(org.plan_product_id ?? '')?.name.replace(' (Company)', '') ?? 'Company'}`;
      price = 'Company';
    } else if (myEnts.some((e) => e.source === 'manual')) {
      plan = 'Manual';
      price = '$0.00';
    } else if (hrOrg) {
      plan = `HR · ${hrOrg.name}`;
    }
    const code = (codes ?? []).find((c) => c.assigned_to === p.id)?.code ?? '—';
    const hasAccess = myEnts.some((e) => e.status === 'active' || e.status === 'grace');
    const status = p.access_disabled ? 'Deactivated' : hasAccess ? (sub?.cancel_at_period_end ? 'Active (canceling)' : 'Active') : myEnts.some((e) => e.status === 'paused') ? 'Paused' : 'No access';
    return { ...p, plan, price, code, status };
  });

  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const buyable = products
    .filter((p) => p.active && p.public)
    .map((p) => ({ id: p.id, name: p.name, kind: p.kind, priceCents: p.price_cents }));

  type Row = (typeof rows)[number];
  const memberAction = (m: Row) => (
    <>
                  {m.role !== 'admin' &&
        (m.access_disabled ? (
          <AdminAction body={{ action: 'activate', profileId: m.id }}>Activate</AdminAction>
        ) : (
          <AdminAction
            body={{ action: 'deactivate', profileId: m.id }}
            confirm={`Deactivate ${m.email}? Access shuts off right away and their plan won't renew. All records are kept.`}
            className="min-h-11 rounded-lg border border-danger bg-white px-3.5 text-sm font-bold text-danger"
          >
            Deactivate
          </AdminAction>
        ))}
    </>
  );
  const statusClass = (m: Row) => m.status.startsWith('Active') ? 'bg-ok-soft text-ok' : m.status === 'Deactivated' ? 'bg-[#ECEBE6] text-muted' : 'bg-amber-soft text-[#7A4E05]';

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[32px] font-extrabold tracking-tight">Members</h1>
        <ManualActivate products={buyable} />
      </div>
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" action="/admin">
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-semibold">
          Search members
          <input name="q" type="search" defaultValue={q} placeholder="Name or email" className="min-h-12 rounded-lg border border-[#C8C7BF] bg-white px-3 text-base" />
        </label>
        <button className="min-h-12 rounded-[10px] bg-navy px-5 font-bold text-white">Search</button>
      </form>
      {/* Phones: one card per member */}
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.length === 0 && <li className="rounded-2xl border border-line bg-white p-4 text-muted">No members found.</li>}
        {rows.map((m) => (
          <li key={m.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold">{m.full_name}{m.role === 'admin' && <span className="ml-2 rounded bg-navy px-1.5 py-0.5 text-xs font-bold text-white">ADMIN</span>}</p>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[13px] font-bold ${statusClass(m)}`}>{m.status}</span>
            </div>
            <p className="break-all text-[15px] text-muted">{m.email}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[15px]">
              <dt className="text-subtle">Plan</dt><dd>{m.plan}</dd>
              <dt className="text-subtle">Price</dt><dd>{m.price}</dd>
              <dt className="text-subtle">Code</dt><dd className="break-all font-mono text-sm">{m.code}</dd>
            </dl>
            <div>{memberAction(m)}</div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-white md:block">
        <table className="w-full min-w-[880px] border-collapse text-[15px]">
          <thead>
            <tr className="text-left text-[13px] uppercase tracking-wider text-subtle">
              <th className="px-4 py-3.5">Member</th>
              <th className="px-4 py-3.5">Plan</th>
              <th className="px-4 py-3.5">Price</th>
              <th className="px-4 py-3.5">Code</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr className="border-t border-line"><td colSpan={6} className="px-4 py-4 text-muted">No members found.</td></tr>}
            {rows.map((m) => (
              <tr key={m.id} className="border-t border-line align-top">
                <td className="px-4 py-3.5">
                  <p className="font-semibold">{m.full_name}{m.role === 'admin' && <span className="ml-2 rounded bg-navy px-1.5 py-0.5 text-xs font-bold text-white">ADMIN</span>}</p>
                  <p className="text-sm text-subtle">{m.email}</p>
                </td>
                <td className="px-4 py-3.5">{m.plan}</td>
                <td className="px-4 py-3.5">{m.price}</td>
                <td className="px-4 py-3.5 font-mono text-sm">{m.code}</td>
                <td className="px-4 py-3.5">
                  <span className={`rounded-full px-2.5 py-1 text-[13px] font-bold ${statusClass(m)}`}>{m.status}</span>
                </td>
                <td className="px-4 py-3.5">
                  {memberAction(m)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-3">
          {pageNo > 1 && <Link className="underline" href={`/admin?q=${encodeURIComponent(q)}&page=${pageNo - 1}`}>← Previous</Link>}
          <span className="text-subtle">Page {pageNo} of {pages} · {count} members</span>
          {pageNo < pages && <Link className="underline" href={`/admin?q=${encodeURIComponent(q)}&page=${pageNo + 1}`}>Next →</Link>}
        </nav>
      )}
      <AddAdmin />
      <p className="text-sm text-subtle">
        Deactivate shuts off access right away, stops future renewals, and keeps all payment, code, and policy records. Every action is saved in the Activity Log.
      </p>
    </>
  );
}
