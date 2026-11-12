import { TopNav, SiteFooter } from '@/components/SiteChrome';
import { PlanCheckout, PickPlanButton } from '@/components/PlanCheckout';
import { publicCatalog } from '@/lib/catalog';
import { admin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';
import { healthcareOnSale } from '@/lib/healthcare';

export const dynamic = 'force-dynamic';

const steps = (healthcare: boolean) => [
  { title: 'Pick your plan', text: healthcare ? 'Starter, All-in-One, or build your own.' : 'Starter, or build your own.' },
  { title: 'Check out securely', text: 'Pay by card. Cancel anytime, and your access lasts through the end of your billing month.' },
  { title: 'Get access right away', text: 'Your member area unlocks everything you bought, including activation codes.' },
];

const healthcareFaq = ["Who's covered by the healthcare?", 'You plus up to 3 more people, at any address.'];
const faqs = [
  ['Can I switch plans?', 'Yes, anytime, from your member area.'],
  ['How do I cancel?', 'From your member area. Your access lasts through the end of your billing month.'],
  ['How fast do I get access?', 'Most services are ready right after payment. Family Legal + Tax Prep takes 24 to 48 hours to become active.'],
  ['When can I use the legal plan and tax prep?', 'Your Family Legal + Tax Prep account takes 24 to 48 hours to become active. If you are not recognized yet, try again after 48 hours.'],
  ['Are there refunds?', 'No refunds once a billing month starts. You can cancel anytime to stop future charges.'],
];

export default async function Home() {
  const [catalog, user, policy, healthcare] = await Promise.all([
    publicCatalog(),
    currentUser(),
    admin().from('policy_versions').select('version, wording').eq('slug', 'refund_ack').order('version', { ascending: false }).limit(1).single(),
    healthcareOnSale(),
  ]);
  if (policy.error) throw policy.error;

  return (
    <div>
      {/* 1. Header */}
      <header className="bg-navy text-white">
        <TopNav />
        <section className="mx-auto flex max-w-[1180px] flex-col items-center gap-6 px-4 pb-24 pt-14 text-center sm:px-6 sm:pt-[72px]">
          <h1 className="max-w-[820px] text-[38px] font-extrabold leading-[1.05] tracking-tight sm:text-[56px]">
            {healthcare ? 'Healthcare, legal help, and protection for your whole family.' : 'Legal help, tax prep, and protection for your whole family.'}
          </h1>
          <p className="max-w-[680px] text-lg leading-relaxed text-mist sm:text-xl">
            {healthcare
              ? 'Unlimited $0-copay doctor visits, a family legal plan, tax prep, and credit monitoring, starting at $25.99 a month.'
              : 'A family legal plan, tax prep, credit monitoring, and a VPN, starting at $25.99 a month.'}
          </p>
          <a href="#plans" className="mt-2 inline-flex min-h-[52px] items-center gap-2.5 rounded-[10px] bg-amber px-7 text-[17px] font-bold text-navy">
            See plans
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
          </a>
        </section>
      </header>

      <main>
        {/* 2. How it works */}
        <section className="mx-auto max-w-[1180px] px-4 pt-20 sm:px-6">
          <h2 className="mb-10 text-center text-3xl font-extrabold tracking-tight sm:text-4xl">How it works</h2>
          <ol className="grid gap-6 md:grid-cols-3">
            {steps(healthcare).map((s, i) => (
              <li key={s.title} className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-7">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-navy text-lg font-extrabold text-amber">{i + 1}</span>
                <h3 className="text-xl font-bold">{s.title}</h3>
                <p className="leading-relaxed text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* 3–5. Plans, Build your own, Checkout */}
        <PlanCheckout catalog={catalog} signedInEmail={user?.email ?? null} policy={policy.data} />

        {/* 6. Savings (healthcare only) */}
        {healthcare && <section className="bg-navy text-white">
          <div className="mx-auto flex max-w-[1180px] flex-col gap-10 px-4 py-20 sm:px-6">
            <h2 className="max-w-[760px] text-3xl font-extrabold tracking-tight sm:text-4xl">
              What one visit could cost you, and what it costs our members.
            </h2>
            <div className="grid gap-5 md:grid-cols-3">
              {[
                { label: 'Doctor visit', usual: '$150–$300' },
                { label: 'Therapy', usual: '$100–$250' },
              ].map((c) => (
                <div key={c.label} className="flex flex-col gap-2.5 rounded-2xl bg-navy-2 p-7">
                  <p className="text-mist">{c.label}</p>
                  <p className="text-xl text-mist">
                    Usually <span className="whitespace-nowrap line-through">{c.usual}</span>
                  </p>
                  <p className="text-4xl font-extrabold text-amber">$0</p>
                  <p className="text-[15px] text-mist">for members</p>
                </div>
              ))}
              <div className="flex flex-col gap-2.5 rounded-2xl bg-navy-2 p-7">
                <p className="text-mist">Who&apos;s covered</p>
                <p className="text-4xl font-extrabold">You + 3</p>
                <p className="text-[15px] text-mist">Covers you plus up to 3 more people.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-5">
              <p className="text-2xl font-bold">One doctor visit pays for your whole month.</p>
              <PickPlanButton planId="all_in_one" className="min-h-[52px] rounded-[10px] bg-amber px-7 text-[17px] font-bold text-navy">
                Get the All-in-One
              </PickPlanButton>
            </div>
          </div>
        </section>}

        {/* 7. FAQ */}
        <section id="faq" className="mx-auto max-w-[860px] scroll-mt-4 px-4 pb-14 pt-[72px] sm:px-6">
          <h2 className="mb-8 text-center text-3xl font-extrabold tracking-tight sm:text-4xl">FAQ</h2>
          <div className="flex flex-col gap-3">
            {(healthcare ? [healthcareFaq, ...faqs] : faqs).map(([q, a]) => (
              <details key={q} className="group rounded-xl border border-line bg-white">
                <summary className="flex min-h-[60px] cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[17px] font-semibold [&::-webkit-details-marker]:hidden">
                  <span>{q}</span>
                  <span aria-hidden="true" className="text-2xl font-medium group-open:hidden">+</span>
                  <span aria-hidden="true" className="hidden text-2xl font-medium group-open:inline">–</span>
                </summary>
                <p className="px-5 pb-5 leading-relaxed text-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      {/* 8. Footer */}
      <SiteFooter />
    </div>
  );
}
