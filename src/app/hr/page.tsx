import Link from 'next/link';
import { HrActionButton } from '@/components/HrActionButton';
import { requireHrPage } from '@/lib/accounts';
import { orgPeople, orgSubscription } from '@/lib/hr';
import { admin } from '@/lib/supabase/admin';
import { billedSeats, MIN_SEATS } from '@/lib/company';
import { money, formatDate } from '@/lib/money';

export const metadata = { title: 'HR Dashboard — CES Essentials' };

export default async function Page() {
  const { org } = await requireHrPage();
  const [sub, people, { data: products }] = await Promise.all([
    orgSubscription(org.id),
    orgPeople(org.id),
    admin().from('products').select('id, name, price_cents').in('id', ['starter_company', 'all_in_one_company']),
  ]);
  const plan = products?.find((p) => p.id === org.plan_product_id);
  const other = products?.find((p) => p.id !== org.plan_product_id);
  const active = people.filter((p) => p.status === 'active').length;
  const billed = billedSeats(active);
  const price = plan?.price_cents ?? 0;
  const planName = (n?: string) => n?.replace(' (Company)', '') ?? '—';

  if (!sub) {
    return (
      <>
        <h1 className="text-[32px] font-extrabold tracking-tight">Overview</h1>
        <div className="rounded-2xl border border-line bg-white p-7">
          <p className="text-lg">Your company plan isn&apos;t active yet. If you just paid, it can take a minute. Refresh this page shortly.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="text-[32px] font-extrabold tracking-tight">Overview</h1>
      {sub.status === 'past_due' && (
        <p role="alert" className="rounded-xl bg-danger-soft px-5 py-4 font-semibold text-[#7A1F15]">
          The last company payment didn&apos;t go through. <Link href="/hr/billing" className="underline">Update the company card</Link> to keep everyone&apos;s services on.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="mb-1.5 text-sm text-subtle">Company plan</p>
          <p className="text-[26px] font-extrabold">{planName(plan?.name)}</p>
          <p className="mt-1.5 text-sm text-subtle">{money(price)} per person</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="mb-1.5 text-sm text-subtle">Active people</p>
          <p className="text-[26px] font-extrabold">{active}</p>
          <p className="mt-1.5 text-sm text-subtle">{MIN_SEATS}-person minimum</p>
        </div>
        <div className="rounded-2xl bg-navy p-5 text-white">
          <p className="mb-1.5 text-sm text-mist">Next monthly bill</p>
          <p className="text-[26px] font-extrabold text-amber">{sub.cancel_at_period_end ? 'None' : money(billed * price)}</p>
          <p className="mt-1.5 text-sm text-mist">
            {sub.cancel_at_period_end ? `Plan ends ${formatDate(sub.current_period_end)}` : `${billed} people × ${money(price)} · ${formatDate(sub.current_period_end)}`}
          </p>
        </div>
      </div>
      {active < MIN_SEATS && (
        <p role="status" className="rounded-xl border border-amber bg-amber-soft px-5 py-3.5 text-[15px] text-amber-ink">
          You have {active} active {active === 1 ? 'person' : 'people'}. Company plans bill a minimum of {MIN_SEATS}, so you&apos;re billed for {MIN_SEATS}. Add {MIN_SEATS - active} more at no extra cost.
        </p>
      )}
      {sub.keep_until && Date.parse(sub.keep_until) > Date.now() && (
        <p className="rounded-xl bg-amber-soft px-5 py-3.5 text-[15px] text-amber-ink">
          Your team moves to {planName(plan?.name)} on {formatDate(sub.keep_until)}. Everyone keeps their current services until then.
        </p>
      )}
      <div className="flex flex-col gap-3.5 rounded-2xl border border-line bg-white p-6">
        <h2 className="text-xl font-bold">Quick actions</h2>
        <div className="flex flex-wrap items-start gap-3">
          <Link href="/hr/upload" className="inline-flex min-h-12 items-center rounded-[10px] bg-amber px-5 font-bold text-navy">Upload employees</Link>
          <Link href="/hr/employees" className="inline-flex min-h-12 items-center rounded-[10px] border border-navy bg-white px-5 font-bold">Manage employees</Link>
          {other && (
            <HrActionButton
              body={{ action: 'plan', plan: other.id }}
              confirm={
                other.price_cents > price
                  ? `Upgrade your team to ${planName(other.name)} at ${money(other.price_cents)} per person? The difference for the rest of this month is charged now.`
                  : `Switch your team to ${planName(other.name)} at ${money(other.price_cents)} per person? It takes effect on your next billing date.`
              }
            >
              {other.price_cents > price ? 'Upgrade team to' : 'Switch team to'} {planName(other.name)} ({money(other.price_cents)})
            </HrActionButton>
          )}
        </div>
      </div>
    </>
  );
}
