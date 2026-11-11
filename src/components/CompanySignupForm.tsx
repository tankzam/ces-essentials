'use client';

import { useState } from 'react';
import { money } from '@/lib/money';
import { MIN_SEATS } from '@/lib/company';

interface Plan { id: string; name: string; priceCents: number; regularCents: number; includes: string }

const field = 'min-h-12 w-full rounded-lg border border-[#C8C7BF] bg-white px-3 text-base';
const label = 'flex flex-col gap-1.5 text-sm font-semibold';
const card = 'flex flex-col gap-4 rounded-2xl border border-line bg-white p-6';

export function CompanySignupForm(props: {
  token: string;
  plans: Plan[];
  defaultPlan: string;
  defaultCompany: string;
  defaultName: string;
  defaultEmail: string;
  signedInEmail: string | null;
  policy: { version: number; wording: string };
}) {
  const [plan, setPlan] = useState(props.defaultPlan);
  const [seats, setSeats] = useState(25);
  const [form, setForm] = useState({ companyName: props.defaultCompany, fullName: props.defaultName, email: props.signedInEmail ?? props.defaultEmail, password: '' });
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = props.plans.find((p) => p.id === plan)!;
  const billed = Math.max(MIN_SEATS, seats);
  const estimate = money(billed * chosen.priceCents);
  const ready = agreed && form.companyName.trim() && form.fullName.trim() && (props.signedInEmail || (form.email && form.password.length >= 8));

  async function start() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const res = await fetch('/api/company/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: props.token,
        plan,
        seats: billed,
        companyName: form.companyName,
        fullName: form.fullName,
        email: form.email,
        password: props.signedInEmail ? undefined : form.password,
        agreed: true,
        policyVersion: props.policy.version,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.url) window.location.href = body.url;
    else {
      setError(body.error ?? 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2 className="text-[26px] font-extrabold tracking-tight">1. Choose your team&apos;s plan</h2>
        <div className="grid gap-5 md:grid-cols-2">
          {props.plans.map((p) => {
            const on = p.id === plan;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() => setPlan(p.id)}
                className={`flex flex-col gap-3 rounded-2xl bg-white p-6 text-left ${on ? 'border-[3px] border-navy' : 'border border-line'}`}
              >
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="text-[22px] font-extrabold">{p.name}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[13px] font-bold ${on ? 'bg-navy text-white' : 'bg-cream text-muted'}`}>
                    {on ? 'Selected' : p.id === 'all_in_one_company' ? 'Best value' : 'Choose'}
                  </span>
                </span>
                <span className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[40px] font-extrabold tracking-tight">{money(p.priceCents)}</span>
                  <span className="text-[15px] text-muted">per person / month</span>
                  <span className="text-[15px] text-subtle line-through">{money(p.regularCents)}</span>
                </span>
                <span className="text-[15px] leading-relaxed text-muted">{p.includes}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={`${card} sm:flex-row sm:flex-wrap sm:items-center sm:justify-between`}>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-xl font-bold">How many people to start?</h2>
          <p className="text-sm text-subtle">Minimum 5. You can change this anytime from your dashboard.</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" aria-label="Fewer people" onClick={() => setSeats((n) => Math.max(MIN_SEATS, n - 1))} className="h-12 w-12 rounded-[10px] border border-navy text-[22px] font-bold">–</button>
          <input
            aria-label="Number of people"
            inputMode="numeric"
            value={seats}
            onChange={(e) => setSeats(Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0))}
            onBlur={() => setSeats((n) => Math.max(MIN_SEATS, n))}
            className="w-20 rounded-lg border border-line text-center text-[28px] font-extrabold"
          />
          <button type="button" aria-label="More people" onClick={() => setSeats((n) => n + 1)} className="h-12 w-12 rounded-[10px] border border-navy text-[22px] font-bold">+</button>
        </div>
        <div className="flex flex-col sm:text-right">
          <span className="text-sm text-subtle">Estimated monthly bill</span>
          <span className="text-[28px] font-extrabold">{estimate}</span>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-[26px] font-extrabold tracking-tight">2. Set up your HR login</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>Company name<input className={field} value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></label>
          <label className={label}>Your name<input className={field} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>
          {props.signedInEmail ? (
            <p className="text-[15px] text-muted sm:col-span-2">Signed in as <strong className="text-navy">{props.signedInEmail}</strong>. This will be your HR login.</p>
          ) : (
            <>
              <label className={label}>Work email<input type="email" className={field} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label className={label}>Create a password<input type="password" placeholder="At least 8 characters" autoComplete="new-password" className={field} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
            </>
          )}
        </div>
      </section>

      <section className={card}>
        <h2 className="text-[26px] font-extrabold tracking-tight">3. Company payment</h2>
        <div className="flex flex-col gap-2.5 rounded-xl bg-cream px-5 py-4">
          <div className="flex justify-between gap-3 text-[17px] font-bold">
            <span>{chosen.name} · {billed} people</span>
            <span>{estimate}/mo</span>
          </div>
          <p className="text-sm text-muted">Billed monthly for your active people, with a 5-person minimum. Your bill adjusts when you add or remove someone.</p>
        </div>
        <label className="flex cursor-pointer items-start gap-3 text-[15px] leading-relaxed">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-[22px] w-[22px] shrink-0 accent-navy" />
          <span>{props.policy.wording} <a href="/refund-policy" className="underline">Refund Policy</a></span>
        </label>
        {error && <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 font-semibold text-[#7A1F15]">{error}</p>}
        <button type="button" disabled={!ready || busy} onClick={start} className="min-h-14 rounded-[10px] bg-amber text-lg font-extrabold text-navy disabled:bg-line disabled:text-subtle">
          {busy ? 'Opening secure checkout…' : !agreed ? 'Check the box to continue' : 'Start company plan'}
        </button>
        <p className="text-center text-[13px] text-subtle">You&apos;ll enter the company card on the next screen, on Stripe&apos;s secure page.</p>
      </section>
    </div>
  );
}
