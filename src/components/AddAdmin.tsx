'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const field = 'min-h-12 w-full rounded-lg border border-[#C8C7BF] bg-white px-3 text-base';

/** Gives someone admin access. Creates a login if they don't have one and emails a set-password link. */
export function AddAdmin() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!window.confirm(`Give ${form.email} full admin access?`)) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add_admin', ...form }) });
    const data = await res.json().catch(() => ({}));
    setMsg({ ok: res.ok, text: data.message ?? data.error ?? 'Something went wrong.' });
    setBusy(false);
    if (res.ok) {
      setForm({ fullName: '', email: '' });
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Admins</h2>
          <p className="text-sm text-subtle">Admins can see every member, codes, revenue, business requests, and the logs.</p>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} className="min-h-11 rounded-[10px] border border-navy px-4 font-bold">
          + Add admin
        </button>
      </div>
      {open && (
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Full name<input required className={field} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">Email<input required type="email" className={field} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <button disabled={busy} className="min-h-12 self-end rounded-[10px] bg-navy px-5 font-bold text-white disabled:opacity-60">{busy ? 'Adding…' : 'Add and send email'}</button>
        </form>
      )}
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`font-semibold ${msg.ok ? 'text-ok' : 'text-danger'}`}>{msg.text}</p>}
    </div>
  );
}
