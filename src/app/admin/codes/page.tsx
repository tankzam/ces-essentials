import { CodesPanel } from '@/components/CodesPanel';
import { requireAdminPage } from '@/lib/accounts';
import { admin } from '@/lib/supabase/admin';
import { getSetting } from '@/lib/settings';
import { formatDate } from '@/lib/money';

export const metadata = { title: 'Codes — CES Essentials Admin' };

export default async function Page() {
  await requireAdminPage();
  const db = admin();
  const [{ count: left }, { count: used }, threshold, { data: recent }, { count: locked }] = await Promise.all([
    db.from('activation_codes').select('id', { count: 'exact', head: true }).is('assigned_to', null).eq('retired', false),
    db.from('activation_codes').select('id', { count: 'exact', head: true }).not('assigned_to', 'is', null),
    getSetting('code_pool_alert_threshold'),
    db.from('activation_codes').select('batch, imported_at').order('imported_at', { ascending: false }).limit(500),
    db.from('activation_codes').select('id', { count: 'exact', head: true }).eq('retired', true),
  ]);
  const batches = [...new Map((recent ?? []).map((r) => [r.batch ?? 'Imported', r.imported_at])).entries()].slice(0, 8);
  const t = Number(threshold || 20);

  return (
    <>
      <h1 className="text-[32px] font-extrabold tracking-tight">Codes</h1>
      <p className="text-muted">Credit Monitoring + VPN activation codes. Each code is used once, ever: once given out or locked, it can&apos;t be deleted, edited, re-uploaded or given to anyone else.</p>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="mb-1.5 text-sm text-subtle">Codes left</p>
          <p className={`text-[32px] font-extrabold ${(left ?? 0) < t ? 'text-danger' : ''}`}>{left ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="mb-1.5 text-sm text-subtle">Assigned</p>
          <p className="text-[32px] font-extrabold">{used ?? 0}</p>
          {!!locked && <p className="mt-1 text-sm text-subtle">+ {locked} locked (used before CES Essentials)</p>}
        </div>
        <CodesPanel threshold={t} />
      </div>
      {batches.length > 0 && (
        <div className="rounded-2xl border border-line bg-white p-5">
          <h2 className="mb-3 text-lg font-bold">Recent uploads</h2>
          <ul className="flex flex-col gap-1.5 text-[15px]">
            {batches.map(([b, at]) => (
              <li key={b}>{b} <span className="text-subtle">· {formatDate(at)}</span></li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
