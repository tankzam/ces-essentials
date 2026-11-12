'use client';

import { IdentityFields, readIdentity } from '@/components/IdentityFields';
import { fieldErrors as identityErrors, identitySchema } from '@/lib/identity';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from '@/components/Check';
import { cheaperPackage, DISCOUNT_CLUB, type PublicCatalog, type Selection } from '@/lib/catalog-shared';
import { money } from '@/lib/money';

type Order = { kind: 'plan'; id: string } | { kind: 'custom' } | null;

export const PICK_EVENT = 'ces:pick-plan';

const TAGLINES: Record<string, string> = {
  starter: "Protect your family's legal, financial, and online life.",
  all_in_one: 'Everything in Essential, plus unlimited virtual doctor visits for 4 people.',
};

export function PlanCheckout({
  catalog,
  signedInEmail,
  policy,
}: {
  catalog: PublicCatalog;
  signedInEmail: string | null;
  policy: { version: number; wording: string };
}) {
  const packages = catalog.products.filter((p) => p.kind === 'package');
  const addons = catalog.products.filter((p) => p.kind === 'addon');
  const serviceName = useMemo(() => new Map(catalog.services.map((s) => [s.id, s.name])), [catalog.services]);
  const starter = packages.find((p) => p.id === 'starter');

  const [picked, setPicked] = useState<string[]>([]);
  const [order, setOrder] = useState<Order>(null);
  const [agreed, setAgreed] = useState(false);
  const [account, setAccount] = useState({ email: '', phone: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const fieldsRef = useRef<HTMLFieldSetElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onPick = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (packages.some((p) => p.id === id)) setOrder({ kind: 'plan', id });
    };
    window.addEventListener(PICK_EVENT, onPick);
    return () => window.removeEventListener(PICK_EVENT, onPick);
  }, [packages]);

  const pickedProducts = addons.filter((a) => picked.includes(a.id));
  const customTotal = pickedProducts.reduce((s, p) => s + p.priceCents, 0);
  const nudge = cheaperPackage(catalog, picked);

  const featureList = (serviceIds: string[], pkgId: string) => {
    const order = catalog.services.map((s) => s.id);
    const ids = [...serviceIds].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    // Essential features first, then what All-in-One adds, matching the plan copy.
    if (pkgId !== 'starter' && starter) {
      ids.sort((a, b) => Number(!starter.serviceIds.includes(a)) - Number(!starter.serviceIds.includes(b)));
    }
    return ids.map((id) => (id === 'healthcare' ? 'Virtual Healthcare (you plus up to 3 more people)' : serviceName.get(id) ?? id));
  };

  const goCheckout = (next: Order) => {
    setOrder(next);
    setError(null);
    document.getElementById('checkout')?.scrollIntoView({ block: 'start' });
  };

  // Order summary
  let summary = { name: 'No plan selected', price: 0, detail: 'Choose a plan or build your own above.' };
  let selection: Selection | null = null;
  if (order?.kind === 'plan') {
    const p = packages.find((x) => x.id === order.id)!;
    summary = { name: p.name, price: p.priceCents, detail: featureList(p.serviceIds, p.id).join(', ') };
    selection = { plan: p.id };
  } else if (order?.kind === 'custom' && pickedProducts.length) {
    summary = {
      name: 'Your custom plan',
      price: customTotal,
      detail: [...pickedProducts.map((p) => p.name), serviceName.get(DISCOUNT_CLUB) ?? 'Discount Club'].join(', '),
    };
    selection = { addons: pickedProducts.map((p) => p.id) };
  }

  // Per your spec: the button unlocks once a plan is chosen and the box is checked.
  // Account fields are checked when it's clicked, with a message on each field.
  const canPay = !!selection && agreed && !busy;
  const payHint = !selection ? 'Choose a plan first' : !agreed ? 'Check the box to continue' : 'Pay securely with card';

  function checkAccount() {
    // Read what is actually in the boxes (browser autofill doesn't always update the page's copy).
    const box = fieldsRef.current;
    const val = (n: string) => (box?.querySelector<HTMLInputElement>(`[name="${n}"]`)?.value ?? '');
    const current = { phone: val('phone'), email: val('email'), password: val('password') };
    setAccount(current);
    const identity = readIdentity(box);
    const checked = identitySchema({ adult: true }).safeParse(identity);
    const errs: Record<string, string> = checked.success ? {} : identityErrors(checked.error);
    if (current.phone.replace(/\D/g, '').length < 7) errs.phone = 'Enter your phone number.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(current.email.trim())) errs.email = 'Enter a complete email address.';
    if (current.password.length < 8) errs.password = `Password needs at least 8 characters (you have ${current.password.length}).`;
    setFieldErrors(errs);
    return { ok: Object.keys(errs).length === 0, current: { ...current, ...identity } };
  }

  async function pay() {
    if (!canPay || !selection) return;
    let acct: Record<string, string> = account;
    if (!signedInEmail) {
      const { ok, current } = checkAccount();
      if (!ok) {
        setError('Please fix the highlighted details above.');
        fieldsRef.current?.scrollIntoView({ block: 'center' });
        return;
      }
      acct = current;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selection,
          agreed: true,
          policyVersion: policy.version,
          account: signedInEmail ? undefined : acct,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.url) throw new Error(body.error || 'Something went wrong. Please try again.');
      window.location.href = body.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  const field = 'min-h-12 w-full rounded-lg border border-[#C8C7BF] bg-white px-3 text-base aria-[invalid=true]:border-2 aria-[invalid=true]:border-danger';

  return (
    <>
      {/* 3. Plans */}
      <section id="plans" className="mx-auto max-w-[1180px] scroll-mt-4 px-4 pb-10 pt-20 sm:px-6">
        <h2 className="mb-3 text-center text-3xl font-extrabold tracking-tight sm:text-4xl">Choose your plan</h2>
        <p className="mb-12 text-center text-lg text-muted">Cancel anytime. Your access lasts through the end of your billing month.</p>
        <div className={packages.length > 1 ? 'grid items-stretch gap-7 md:grid-cols-2' : 'mx-auto grid w-full max-w-[560px]'}>
          {packages.map((p) => {
            const dark = p.id === 'all_in_one';
            return (
              <div
                key={p.id}
                className={`relative flex flex-col gap-5 rounded-[18px] p-7 sm:p-9 ${dark ? 'bg-navy text-white' : 'border border-line bg-white'}`}
              >
                {p.badge && (
                  <span className="absolute -top-3.5 right-7 rounded-full bg-amber px-3.5 py-1.5 text-[13px] font-extrabold uppercase tracking-wider text-navy">
                    {p.badge}
                  </span>
                )}
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-2xl font-bold">{p.name}</h3>
                  <p className={dark ? 'text-mist' : 'text-muted'}>{TAGLINES[p.id]}</p>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-5xl font-extrabold tracking-tight">{money(p.priceCents)}</span>
                  <span className={dark ? 'text-mist' : 'text-muted'}>/month</span>
                </div>
                <ul className="flex flex-1 flex-col gap-3">
                  {featureList(p.serviceIds, p.id).map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Check className={dark ? 'text-amber' : 'text-[#1F7A4D]'} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => goCheckout({ kind: 'plan', id: p.id })}
                  className={`min-h-[52px] rounded-[10px] text-[17px] font-bold ${dark ? 'bg-amber text-navy' : 'border-2 border-navy text-navy'}`}
                >
                  Get {p.name}
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-8 text-center text-[17px]">
          <a href="#build" className="font-semibold underline underline-offset-2">Or build your own plan →</a>
        </p>
      </section>

      {/* 4. Build your own */}
      <section id="build" className="mx-auto max-w-[1180px] scroll-mt-4 px-4 py-14 sm:px-6">
        <div className="flex flex-col gap-7 rounded-[18px] border border-line bg-white p-6 sm:p-10">
          <div className="flex flex-col gap-2">
            <h2 className="text-3xl font-extrabold tracking-tight">Build your own plan</h2>
            <p className="text-[17px] text-muted">Pick only what you want. The Discount Club comes free with any purchase.</p>
          </div>
          <div className="grid gap-3.5 md:grid-cols-2">
            {addons.map((a) => {
              const on = picked.includes(a.id);
              return (
                <label
                  key={a.id}
                  className={`flex min-h-16 cursor-pointer items-center gap-3.5 rounded-xl px-4 py-4 ${on ? 'border-2 border-navy bg-cream' : 'border border-line bg-white'}`}
                >
                  <input
                    type="checkbox"
                    role="switch"
                    aria-checked={on}
                    checked={on}
                    onChange={() => setPicked((cur) => (on ? cur.filter((x) => x !== a.id) : [...cur, a.id]))}
                    className="h-[22px] w-[22px] shrink-0 accent-navy"
                  />
                  <span className="flex-1 text-[17px] font-semibold">{a.name}</span>
                  <span className="text-[17px] font-bold">{money(a.priceCents)}</span>
                </label>
              );
            })}
            <div className="flex min-h-16 items-center gap-3.5 rounded-xl border border-dashed border-[#C8C7BF] bg-[#FAFAF7] px-4 py-4">
              <Check />
              <span className="flex-1 text-[17px] font-semibold">{serviceName.get(DISCOUNT_CLUB) ?? 'Discount Club'}</span>
              <span className="text-[15px] font-semibold text-[#1F7A4D]">Included</span>
            </div>
          </div>

          {nudge && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber bg-amber-soft px-5 py-4">
              <p className="text-amber-ink">
                <strong>Save {money(nudge.savingsCents)} a month.</strong> The {nudge.product.name} covers everything you picked for{' '}
                {money(nudge.product.priceCents)}.
              </p>
              <button
                type="button"
                onClick={() => goCheckout({ kind: 'plan', id: nudge.product.id })}
                className="min-h-11 rounded-lg bg-navy px-4 text-[15px] font-bold text-white"
              >
                Switch to {nudge.product.name}
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
            <div className="flex items-baseline gap-2" aria-live="polite">
              <span className="text-[17px] text-muted">Your total:</span>
              <span className="text-4xl font-extrabold tracking-tight">{money(customTotal)}</span>
              <span className="text-muted">/month</span>
            </div>
            <button
              type="button"
              disabled={picked.length === 0}
              onClick={() => goCheckout({ kind: 'custom' })}
              className={`min-h-[52px] rounded-[10px] bg-navy px-7 text-[17px] font-bold text-white disabled:bg-line disabled:text-subtle ${picked.length > 0 ? 'pulse-cta' : ''}`}
            >
              {picked.length === 0 ? 'Pick at least one item' : 'Continue to checkout'}
            </button>
          </div>
        </div>
      </section>

      {/* 5. Checkout */}
      <section id="checkout" className="mx-auto max-w-[640px] scroll-mt-4 px-4 pb-14 sm:px-6">
        <div className="flex flex-col gap-5 rounded-[18px] border border-line bg-white p-6 sm:p-9">
          <h2 className="text-[28px] font-extrabold tracking-tight">Checkout</h2>
          <div className="flex flex-col gap-2.5 rounded-xl bg-cream px-5 py-4">
            <div className="flex justify-between gap-3 text-[17px] font-bold">
              <span>{summary.name}</span>
              <span>{money(summary.price)}/mo</span>
            </div>
            <p className="text-[15px] text-muted">{summary.detail}</p>
          </div>

          {signedInEmail ? (
            <p className="text-[15px] text-muted">
              Signed in as <strong className="text-navy">{signedInEmail}</strong>
            </p>
          ) : (
            <fieldset ref={fieldsRef} className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-3 text-[15px] text-muted">
                Create your account. Already a member? <a href="/login" className="font-semibold text-navy underline">Log in</a>.
              </legend>
              <IdentityFields errors={fieldErrors} onEdit={(n) => fieldErrors[n] && setFieldErrors({ ...fieldErrors, [n]: '' })} />
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                Phone
                <input className={field} type="tel" autoComplete="tel" name="phone" aria-invalid={!!fieldErrors.phone} value={account.phone} onChange={(e) => { setAccount({ ...account, phone: e.target.value }); if (fieldErrors.phone) setFieldErrors({ ...fieldErrors, phone: '' }); }} />
                {fieldErrors.phone && <span role="alert" className="font-semibold text-danger">{fieldErrors.phone}</span>}
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">
                Email
                <input className={field} type="email" autoComplete="email" name="email" aria-invalid={!!fieldErrors.email} value={account.email} onChange={(e) => { setAccount({ ...account, email: e.target.value }); if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: '' }); }} />
                {fieldErrors.email && <span role="alert" className="font-semibold text-danger">{fieldErrors.email}</span>}
                <span className="font-medium text-[#7A4E05]">You’ll register every service with this email.</span>
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">
                Password (at least 8 characters)
                <input className={field} type="password" autoComplete="new-password" name="password" aria-invalid={!!fieldErrors.password} value={account.password} onChange={(e) => { setAccount({ ...account, password: e.target.value }); if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: '' }); }} />
                {fieldErrors.password && <span role="alert" className="font-semibold text-danger">{fieldErrors.password}</span>}
              </label>
            </fieldset>
          )}

          <label className="flex cursor-pointer items-start gap-3 text-[15px] leading-relaxed">
            <input
              type="checkbox"
              required
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-[22px] w-[22px] shrink-0 accent-navy"
            />
            <span>
              {policy.wording} <a href="/refund-policy" className="underline">Refund Policy</a>
            </span>
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-[15px] font-semibold text-[#7A1F15]">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={!canPay}
            onClick={pay}
            className="min-h-14 rounded-[10px] bg-amber text-lg font-extrabold text-navy disabled:bg-line disabled:text-subtle"
          >
            {busy ? 'Opening secure checkout…' : payHint}
          </button>
          <p className="text-center text-[13px] text-subtle">Secure card payment. Renews monthly until you cancel.</p>
        </div>
      </section>
    </>
  );
}

export function PickPlanButton({ planId, className, children }: { planId: string; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        window.dispatchEvent(new CustomEvent(PICK_EVENT, { detail: planId }));
        document.getElementById('checkout')?.scrollIntoView({ block: 'start' });
      }}
    >
      {children}
    </button>
  );
}
