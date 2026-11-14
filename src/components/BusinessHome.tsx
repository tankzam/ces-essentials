import { TopNav, SiteFooter } from '@/components/SiteChrome';
import { CESRefreshIntro } from '@/components/CESRefreshIntro';
import { BusinessForm } from '@/components/BusinessForm';
import { money } from '@/lib/money';
import type { PublicCatalog } from '@/lib/catalog-shared';
import type { CompanyPlan } from '@/lib/company-pricing';

// The homepage while the site sells to businesses only.

const steps = [
  { title: 'Tell us about your company', text: 'Fill out the short form below. Your company pricing appears right away.' },
  { title: 'Get your signup link', text: 'We review your request and email a private link. Pick your team size, set up your HR login, and pay with a company card.' },
  { title: 'Add your people', text: 'Upload one spreadsheet of names and emails. Everyone gets their own login and a welcome email.' },
];

const faqs = (p: CompanyPlan | undefined, minSeats: number): [string, string][] => [
  ['Who can sign up?', `Businesses and organizations with ${minSeats} or more people.`],
  [
    'How much does it cost?',
    p
      ? `The ${p.name} plan is ${money(p.priceCents)} per person a month, billed monthly for your active people, with a ${minSeats}-person minimum.`
      : `Fill out the form to see your company pricing. Plans have a ${minSeats}-person minimum.`,
  ],
  ['How do employees get access?', 'You upload a spreadsheet of names and emails from your HR dashboard. Each person gets their own login and a welcome email with their setup steps.'],
  ['Can we add or remove people?', 'Yes, anytime from your HR dashboard. Your bill adjusts. Someone you remove keeps access through the end of that billing month.'],
  ['How fast do employees get access?', 'Most services are ready as soon as you add someone. Family Legal + Tax Prep takes 24 to 48 hours to become active.'],
  ['Are there refunds?', 'There are no refunds once a billing month has started. Your company can cancel anytime to stop future charges.'],
];

export function BusinessHome({ catalog, healthcare, plans, minSeats }: { catalog: PublicCatalog; healthcare: boolean; plans: CompanyPlan[]; minSeats: number }) {
  const main = plans.find((p) => p.id === 'starter_company') ?? plans[0];
  const business = main ? { name: main.name, priceCents: main.priceCents, serviceIds: main.serviceIds } : null;

  return (
    <div>
      <CESRefreshIntro part="hero" catalog={catalog} healthcare={healthcare} business={business} nav={<TopNav wordmark />} />

      <main>
        <CESRefreshIntro part="services" catalog={catalog} healthcare={healthcare} business={business} />

        {/* How it works */}
        <section id="how" className="mx-auto max-w-[1180px] scroll-mt-4 px-4 pt-20 sm:px-6">
          <h2 className="mb-10 text-center text-3xl font-extrabold tracking-tight sm:text-4xl">How it works</h2>
          <ol className="grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-7">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-navy text-lg font-extrabold text-amber">{i + 1}</span>
                <h3 className="text-xl font-bold">{s.title}</h3>
                <p className="text-[17px] leading-relaxed text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Pricing + form */}
        <section id="get-pricing" className="mx-auto max-w-[1180px] scroll-mt-4 px-4 pb-10 pt-20 sm:px-6">
          <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            {main && (
              <div className="flex flex-col gap-5 rounded-[18px] bg-navy p-7 text-white sm:p-9">
                <p className="text-sm font-semibold uppercase tracking-widest text-amber">Company pricing</p>
                <h2 className="text-[30px] font-extrabold leading-tight tracking-tight">{main.name} for teams</h2>
                <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <span className="text-5xl font-extrabold tracking-tight">{money(main.priceCents)}</span>
                  <span className="text-mist">per person / month</span>
                </p>
                <p className="text-[17px] text-mist">For teams of {minSeats} or more. One monthly bill for your active people.</p>
                <ul className="flex flex-col gap-3">
                  {main.includes.map((i) => (
                    <li key={i} className="flex items-start gap-2.5 text-[17px]">
                      <svg className="mt-1 shrink-0 text-amber" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
                      {i}
                    </li>
                  ))}
                </ul>
                <p className="rounded-xl bg-navy-2 px-5 py-4 text-[16px] text-mist">
                  Example: {minSeats} people is <strong className="text-white">{money(minSeats * main.priceCents)}</strong> a month; 10 people is{' '}
                  <strong className="text-white">{money(10 * main.priceCents)}</strong>.
                </p>
              </div>
            )}
            <div className="rounded-[18px] border border-line bg-white p-6 sm:p-9">
              <BusinessForm plans={plans.map((p) => p.name)} />
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-[860px] scroll-mt-4 px-4 pb-14 pt-[72px] sm:px-6">
          <h2 className="mb-8 text-center text-3xl font-extrabold tracking-tight sm:text-4xl">FAQ</h2>
          <div className="flex flex-col gap-3">
            {faqs(main, minSeats).map(([q, a]) => (
              <details key={q} className="group rounded-xl border border-line bg-white">
                <summary className="flex min-h-[60px] cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[17px] font-semibold [&::-webkit-details-marker]:hidden">
                  <span>{q}</span>
                  <span aria-hidden="true" className="text-2xl font-medium group-open:hidden">+</span>
                  <span aria-hidden="true" className="hidden text-2xl font-medium group-open:inline">–</span>
                </summary>
                <p className="px-5 pb-5 text-[17px] leading-relaxed text-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
