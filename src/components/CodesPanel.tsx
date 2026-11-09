'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export function CodesPanel({ threshold }: { threshold: number }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(String(threshold));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function saveThreshold() {
    const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'threshold', value: Number(value) }) });
    const data = await res.json().catch(() => ({}));
    setMsg({ ok: res.ok, text: data.message ?? data.error });
    if (res.ok) router.refresh();
  }

  async function upload(f: File) {
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.append('file', f);
    const res = await fetch('/api/admin/codes', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    setMsg({ ok: res.ok, text: data.message ?? data.error ?? 'Upload failed.' });
    setBusy(false);
    if (file.current) file.current.value = '';
    if (res.ok) router.refresh();
  }

  return (
    <>
      <div className="rounded-2xl border border-line bg-white p-5">
        <label className="flex flex-col gap-1.5 text-sm text-subtle">
          Alert when below
          <span className="flex gap-2">
            <input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))} className="w-24 rounded-lg border border-line px-3 text-[26px] font-extrabold text-navy" />
            <button type="button" onClick={saveThreshold} className="min-h-11 rounded-lg border border-navy px-3 text-sm font-bold text-navy">Save</button>
          </span>
        </label>
      </div>
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-[#C8C7BF] bg-white p-8 text-center md:col-span-3">
        <p className="text-lg font-bold">Upload the provider&apos;s code spreadsheet</p>
        <p className="text-[15px] text-muted">CSV or Excel. Duplicate codes are skipped. Used codes are never reassigned.</p>
        <input ref={file} id="codes-file" type="file" accept=".csv,.xlsx,text/csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        <label htmlFor="codes-file" className="inline-flex min-h-12 cursor-pointer items-center rounded-[10px] bg-navy px-6 font-bold text-white">{busy ? 'Uploading…' : 'Choose file'}</label>
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`font-semibold ${msg.ok ? 'text-ok' : 'text-danger'}`}>{msg.text}</p>}
      </div>
    </>
  );
}
