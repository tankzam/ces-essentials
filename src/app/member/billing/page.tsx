import type Stripe from 'stripe';
import { PortalButton } from '@/components/PortalButton';
import { admin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';
import { currentPlan } from '@/lib/plan';
import { stripe } from '@/lib/stripe';
import { money, formatDate } from '@/lib/money';

export const metadata = { title: 'Billing — CES Essentials' };

async function cardOnFile(stripeSubscriptionId: string | undefined, customerId: string | null): Promise<string | null> {
  try {
    let pm: Stripe.PaymentMethod | null = null;
    if (stripeSubscriptionId) {
      const sub = await stripe().subscriptions.retrieve(stripeSubscriptionId, { expand: ['default_payment_method'] });
      pm = typeof sub.default_payment_method === 'object' ? sub.default_payment_method : null;
    }
    if (!pm && customerId) {
      const c = await stripe().customers.retrieve(customerId, { expand: ['invoice_settings.default_payment_method'] });
      if (!c.deleted) pm = (c.invoice_settings?.default_payment_method as Stripe.PaymentMethod | null) ?? null;
    }
    if (pm?.card) return `${pm.card.brand.charAt(0).toUpperCase()}${pm.card.brand.slice(1)} •••• ${pm.card.last4}`;
  } catch {}
  return null;
}

export default async function Page() {
  const user = (await currentUser())!;
  const db = admin();
  const [plan, { data: profile }, { data: invoices }] = await Promise.all([
    currentPlan(user.id),
    db.from('profiles').select('stripe_customer_id').eq('id', user.id).single(),
    db.from('invoices').select('*').eq('member_id', user.id).order('created_at', { ascending: false }).limit(50),
  ]);
  const card = await cardOnFile(plan?.subscription.stripe_subscription_id, profile?.stripe_customer_id ?? null);
  const sub = plan?.subscription;

  return (
    <>
      <h1 className="text-[32px] font-extrabold tracking-tight">Billing</h1>
      <div className="grid gap-[18px] md:grid-cols-2">
        <div className="rounded-2xl border border-line bg-white p-6">
          <p className="mb-1.5 text-sm text-subtle">Next billing date</p>
          <p className="text-[22px] font-extrabold">
            {!sub ? 'No active plan' : sub.cancel_at_period_end ? 'None — plan canceled' : formatDate(sub.current_period_end)}
          </p>
          {sub?.cancel_at_period_end && <p className="mt-1 text-[15px] text-muted">Access ends {formatDate(sub.current_period_end)}.</p>}
        </div>
        <div className="rounded-2xl border border-line bg-white p-6">
          <p className="mb-1.5 text-sm text-subtle">Card on file</p>
          <p className="mb-3 text-[22px] font-extrabold">{card ?? 'No card on file'}</p>
          {profile?.stripe_customer_id && <PortalButton />}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[520px] border-collapse text-[15px]">
          <caption className="px-5 pt-4 text-left text-lg font-bold">Payment history</caption>
          <thead>
            <tr className="text-left text-[13px] uppercase tracking-wider text-subtle">
              <th className="px-5 py-3.5">Date</th>
              <th className="px-5 py-3.5">Description</th>
              <th className="px-5 py-3.5">Amount</th>
              <th className="px-5 py-3.5">Status</th>
              <th className="px-5 py-3.5">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {(invoices ?? []).length === 0 && (
              <tr className="border-t border-line">
                <td colSpan={5} className="px-5 py-4 text-muted">No payments yet.</td>
              </tr>
            )}
            {(invoices ?? []).map((inv) => (
              <tr key={inv.stripe_invoice_id} className="border-t border-line">
                <td className="px-5 py-3.5">{formatDate(inv.paid_at ?? inv.created_at)}</td>
                <td className="px-5 py-3.5">{inv.description}</td>
                <td className="px-5 py-3.5 font-bold">{money(inv.status === 'paid' ? inv.amount_paid_cents : inv.amount_due_cents)}</td>
                <td className="px-5 py-3.5">{inv.status === 'paid' ? 'Paid' : inv.status === 'open' ? 'Not paid' : inv.status}</td>
                <td className="px-5 py-3.5">
                  {inv.hosted_invoice_url ? (
                    <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                      View
                    </a>
                  ) : inv.invoice_pdf_url ? (
                    <a href={inv.invoice_pdf_url} className="font-semibold underline">Download</a>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
