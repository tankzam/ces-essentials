import { TopNav, SiteFooter } from '@/components/SiteChrome';
import { BenefitsGuide } from '@/components/BenefitsGuide';
import { benefitServices } from '@/lib/benefits';

export const metadata = { title: 'Benefits Guide — CES Essentials' };

export default function Page() {
  return (
    <div>
      <header className="bg-navy text-white print:hidden">
        <TopNav />
        <section className="mx-auto flex max-w-[1180px] flex-col gap-3 px-4 pb-14 pt-8 sm:px-6">
          <h1 className="text-[36px] font-extrabold tracking-tight sm:text-5xl">Benefits Guide</h1>
          <p className="max-w-[720px] text-lg text-mist">
            Everything included in your CES Essentials plan: what&apos;s covered, how to get started, and answers to common questions.
          </p>
        </section>
      </header>
      <main className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6">
        <BenefitsGuide services={benefitServices('public')} />
      </main>
      <div className="print:hidden">
        <SiteFooter />
      </div>
    </div>
  );
}
