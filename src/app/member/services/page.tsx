import { businessOnly } from '@/lib/sales';
import Link from 'next/link';
import { CopyButton } from '@/components/CopyButton';
import { admin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';
import { currentPlan } from '@/lib/plan';
import { effectiveStatus, hasAccess, setupInfo, type AccessStatus } from '@/lib/fulfillment';
import { formatDate } from '@/lib/money';

export const metadata = { title: 'My Services — CES Essentials' };

export default async function Page() {
  const biz = await businessOnly();
  const user = (await currentUser())!;
  const db = admin();
  const [{ data: profile }, { data: ents }, { data: services }, plan] = await Promise.all([
    db.from('profiles').select('email').eq('id', user.id).single(),
    db.from('entitlements').select('service_id, status, available_at').eq('member_id', user.id).neq('status', 'ended'),
    db.from('services').select('id, name, member_description, sort_order').order('sort_order'),
    currentPlan(user.id),
  ]);
  const email = profile!.email as string;
  const byId = new Map((ents ?? []).map((e) => [e.service_id as string, e]));

  const cards = await Promise.all(
    (services ?? [])
      .filter((s) => byId.has(s.id))
      .map(async (s) => {
        const e = byId.get(s.id)!;
        const status = effectiveStatus({ status: e.status as AccessStatus }, plan?.subscription ?? null);
        // Codes and links only while access is on.
        const info = hasAccess(status) ? await setupInfo(s.id, user.id, { assignCode: true }) : null;
        return { service: s, status, availableAt: e.available_at as string, info };
      }),
  );

  return (
    <>
      <h1 className="text-[32px] font-extrabold tracking-tight">My Services</h1>
      <div role="note" className="flex items-start gap-3.5 rounded-[14px] border-2 border-amber bg-amber-soft px-5 py-5">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7A4E05" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 6 9-6" />
        </svg>
        <div className="flex flex-col gap-1">
          <p className="text-[17px] font-bold text-amber-ink">Use your account email to register every service: {email}</p>
          <p className="text-[15px] text-[#5A3E0C]">Each provider matches your membership by this email. Registering with a different email means the service won’t recognize you.</p>
        </div>
      </div>

      {plan?.subscription && plan.subscription.status === 'past_due' && (
        <p role="alert" className="rounded-xl bg-danger-soft px-5 py-4 font-semibold text-[#7A1F15]">
          Your last payment didn’t go through. {cards.some((c) => c.status === 'paused') ? 'Your services are paused.' : 'Your services stay on for 2 days while we retry.'}{' '}
          <Link href="/member/billing" className="underline">Update your card</Link>
        </p>
      )}

      {cards.length === 0 ? (
        <div className="rounded-2xl border border-line bg-white p-8">
          <p className="mb-4 text-lg">You don’t have any active services right now.</p>
          {biz ? (
            <p className="text-[17px] text-muted">If your company provides CES Essentials, ask your HR contact to add you. Questions? <Link href="/contact" className="font-semibold underline">Contact us</Link>.</p>
          ) : (
            <Link href="/#plans" className="inline-flex min-h-12 items-center rounded-[10px] bg-amber px-6 font-bold text-navy">See plans</Link>
          )}
        </div>
      ) : (
        <div className="grid gap-[18px] md:grid-cols-2">
          {cards.map(({ service, status, availableAt, info }) => (
            <article key={service.id} className="flex flex-col gap-3.5 rounded-2xl border border-line bg-white p-6">
              <div className="flex items-center justify-between gap-2.5">
                <h2 className="text-[19px] font-bold">{service.name}</h2>
                {hasAccess(status) ? (
                  <span className="rounded-full bg-ok-soft px-2.5 py-1 text-[13px] font-bold text-ok">Active</span>
                ) : (
                  <span className="rounded-full bg-danger-soft px-2.5 py-1 text-[13px] font-bold text-[#7A1F15]">Paused</span>
                )}
              </div>
              <p className="text-[15px] leading-relaxed text-muted">{service.member_description}</p>

              {!info ? (
                <p className="text-[15px]">
                  Paused until your payment goes through. <Link href="/member/billing" className="font-semibold underline">Update your card</Link>
                </p>
              ) : (
                <>
                  {service.id === 'legal_tax' && Date.parse(availableAt) + 24 * 3600_000 > Date.now() && (
                    <p className="rounded-lg bg-cream px-3 py-2 text-[14px]">
                      Your account becomes active between {formatDate(availableAt)} and {formatDate(new Date(Date.parse(availableAt) + 24 * 3600_000).toISOString())}. If you’re not recognized yet, try again after 48 hours.
                    </p>
                  )}
                  <ol className="list-decimal space-y-1 pl-5 text-[15px]">
                    {info.steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  {info.waitingForCode && (
                    <p className="rounded-lg bg-cream px-3 py-2 text-[14px]">Your activation code is being prepared. We’ll email it to you as soon as it’s ready.</p>
                  )}
                  {info.code && (
                    <div className="flex flex-col gap-2">
                      <span className="text-[13px] font-semibold text-subtle">{info.codeLabel}</span>
                      <div className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 break-all rounded-lg border border-dashed border-[#C8C7BF] bg-cream px-3.5 py-3 text-[17px] font-bold tracking-wider">{info.code}</code>
                        <CopyButton text={info.code} />
                      </div>
                    </div>
                  )}
                  <p className="text-sm text-subtle">
                    Register with: <strong className="text-navy">{email}</strong>
                  </p>
                  <div className="mt-auto flex flex-col gap-2">
                    {(info.links ?? []).map((l) => (
                      <a
                        key={l.href}
                        href={l.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-12 items-center justify-center rounded-[10px] bg-navy px-4 text-center font-bold text-white"
                      >
                        {l.label}
                      </a>
                    ))}
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
