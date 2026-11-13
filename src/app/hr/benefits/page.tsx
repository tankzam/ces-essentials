import { BenefitsGuide } from '@/components/BenefitsGuide';
import { benefitServices, withoutHealthcare } from '@/lib/benefits';
import { healthcareOnSale } from '@/lib/healthcare';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Plan Guides for HR — CES Essentials' };

export default async function Page() {
  const healthcare = await healthcareOnSale();
  return (
    <>
      <div className="print:hidden">
        <p className="text-sm font-semibold uppercase tracking-widest text-subtle">For HR teams</p>
        <h1 className="text-[32px] font-extrabold tracking-tight">Plan Guides</h1>
        <p className="text-muted">Everything included in your team&apos;s plan. Share these pages with employees.</p>
      </div>
      <BenefitsGuide services={(healthcare ? benefitServices('hr') : withoutHealthcare(benefitServices('hr')))} printAllHref="/hr/benefits/print" />
    </>
  );
}
