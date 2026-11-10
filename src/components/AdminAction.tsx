'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Posts one action to /api/admin and shows the result. */
export function AdminAction({
  body,
  children,
  confirm,
  className = 'min-h-11 rounded-lg border border-navy bg-white px-3.5 text-sm font-bold',
}: {
  body: Record<string, unknown>;
  children: React.ReactNode;
  confirm?: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={busy}
        className={`${className} disabled:opacity-60`}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          setMsg(null);
          const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          const data = await res.json().catch(() => ({}));
          setMsg({ ok: res.ok, text: data.message ?? data.error ?? 'Something went wrong.' });
          setBusy(false);
          if (res.ok) router.refresh();
        }}
      >
        {busy ? 'Working…' : children}
      </button>
      {msg && <span role={msg.ok ? 'status' : 'alert'} className={`text-[13px] font-semibold ${msg.ok ? 'text-ok' : 'text-danger'}`}>{msg.text}</span>}
    </span>
  );
}
