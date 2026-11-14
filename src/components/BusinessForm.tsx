'use client';

import { useState } from 'react';
import Link from 'next/link';
import { money } from '@/lib/money';

interface Pricing {
  plans: { id: string; name: string; priceCents: number; regularCents: number | null; includes: string[] }[];
  minSeats: number;
}

const RANGE_START: Record<string, number> = { '5–9': 5, '10–24': 10, '25–49': 25, '50–99': 50, '100–249': 100, '250+': 250 };

const field = 'min-h-12 w-full rounded-lg border border-[#C8C7BF] bg-white px-3 text-base';
const label = 'flex flex-col gap-1.5 text-sm font-semibold';

export function BusinessForm({ plans = ['Essential', 'All-in-One'] }: { plans?: string[] }) {
  const [sent, setSent] = useState(false);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [people, setPeople] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    setPeople(RANGE_START[String(f.get('peopleRange'))] ?? 5);
    const res = await fetch('/api/business-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(f.entries())),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setPricing(body.pricing ?? null);
      setSent(true);
    }
    else setError(body.error ?? 'Something went wrong. Please try again.');
    setBusy(false);
  }

  if (sent) {
    return (
      <div role="status" className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-ok-soft">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1F6B45" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
          </span>
          <h2 className="text-[28px] font-extrabold tracking-tight">Here&apos;s your company pricing</h2>
          <p className="max-w-[520px] text-[17px] leading-relaxed text-muted">
            Thanks, we got your request. We&apos;ll review it and email your private signup link, usually within one business day.
          </p>
        </div>
        {pricing?.plans.map((p) => (
          <div key={p.id} className="flex flex-col gap-4 rounded-2xl border-2 border-navy bg-white p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="text-[24px] font-extrabold">{p.name} for teams</h3>
              <p className="flex flex-wrap items-baseline gap-2">
                <span className="text-[40px] font-extrabold tracking-tight">{money(p.priceCents)}</span>
                <span className="text-muted">per person / month</span>
                {p.regularCents && p.regularCents > p.priceCents && <span className="text-subtle line-through">{money(p.regularCents)}</span>}
              </p>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {p.includes.map((i) => (
                <li key={i} className="flex items-start gap-2.5 text-[16px]">
                  <svg className="mt-1 shrink-0 text-[#1F7A4D]" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
                  {i}
                </li>
              ))}
            </ul>
            <div className="rounded-xl bg-cream px-5 py-4 text-[16px]">
              <p>
                For <strong>{Math.max(pricing.minSeats, people)} people</strong>: <strong>{money(Math.max(pricing.minSeats, people) * p.priceCents)}</strong> a month.
              </p>
              <p className="mt-1 text-[15px] text-muted">
                Billed monthly for your active people, with a {pricing.minSeats}-person minimum. Your bill adjusts when you add or remove someone.
              </p>
            </div>
          </div>
        ))}
        <ol className="flex flex-col gap-2 text-[16px] leading-relaxed">
          <li><strong>1.</strong> We review your request and email your private signup link.</li>
          <li><strong>2.</strong> You pick the number of people, set up your HR login, and pay with a company card.</li>
          <li><strong>3.</strong> Upload your employees. Each one gets their own login and a welcome email.</li>
        </ol>
        <Link href="/" className="self-center font-semibold underline">Back to home</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[28px] font-extrabold tracking-tight">Get company pricing</h2>
        <p className="text-muted">Tell us about your company. Your company pricing appears right away, and we&apos;ll email your private signup link.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>Company name<input name="company" required className={field} autoComplete="organization" /></label>
        <label className={label}>Your name<input name="contactName" required className={field} autoComplete="name" /></label>
        <label className={label}>Work email<input name="email" type="email" required className={field} autoComplete="email" /></label>
        <label className={label}>Phone<input name="phone" type="tel" required className={field} autoComplete="tel" /></label>
        <label className={label}>
          How many people?
          <select name="peopleRange" className={field} defaultValue="5–9">
            {['5–9', '10–24', '25–49', '50–99', '100–249', '250+'].map((o) => <option key={o}>{o}</option>)}
          </select>
        </label>
        {plans.length > 1 ? (
        <label className={label}>
          Plan you&apos;re interested in
          <select name="interest" className={field} defaultValue="Not sure yet">
            {['Not sure yet', ...plans].map((o) => <option key={o}>{o}</option>)}
          </select>
        </label>
        ) : (
          <input type="hidden" name="interest" value={plans[0] ?? 'Not sure yet'} />
        )}
      </div>
      <label className={label}>Anything else? (optional)<textarea name="notes" rows={3} className="rounded-lg border border-[#C8C7BF] p-3 text-base" /></label>
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <p className="text-sm text-subtle">Company plans require at least 5 people.</p>
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 font-semibold text-[#7A1F15]">{error}</p>}
      <button disabled={busy} className="min-h-14 rounded-[10px] bg-amber text-lg font-extrabold text-navy disabled:opacity-60">
        {busy ? 'Sending…' : 'See company pricing'}
      </button>
    </form>
  );
}
