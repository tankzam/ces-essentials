'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** A button that posts one action to /api/hr and shows the result. */
export function HrActionButton({
  body,
  children,
  confirm,
  className = 'min-h-12 rounded-[10px] border border-navy bg-white px-5 font-bold',
  redirectToUrl = false,
}: {
  body: Record<string, unknown>;
  children: React.ReactNode;
  confirm?: string;
  className?: string;
  redirectToUrl?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="inline-flex flex-col gap-2">
      <button
        type="button"
        disabled={busy}
        className={`${className} disabled:opacity-60`}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          setMsg(null);
          const res = await fetch('/api/hr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          const data = await res.json().catch(() => ({}));
          if (res.ok && redirectToUrl && data.url) {
            window.location.href = data.url;
            return;
          }
          setMsg({ ok: res.ok, text: data.message ?? data.error ?? (res.ok ? 'Done.' : 'Something went wrong.') });
          setBusy(false);
          if (res.ok) router.refresh();
        }}
      >
        {busy ? 'Working…' : children}
      </button>
      {msg && (
        <span role={msg.ok ? 'status' : 'alert'} className={`text-[15px] font-semibold ${msg.ok ? 'text-ok' : 'text-danger'}`}>
          {msg.text}
        </span>
      )}
    </span>
  );
}
