'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cheaperPackage, type PublicCatalog, type Selection } from '@/lib/catalog-shared';
import { money } from '@/lib/money';

export function PlanManager({
  catalog,
  currentIds,
  currentTotal,
  canceled,
  earlyCanceled = false,
  canChange,
  accessEnds,
  yearly = null,
}: {
  catalog: PublicCatalog;
  currentIds: string[];
  currentTotal: number;
  canceled: boolean;
  earlyCanceled?: boolean;
  canChange: boolean;
  accessEnds: string;
  /** Yearly plan: what cancelling now means (3-month refund rule). */
  yearly?: { eligible: boolean; refund: string; monthsUsed: number; accessUntil: string } | null;
}) {
  const router = useRouter();
  const packages = catalog.products.filter((p) => p.kind === 'package');
  const addons = catalog.products.filter((p) => p.kind === 'addon');
  const onPackage = currentIds.length === 1 && packages.some((p) => p.id === currentIds[0]);

  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<string[]>(onPackage ? [] : currentIds);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function call(url: string, body?: unknown) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json();
      setMsg({ ok: res.ok, text: data.message ?? data.error ?? 'Something went wrong.' });
      if (res.ok) {
        setEditing(false);
        setConfirmCancel(false);
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: 'Something went wrong. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  const change = (selection: Selection, newTotal: number) => {
    const when = newTotal > currentTotal ? 'You’ll be charged the difference for the rest of this month now.' : `This takes effect on your next billing date (${accessEnds}).`;
    if (window.confirm(`Change your plan to ${money(newTotal)}/month? ${when}`)) call('/api/plan/change', { selection });
  };

  const pickedTotal = addons.filter((a) => picked.includes(a.id)).reduce((s, a) => s + a.priceCents, 0);
  const nudge = cheaperPackage(catalog, picked);
  const btn = 'min-h-12 rounded-[10px] border border-navy bg-white px-5 font-bold disabled:opacity-50';

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-6 sm:p-7">
      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={`rounded-lg px-4 py-3 font-semibold ${msg.ok ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-[#7A1F15]'}`}>
          {msg.text}
        </p>
      )}

      {earlyCanceled ? (
        <p className="text-[15px] text-muted">Your yearly plan was canceled with a refund. You can buy a new plan any time from the home page.</p>
      ) : canceled ? (
        <div className="flex flex-col gap-3">
          <p className="text-[15px] text-muted">Changed your mind? Keep your plan and it renews as usual.</p>
          <button type="button" disabled={busy} onClick={() => call('/api/plan/resume')} className="min-h-12 self-start rounded-[10px] bg-amber px-5 font-bold text-navy">
            Keep my plan
          </button>
        </div>
      ) : (
        <>
          {yearly && <p className="text-[15px] text-muted">You’re on yearly billing. To change items or switch to monthly, please email us and we’ll set it up.</p>}
          <div className="flex flex-wrap gap-3">
            {!yearly && packages
              .filter((p) => !(onPackage && currentIds[0] === p.id))
              .map((p) => (
                <button key={p.id} type="button" disabled={busy || !canChange} className={btn} onClick={() => change({ plan: p.id }, p.priceCents)}>
                  {p.priceCents > currentTotal ? 'Upgrade' : 'Switch'} to {p.name} ({money(p.priceCents)})
                </button>
              ))}
            {!yearly && (
              <button type="button" disabled={busy || !canChange} className={btn} onClick={() => setEditing((v) => !v)}>
                Change items
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => setConfirmCancel(true)} className="min-h-12 rounded-[10px] border border-danger bg-white px-5 font-bold text-danger">
              Cancel plan
            </button>
          </div>

          {!canChange && !yearly && <p className="text-[15px] text-muted">You can change your plan once your payment is up to date.</p>}

          {confirmCancel && (
            <div role="alertdialog" aria-label="Confirm cancellation" className="flex flex-col gap-3 rounded-xl border border-danger bg-danger-soft p-5">
              <p className="font-semibold text-[#7A1F15]">
                {yearly
                  ? yearly.eligible
                    ? `You’re within the first 3 months of your yearly plan. If you cancel now, you pay the monthly price for ${yearly.monthsUsed} month${yearly.monthsUsed === 1 ? '' : 's'}, ${yearly.refund} is refunded to your card, and you keep access through ${yearly.accessUntil}.`
                    : `If you cancel, you won’t be charged again and you keep access through ${accessEnds}. After the first 3 months of a yearly plan there are no refunds.`
                  : `If you cancel, you won’t be charged again and you keep access through ${accessEnds}. No refunds for the current month.`}
              </p>
              <div className="flex flex-wrap gap-3">
                <button type="button" disabled={busy} onClick={() => call('/api/plan/cancel')} className="min-h-12 rounded-[10px] bg-danger px-5 font-bold text-white">
                  Yes, cancel my plan
                </button>
                <button type="button" onClick={() => setConfirmCancel(false)} className={btn}>
                  Keep my plan
                </button>
              </div>
            </div>
          )}

          {editing && (
            <div className="flex flex-col gap-4 border-t border-line pt-5">
              <h2 className="text-xl font-bold">Pick your items</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {addons.map((a) => {
                  const on = picked.includes(a.id);
                  return (
                    <label key={a.id} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl px-4 py-3 ${on ? 'border-2 border-navy bg-cream' : 'border border-line'}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setPicked((c) => (on ? c.filter((x) => x !== a.id) : [...c, a.id]))}
                        className="h-[22px] w-[22px] accent-navy"
                      />
                      <span className="flex-1 font-semibold">{a.name}</span>
                      <span className="font-bold">{money(a.priceCents)}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[15px] text-muted">Discount Club stays included with any plan.</p>
              {nudge && (
                <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber bg-amber-soft px-4 py-3">
                  <p className="text-amber-ink">
                    <strong>Save {money(nudge.savingsCents)} a month</strong> with the {nudge.product.name}.
                  </p>
                  <button type="button" disabled={busy} className="min-h-11 rounded-lg bg-navy px-4 font-bold text-white" onClick={() => change({ plan: nudge.product.id }, nudge.product.priceCents)}>
                    Switch to {nudge.product.name}
                  </button>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-lg">
                  New total: <strong>{money(pickedTotal)}</strong>/month
                </p>
                <button
                  type="button"
                  disabled={busy || picked.length === 0}
                  onClick={() => change({ addons: picked }, pickedTotal)}
                  className="min-h-12 rounded-[10px] bg-navy px-6 font-bold text-white disabled:bg-line disabled:text-subtle"
                >
                  Save changes
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
