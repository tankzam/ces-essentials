import Link from 'next/link';
import { PlanManager } from '@/components/PlanManager';
import { currentUser } from '@/lib/supabase/server';
import { currentPlan } from '@/lib/plan';
import { publicCatalog, planLabel } from '@/lib/catalog';
import { money, formatDate } from '@/lib/money';
import { shopifyAccountUrl } from '@/lib/shopify-billing';
import { allProducts } from '@/lib/catalog';
import { quoteFor } from '@/lib/yearly-server';
import { earlyCancelQuote } from '@/lib/yearly';

export const metadata = { title: 'My Plan — CES Essentials' };

export default async function Page() {
  const user = (await currentUser())!;
  const [plan, catalog, products] = await Promise.all([currentPlan(user.id), publicCatalog(), allProducts()]);

  if (!plan) {
    return (
      <>
        <h1 className="text-[32px] font-extrabold tracking-tight">My Plan</h1>
        <div className="rounded-2xl border border-line bg-white p-8">
          <p className="mb-4 text-lg">You don’t have a plan right now.</p>
          <Link href="/#plans" className="inline-flex min-h-12 items-center rounded-[10px] bg-amber px-6 font-bold text-navy">See plans</Link>
        </div>
      </>
    );
  }

  const sub = plan.subscription;
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const yearlyPlan = plan.items.some((i) => products.find((p) => p.id === i.product_id)?.billing_interval === 'year');
  const quote = yearlyPlan && !sub.cancel_at_period_end ? await quoteFor(sub).catch(() => null) : null;
  // Early-cancelled yearly plan: access ends when the last counted month ends.
  const earlyEnds =
    sub.early_cancel_at && sub.current_period_start && sub.current_period_end
      ? earlyCancelQuote({ periodStart: new Date(sub.current_period_start), periodEnd: new Date(sub.current_period_end), paidCents: 0, monthlyCents: 0, now: new Date(sub.early_cancel_at) }).accessUntil.toISOString()
      : null;
  const items = plan.items.map((i) => ({ id: i.product_id, name: productName(i.product_id), kind: catalog.products.find((p) => p.id === i.product_id)?.kind ?? 'addon' }));
  const total = plan.items.reduce((s, i) => s + i.unit_amount_cents, 0);
  const pending = sub.pending_product_ids?.length
    ? planLabel(sub.pending_product_ids.map((id) => ({ id, name: productName(id), kind: catalog.products.find((p) => p.id === id)?.kind ?? 'addon' })))
    : null;

  return (
    <>
      <h1 className="text-[32px] font-extrabold tracking-tight">My Plan</h1>
      <div className="flex flex-col gap-[18px] rounded-2xl border border-line bg-white p-6 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <p className="mb-1 text-sm text-subtle">Current plan</p>
            <p className="text-[28px] font-extrabold">{planLabel(items)}</p>
            {items.length > 1 && <p className="text-[15px] text-muted">{items.map((i) => i.name).join(', ')}, Discount Club</p>}
          </div>
          <p className="text-[28px] font-extrabold">
            {money(total)}
            <span className="text-base font-medium text-subtle">/{yearlyPlan ? 'year' : 'month'}</span>
          </p>
        </div>
        {sub.early_cancel_at ? (
          <p role="status" className="rounded-[10px] bg-danger-soft px-4 py-3.5 text-[15px] font-semibold text-[#7A1F15]">
            Canceled. {money(sub.early_cancel_refund_cents ?? 0)} was refunded to your card. You keep access through {formatDate(earlyEnds)}.
          </p>
        ) : sub.cancel_at_period_end ? (
          <p role="status" className="rounded-[10px] bg-danger-soft px-4 py-3.5 text-[15px] font-semibold text-[#7A1F15]">
            Canceled. You keep access through {formatDate(sub.current_period_end)}, and you won’t be charged again.
          </p>
        ) : sub.status === 'past_due' ? (
          <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3.5 text-[15px] font-semibold text-[#7A1F15]">
            Your last payment didn’t go through. <Link href="/member/billing" className="underline">Update your card</Link> to keep your services.
          </p>
        ) : (
          <p className="text-[15px] text-muted">{sub.provider === 'shopify' ? `Paid through ${formatDate(sub.current_period_end)}. Renews automatically each ${yearlyPlan ? 'year' : 'month'}.` : `Renews ${yearlyPlan ? 'yearly on' : ''} ${formatDate(sub.current_period_end)}.`}</p>
        )}
        {pending && !sub.cancel_at_period_end && (
          <p className="rounded-[10px] bg-amber-soft px-4 py-3.5 text-[15px] text-amber-ink">
            Changes to <strong>{pending}</strong> on {formatDate(sub.pending_change_at)}. You keep everything you have until then.
          </p>
        )}
      </div>

      {sub.provider === 'shopify' ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-6 sm:p-7">
          <p className="text-[15px] text-muted">Your plan is billed through our secure CES Marketplace checkout. To change items, update your card, or cancel, open your CES Marketplace account. {yearlyPlan
              ? quote?.eligible
                ? ` If you cancel now (within the first 3 months), you pay the monthly price for ${quote.monthsUsed} month${quote.monthsUsed === 1 ? '' : 's'} and ${money(quote.refundCents)} is refunded.`
                : ' After the first 3 months there are no refunds; if you cancel, you keep access through the end of your paid year.'
              : ' If you cancel, you keep access through the end of your paid month.'}</p>
          <a href={shopifyAccountUrl()} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center self-start rounded-[10px] bg-navy px-5 font-bold text-white">Manage my subscription</a>
        </div>
      ) : (
      <PlanManager
        catalog={{ ...catalog, products: catalog.products.filter((p) => p.interval !== 'year') }}
        yearly={yearlyPlan ? { eligible: !!quote?.eligible, refund: money(quote?.refundCents ?? 0), monthsUsed: quote?.monthsUsed ?? 0, accessUntil: formatDate(quote?.accessUntil.toISOString() ?? sub.current_period_end) } : null}
        currentIds={plan.items.map((i) => i.product_id)}
        currentTotal={total}
        canceled={sub.cancel_at_period_end}
        earlyCanceled={!!sub.early_cancel_at}
        canChange={!yearlyPlan && ['active', 'trialing'].includes(sub.status)}
        accessEnds={formatDate(sub.current_period_end)}
      />
      )}
    </>
  );
}
