import Link from 'next/link';
import { Logo, SiteFooter } from '@/components/SiteChrome';
import { BusinessForm } from '@/components/BusinessForm';
import { healthcareOnSale } from '@/lib/healthcare';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'For Businesses — CES Essentials' };

const features = (healthcare: boolean) => [
  { title: 'Easy employee upload', text: 'Upload one spreadsheet of names and emails. Everyone gets their own login and welcome email.' },
  { title: 'One simple bill', text: 'Pay monthly for your active people. Your bill adjusts when you add or remove someone.' },
  healthcare
    ? { title: 'Two plans to choose from', text: 'Essential or All-in-One for your whole team, at company pricing well below our regular rates.' }
    : { title: 'Company pricing', text: 'Essential for your whole team: family legal help, tax prep, credit monitoring, and a VPN, at company pricing well below our regular rate.' },
];

export default async function Page() {
  const healthcare = await healthcareOnSale();
  return (
    <div>
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <Logo />
          <Link href="/" className="inline-flex min-h-11 items-center text-[15px] text-[#E6E7F0]">← Back to home</Link>
        </div>
        <section className="mx-auto flex max-w-[1180px] flex-col items-center gap-5 px-4 pb-20 pt-14 text-center sm:px-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-amber">For Businesses</p>
          <h1 className="max-w-[820px] text-[36px] font-extrabold leading-[1.08] tracking-tight sm:text-[52px]">
            {healthcare ? 'Give your team healthcare, legal help, and protection.' : 'Give your team legal help, tax prep, and protection.'}
          </h1>
          <p className="max-w-[680px] text-lg leading-relaxed text-mist sm:text-[19px]">
            Special company pricing for groups of 5 or more. One monthly bill, and you add or remove people anytime.
          </p>
        </section>
      </header>
      <main>
        <section className="mx-auto max-w-[1180px] px-4 pb-6 pt-16 sm:px-6">
          <div className="grid gap-5 md:grid-cols-3">
            {features(healthcare).map((f) => (
              <div key={f.title} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-white p-6">
                <h2 className="text-[19px] font-bold">{f.title}</h2>
                <p className="text-[15px] leading-relaxed text-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="mx-auto max-w-[720px] px-4 pb-24 pt-10 sm:px-6">
          <div className="rounded-[18px] border border-line bg-white p-6 sm:p-9">
            <BusinessForm plans={healthcare ? ['Essential', 'All-in-One'] : ['Essential']} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
