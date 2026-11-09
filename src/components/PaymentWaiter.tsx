'use client';

import { useEffect, useState } from 'react';

/** Waits for the webhook to confirm payment, then opens My Services. */
export function PaymentWaiter({ sessionId }: { sessionId: string }) {
  const [status, setStatus] = useState('pending');

  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      tries += 1;
      try {
        const res = await fetch(`/api/checkout/status?session_id=${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
        const body = await res.json();
        setStatus(body.status);
        if (body.status === 'paid') {
          window.location.href = '/member/services';
          return;
        }
        if (body.status === 'amount_mismatch' || body.status === 'signed_out') return;
      } catch {}
      if (tries < 40) timer = setTimeout(poll, 2000);
      else setStatus('slow');
    };
    poll();
    return () => clearTimeout(timer);
  }, [sessionId]);

  if (status === 'amount_mismatch') {
    return <p className="text-lg">We received your payment but need to check one detail before turning on your services. Our team will contact you shortly.</p>;
  }
  if (status === 'signed_out' || status === 'slow') {
    return (
      <p className="text-lg">
        Your payment is being confirmed. You’ll get a welcome email in a few minutes, and everything will be in your{' '}
        <a href="/member/services" className="font-semibold underline">member area</a>.
      </p>
    );
  }
  return (
    <p role="status" className="text-lg">
      Your payment went through. We’re setting up your services now — this takes a few seconds…
    </p>
  );
}
