'use client';

import { useMemo, useState } from 'react';
import { HrActionButton } from '@/components/HrActionButton';
import { useRouter } from 'next/navigation';

interface Row { profileId: string; name: string; email: string; status: string; kind: 'active' | 'invited' | 'removing'; added: string }

const badge = {
  active: 'bg-ok-soft text-ok',
  invited: 'bg-amber-soft text-[#7A4E05]',
  removing: 'bg-[#ECEBE6] text-muted',
};
const field = 'min-h-12 w-full rounded-lg border border-[#C8C7BF] bg-white px-3 text-base';
const small = 'min-h-10 rounded-lg px-3.5 text-sm font-bold';

export function HrEmployees({ people }: { people: Row[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? people.filter((p) => p.name.toLowerCase().includes(s) || p.email.toLowerCase().includes(s)) : people;
  }, [people, q]);

  async function addOne(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/hr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', people: [form] }) });
    const data = await res.json().catch(() => ({}));
    const ok = res.ok && data.added > 0;
    setMsg({ ok, text: data.message ?? data.error ?? 'Something went wrong.' });
    setBusy(false);
    if (ok) {
      setForm({ firstName: '', lastName: '', email: '' });
      setAdding(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-semibold">
          Search employees
          <input type="search" placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} className={field} />
        </label>
        <button type="button" onClick={() => setAdding((v) => !v)} className="min-h-12 rounded-[10px] border border-navy bg-white px-5 font-bold">
          + Add one person
        </button>
      </div>

      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`rounded-lg px-4 py-3 font-semibold ${msg.ok ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-[#7A1F15]'}`}>{msg.text}</p>}

      {adding && (
        <form onSubmit={addOne} className="grid gap-3 rounded-2xl border border-line bg-white p-5 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">First name<input required className={field} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Last name<input required className={field} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Email<input required type="email" className={field} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <p className="text-sm text-subtle sm:col-span-2">Use the email they&apos;ll register every service with. They get a welcome email with their login.</p>
          <button disabled={busy} className="min-h-12 rounded-[10px] bg-amber px-5 font-bold text-navy disabled:opacity-60">{busy ? 'Adding…' : 'Add and send welcome email'}</button>
        </form>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[760px] border-collapse text-[15px]">
          <thead>
            <tr className="text-left text-[13px] uppercase tracking-wider text-subtle">
              <th className="px-4 py-3.5">Name</th>
              <th className="px-4 py-3.5">Email</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5">Added</th>
              <th className="px-4 py-3.5">Action</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr className="border-t border-line"><td colSpan={5} className="px-4 py-4 text-muted">{people.length ? 'No one matches that search.' : 'No employees yet. Upload a spreadsheet or add one person.'}</td></tr>
            )}
            {shown.map((p) => (
              <tr key={p.profileId} className="border-t border-line align-top">
                <td className="px-4 py-3.5 font-semibold">{p.name}</td>
                <td className="px-4 py-3.5">{p.email}</td>
                <td className="px-4 py-3.5"><span className={`rounded-full px-2.5 py-1 text-[13px] font-bold ${badge[p.kind]}`}>{p.status}</span></td>
                <td className="px-4 py-3.5 text-subtle">{p.added}</td>
                <td className="px-4 py-3.5">
                  <div className="flex flex-wrap gap-2">
                    {p.kind === 'removing' ? (
                      <HrActionButton body={{ action: 'keep', profileId: p.profileId }} className={`${small} border border-navy bg-white`}>Keep</HrActionButton>
                    ) : (
                      <HrActionButton
                        body={{ action: 'remove', profileId: p.profileId }}
                        confirm={`Remove ${p.name}? They keep access until the end of this billing month.`}
                        className={`${small} border border-danger bg-white text-danger`}
                      >
                        Remove
                      </HrActionButton>
                    )}
                    {p.kind === 'invited' && (
                      <HrActionButton body={{ action: 'resend', profileId: p.profileId }} className={`${small} border border-navy bg-white`}>Resend welcome</HrActionButton>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
