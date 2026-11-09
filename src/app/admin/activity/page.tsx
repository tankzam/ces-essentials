import { requireAdminPage } from '@/lib/accounts';
import { admin } from '@/lib/supabase/admin';

export const metadata = { title: 'Activity Log — CES Essentials Admin' };

export default async function Page() {
  await requireAdminPage();
  const { data: rows } = await admin().from('admin_activity').select('*').order('created_at', { ascending: false }).limit(300);
  const when = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' });
  return (
    <>
      <h1 className="text-[32px] font-extrabold tracking-tight">Activity Log</h1>
      <p className="text-muted">Every manual admin action: who did it and when. Times are Eastern.</p>
      <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-white">
        {(rows ?? []).length === 0 && <li className="px-5 py-4 text-muted">No admin actions yet.</li>}
        {(rows ?? []).map((a) => (
          <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
            <p><strong>{a.admin_email}</strong> {a.action}</p>
            <p className="text-sm text-subtle">{when(a.created_at)}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
