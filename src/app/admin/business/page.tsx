import { AdminAction } from '@/components/AdminAction';
import { CopyButton } from '@/components/CopyButton';
import { requireAdminPage } from '@/lib/accounts';
import { admin } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { formatDate } from '@/lib/money';

export const metadata = { title: 'Business Requests — CES Essentials Admin' };

const badge: Record<string, [string, string]> = {
  pending: ['New', 'bg-amber-soft text-[#7A4E05]'],
  approved: ['Link sent', 'bg-ok-soft text-ok'],
  signed_up: ['Signed up', 'bg-ok-soft text-ok'],
  declined: ['Declined', 'bg-[#ECEBE6] text-muted'],
};

export default async function Page() {
  await requireAdminPage();
  const { data: requests } = await admin().from('business_requests').select('*').order('created_at', { ascending: false }).limit(200);
  return (
    <>
      <h1 className="text-[32px] font-extrabold tracking-tight">Business Requests</h1>
      <p className="text-muted">
        Requests from the For Businesses form. Approving sends the company a private signup link with company pricing: Starter $15.99 and All-in-One $39.99 per person, 10-person minimum.
      </p>
      {/* Phones: one card per request */}
      <ul className="flex flex-col gap-3 md:hidden">
        {(requests ?? []).length === 0 && <li className="rounded-2xl border border-line bg-white p-4 text-muted">No requests yet.</li>}
        {(requests ?? []).map((r) => {
          const [label, cls] = badge[r.status] ?? [r.status, ''];
          const link = r.signup_token ? `${env.siteUrl()}/company/signup/${r.signup_token}` : null;
          return (
            <li key={r.id} className="flex flex-col gap-2 rounded-2xl border border-line bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold">{r.company}</p>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[13px] font-bold ${cls}`}>{label}</span>
              </div>
              <p className="text-[15px]">{r.contact_name}</p>
              <p className="break-all text-sm text-subtle">{r.email} · {r.phone}</p>
              <p className="text-[15px]">{r.people_range} people · {r.interest} · <span className="text-subtle">{formatDate(r.created_at)}</span></p>
              {r.notes && <p className="text-sm text-muted">“{r.notes}”</p>}
              {r.status === 'pending' ? (
                <div className="flex flex-wrap gap-2">
                  <AdminAction body={{ action: 'approve_request', requestId: r.id }} className="min-h-11 rounded-lg bg-amber px-3.5 text-sm font-bold text-navy">Approve &amp; send link</AdminAction>
                  <AdminAction body={{ action: 'decline_request', requestId: r.id }} confirm={`Decline ${r.company}?`}>Decline</AdminAction>
                </div>
              ) : link && r.status === 'approved' ? (
                <div className="flex items-center gap-2"><span className="text-sm text-subtle">Private link emailed</span><CopyButton text={link} /></div>
              ) : (
                <span className="text-sm text-subtle">{r.status === 'signed_up' ? 'Company plan active' : 'No action'}</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-white md:block">
        <table className="w-full min-w-[920px] border-collapse text-[15px]">
          <thead>
            <tr className="text-left text-[13px] uppercase tracking-wider text-subtle">
              <th className="px-4 py-3.5">Company</th>
              <th className="px-4 py-3.5">Contact</th>
              <th className="px-4 py-3.5">People</th>
              <th className="px-4 py-3.5">Interest</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {(requests ?? []).length === 0 && <tr className="border-t border-line"><td colSpan={6} className="px-4 py-4 text-muted">No requests yet.</td></tr>}
            {(requests ?? []).map((r) => {
              const [label, cls] = badge[r.status] ?? [r.status, ''];
              const link = r.signup_token ? `${env.siteUrl()}/company/signup/${r.signup_token}` : null;
              return (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="px-4 py-3.5">
                    <p className="font-semibold">{r.company}</p>
                    <p className="text-sm text-subtle">{formatDate(r.created_at)}</p>
                    {r.notes && <p className="mt-1 max-w-[260px] text-sm text-muted">“{r.notes}”</p>}
                  </td>
                  <td className="px-4 py-3.5">
                    <p>{r.contact_name}</p>
                    <p className="text-sm text-subtle">{r.email} · {r.phone}</p>
                  </td>
                  <td className="px-4 py-3.5">{r.people_range}</td>
                  <td className="px-4 py-3.5">{r.interest}</td>
                  <td className="px-4 py-3.5"><span className={`rounded-full px-2.5 py-1 text-[13px] font-bold ${cls}`}>{label}</span></td>
                  <td className="px-4 py-3.5">
                    {r.status === 'pending' ? (
                      <div className="flex flex-wrap gap-2">
                        <AdminAction body={{ action: 'approve_request', requestId: r.id }} className="min-h-11 rounded-lg bg-amber px-3.5 text-sm font-bold text-navy">Approve &amp; send link</AdminAction>
                        <AdminAction body={{ action: 'decline_request', requestId: r.id }} confirm={`Decline ${r.company}?`}>Decline</AdminAction>
                      </div>
                    ) : link && r.status === 'approved' ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-subtle">Private link emailed</span>
                        <CopyButton text={link} />
                      </div>
                    ) : (
                      <span className="text-sm text-subtle">{r.status === 'signed_up' ? 'Company plan active' : 'No action'}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
