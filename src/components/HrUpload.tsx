'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { money } from '@/lib/money';
import { billedSeats } from '@/lib/company';

interface Review {
  fileName: string;
  ready: { firstName: string; lastName: string; email: string }[];
  skipped: { email: string; reason: string }[];
  errors: { row: number; message: string }[];
}

export function HrUpload({ activeCount, priceCents }: { activeCount: number; priceCents: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'pick' | 'review' | 'done'>('pick');
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneText, setDoneText] = useState('');
  const [dragging, setDragging] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/hr/upload', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? 'We could not read that file.');
    setReview(data);
    setStep('review');
  }

  async function confirm() {
    if (!review) return;
    setBusy(true);
    setError(null);
    const res = await fetch('/api/hr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', people: review.ready }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? 'Something went wrong.');
    setDoneText(data.message);
    setStep('done');
    router.refresh();
  }

  const reset = () => {
    setStep('pick');
    setReview(null);
    setError(null);
    if (input.current) input.current.value = '';
  };

  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 font-semibold text-[#7A1F15]">{error}</p>}

      {step === 'pick' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
          className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center ${dragging ? 'border-navy bg-cream' : 'border-[#C8C7BF] bg-white'}`}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#0B0C1B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M6 10l6-6 6 6" /><path d="M4 20h16" /></svg>
          <p className="text-lg font-bold">Drag your spreadsheet here</p>
          <p className="text-[15px] text-muted">CSV or Excel (.xlsx)</p>
          <input ref={input} type="file" accept=".csv,.xlsx,text/csv" className="sr-only" id="hr-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
          <label htmlFor="hr-file" className="inline-flex min-h-12 cursor-pointer items-center rounded-[10px] bg-navy px-6 font-bold text-white">
            {busy ? 'Checking…' : 'Choose file'}
          </label>
        </div>
      )}

      {step === 'review' && review && (
        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-6">
          <p className="text-[15px] text-subtle">{review.fileName}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-ok-soft p-4"><p className="text-[28px] font-extrabold text-ok">{review.ready.length}</p><p className="text-sm font-semibold text-ok">Ready to add</p></div>
            <div className="rounded-xl bg-amber-soft p-4"><p className="text-[28px] font-extrabold text-[#7A4E05]">{review.skipped.length}</p><p className="text-sm font-semibold text-[#7A4E05]">Already on your team, skipped</p></div>
            <div className="rounded-xl bg-danger-soft p-4"><p className="text-[28px] font-extrabold text-[#7A1F15]">{review.errors.length}</p><p className="text-sm font-semibold text-[#7A1F15]">Needs fixing</p></div>
          </div>
          {review.errors.map((e) => (
            <p key={`${e.row}-${e.message}`} className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-[#7A1F15]">
              Row {e.row}: {e.message} Fix it in your file and upload again, or continue without that row.
            </p>
          ))}
          {review.ready.length > 0 ? (
            <>
              <p className="text-[15px] text-muted">
                Adding {review.ready.length} {review.ready.length === 1 ? 'person' : 'people'} brings you to{' '}
                <strong className="text-navy">{activeCount + review.ready.length}</strong> active, and your next bill to{' '}
                <strong className="text-navy">{money(billedSeats(activeCount + review.ready.length) * priceCents)}</strong>. Each person gets a welcome email with their login.
              </p>
              <div className="flex flex-wrap gap-3">
                <button type="button" disabled={busy} onClick={confirm} className="min-h-[50px] rounded-[10px] bg-amber px-5 font-extrabold text-navy disabled:opacity-60">
                  {busy ? 'Adding…' : `Add ${review.ready.length} ${review.ready.length === 1 ? 'person' : 'people'} and send welcome emails`}
                </button>
                <button type="button" onClick={reset} className="min-h-[50px] rounded-[10px] border border-[#C8C7BF] px-5 font-bold text-muted">Cancel</button>
              </div>
            </>
          ) : (
            <button type="button" onClick={reset} className="min-h-[50px] self-start rounded-[10px] border border-navy px-5 font-bold">Upload another file</button>
          )}
        </div>
      )}

      {step === 'done' && (
        <div role="status" className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-white p-8 text-center">
          <span className="inline-flex h-[60px] w-[60px] items-center justify-center rounded-full bg-ok-soft">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#1F6B45" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
          </span>
          <p className="text-xl font-extrabold">{doneText}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/hr/employees" className="inline-flex min-h-12 items-center rounded-[10px] bg-navy px-5 font-bold text-white">View employees</Link>
            <button type="button" onClick={reset} className="min-h-12 rounded-[10px] border border-navy px-5 font-bold">Upload another file</button>
          </div>
        </div>
      )}
    </div>
  );
}
