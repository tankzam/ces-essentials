'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { money } from '@/lib/money';

interface P { id: string; name: string; kind: string; priceCents: number }
const field = 'min-h-12 w-full rounded-lg border border-[#C8C7BF] bg-white px-3 text-base';

export function ManualActivate({ products }: { products: P[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [pick, setPick] = useState<string[]>(['all_in_one']);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const packages = products.filter((p) => p.kind === 'package');
  const addons = products.filter((p) => p.kind === 'addon');

  const togglePackage = (id: string) => setPick([id]);
  const toggleAddon = (id: string) =>
    setPick((cur) => {
      const base = cur.filter((x) => addons.some((a) => a.id === x));
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'manual_activate', ...form, productIds: pick }),
    });
    const data = await res.json().catch(() => ({}));
    setMsg({ ok: res.ok, text: data.message ?? data.error ?? 'Something went wrong.' });
    setBusy(false);
    if (res.ok) {
      setForm({ firstName: '', lastName: '', email: '', phone: '' });
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col items-end gap-3">
      <button type="button" onClick={() => setOpen((v) => !v)} className="min-h-12 rounded-[10px] bg-amber px-5 font-bold text-navy">
        + Manually activate a member
      </button>
      {open && (
        <form onSubmit={submit} className="flex w-full max-w-[640px] flex-col gap-4 rounded-2xl border border-line bg-white p-5">
          <p className="text-sm text-subtle">Gives access without payment (no Stripe charge). They get a welcome email with their member ID to set their password, plus the usual setup emails. They add their date of birth and address the first time they log in.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">First name<input required className={field} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Last name<input required className={field} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Email<input required type="email" className={field} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">Phone<input type="tel" className={field} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          </div>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="mb-2 text-sm font-semibold">Plan</legend>
            {packages.map((p) => (
              <label key={p.id} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 ${pick.includes(p.id) ? 'border-2 border-navy bg-cream' : 'border border-line'}`}>
                <input type="radio" name="pkg" checked={pick.includes(p.id)} onChange={() => togglePackage(p.id)} className="accent-navy" />
                {p.name} ({money(p.priceCents)})
              </label>
            ))}
          </fieldset>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="mb-2 text-sm font-semibold">Or à la carte</legend>
            {addons.map((p) => (
              <label key={p.id} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 ${pick.includes(p.id) ? 'border-2 border-navy bg-cream' : 'border border-line'}`}>
                <input type="checkbox" checked={pick.includes(p.id)} onChange={() => toggleAddon(p.id)} className="accent-navy" />
                {p.name}
              </label>
            ))}
          </fieldset>
          {msg && <p role={msg.ok ? 'status' : 'alert'} className={`font-semibold ${msg.ok ? 'text-ok' : 'text-danger'}`}>{msg.text}</p>}
          <button disabled={busy || pick.length === 0} className="min-h-12 self-start rounded-[10px] bg-navy px-5 font-bold text-white disabled:opacity-60">
            {busy ? 'Activating…' : 'Activate member'}
          </button>
        </form>
      )}
    </div>
  );
}
