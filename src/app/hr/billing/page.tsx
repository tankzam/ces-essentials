import type Stripe from 'stripe';
import { HrActionButton } from '@/components/HrActionButton';
import { requireHrPage } from '@/lib/accounts';
import { orgPeople, orgSubscription } from '@/lib/hr';
import { admin } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { billedSeats } from '@/lib/company';
import { money, formatDate } from '@/lib/money';

export const metadata = { title: 'Company billing — CES Essentials' };

async function card(subId?: string): Promise<string | null> {
  if (!subId) return null;
  try {
    const s = await stripe().subscriptions.retrieve(subId, { expand: ['default_payment_method'] });
    const pm = typeof s.default_payment_method === 'object' ? (s.default_payment_method as Stripe.PaymentMethod | null) : null;
    if (pm?.card) return `${pm.card.brand.charAt(0).toUpperCase()}${pm.card.brand.slice(1)} •••• ${pm.card.last4}`;
  } catch {}
  return null;
}

export default async function Page() {
  const { org } = await requireHrPage();
  const [sub, people, { data: plan }, { data: invoices }] = await Promise.all([
    orgSubscription(org.id),
    orgPeople(org.id),
    admin().from('products').select('price_cents').eq('id', org.plan_product_id ?? '').maybeSingle(),
    admin().from('invoices').select('*').eq('organization_id', org.id).order('created_at', { ascending: false }).limit(50),
  ]);
  const billed = billedSeats(people.filter((p) => p.status === 'active').length);
  const price = plan?.price_cents ?? 0;
  const cardText = await card(sub?.stripe_subscription_id);

  return (
    <>
      <h1 className="text-[32px] font-extrabold tracking-tight">Billing</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="mb-1.5 text-sm text-subtle">Next bill{sub?.current_period_end && !sub.cancel_at_period_end ? ` · ${formatDate(sub.current_period_end)}` : ''}</p>
          <p className="text-[26px] font-extrabold">{!sub ? '—' : sub.cancel_at_period_end ? 'None' : money(billed * price)}</p>
          <p className="mt-1.5 text-sm text-subtle">{billed} people × {money(price)}</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="mb-1.5 text-sm text-subtle">Card on file</p>
          <p className="mb-3 text-[26px] font-extrabold">{cardText ?? 'No card on file'}</p>
          {org.stripe_customer_id && <HrActionButton body={{ action: 'portal' }} redirectToUrl>Update card</HrActionButton>}
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[520px] border-collapse text-[15px]">
          <thead>
            <tr className="text-left text-[13px] uppercase tracking-wider text-subtle">
              <th className="px-4 py-3.5">Date</th>
              <th className="px-4 py-3.5">People billed</th>
              <th className="px-4 py-3.5">Amount</th>
              <th className="px-4 py-3.5">Invoice</th>
            </tr>
          </thead>
          <tbody>
            {(invoices ?? []).length === 0 && <tr className="border-t border-line"><td colSpan={4} className="px-4 py-4 text-muted">No invoices yet.</td></tr>}
            {(invoices ?? []).map((inv) => (
              <tr key={inv.stripe_invoice_id} className="border-t border-line">
                <td className="px-4 py-3.5">{formatDate(inv.paid_at ?? inv.created_at)}</td>
                <td className="px-4 py-3.5">{inv.quantity ?? '—'}</td>
                <td className="px-4 py-3.5 font-bold">{money(inv.status === 'paid' ? inv.amount_paid_cents : inv.amount_due_cents)}{inv.status !== 'paid' && <span className="ml-2 text-sm font-semibold text-danger">Not paid</span>}</td>
                <td className="px-4 py-3.5">
                  {inv.invoice_pdf_url ? <a href={inv.invoice_pdf_url} className="font-semibold underline">Download</a> : inv.hosted_invoice_url ? <a href={inv.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="font-semibold underline">View</a> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
