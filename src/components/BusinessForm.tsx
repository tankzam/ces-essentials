'use client';

import { useState } from 'react';
import Link from 'next/link';

const field = 'min-h-12 w-full rounded-lg border border-[#C8C7BF] bg-white px-3 text-base';
const label = 'flex flex-col gap-1.5 text-sm font-semibold';

export function BusinessForm() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const res = await fetch('/api/business-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(f.entries())),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) setSent(true);
    else setError(body.error ?? 'Something went wrong. Please try again.');
    setBusy(false);
  }

  if (sent) {
    return (
      <div role="status" className="flex flex-col items-center gap-3.5 py-6 text-center">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-ok-soft">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1F6B45" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
        </span>
        <h2 className="text-[26px] font-extrabold">Thanks, we got your request.</h2>
        <p className="max-w-[460px] leading-relaxed text-muted">We&apos;ll review it and email your private signup link and company pricing, usually within one business day.</p>
        <Link href="/" className="font-semibold underline">Back to home</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[28px] font-extrabold tracking-tight">Get company pricing</h2>
        <p className="text-muted">Tell us about your company and we&apos;ll send your private signup link and pricing.</p>
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
        <label className={label}>
          Plan you&apos;re interested in
          <select name="interest" className={field} defaultValue="Not sure yet">
            {['Not sure yet', 'Starter', 'All-in-One'].map((o) => <option key={o}>{o}</option>)}
          </select>
        </label>
      </div>
      <label className={label}>Anything else? (optional)<textarea name="notes" rows={3} className="rounded-lg border border-[#C8C7BF] p-3 text-base" /></label>
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <p className="text-sm text-subtle">Company plans require at least 5 people.</p>
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 font-semibold text-[#7A1F15]">{error}</p>}
      <button disabled={busy} className="min-h-14 rounded-[10px] bg-amber text-lg font-extrabold text-navy disabled:opacity-60">
        {busy ? 'Sending…' : 'Request company pricing'}
      </button>
    </form>
  );
}
