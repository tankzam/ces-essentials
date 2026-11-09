'use client';

import { useState } from 'react';

export function PortalButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch('/api/billing/portal', { method: 'POST' });
          const body = await res.json().catch(() => ({}));
          if (res.ok && body.url) window.location.href = body.url;
          else {
            setError(body.error ?? 'Could not open billing. Please try again.');
            setBusy(false);
          }
        }}
        className="min-h-12 rounded-[10px] border border-navy px-5 font-bold"
      >
        {busy ? 'Opening…' : 'Update card'}
      </button>
      {error && <p role="alert" className="mt-2 text-[15px] text-danger">{error}</p>}
    </>
  );
}
