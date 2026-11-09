import { BenefitsGuide } from '@/components/BenefitsGuide';
import { benefitServices } from '@/lib/benefits';

export const metadata = { title: 'Benefits Guide for HR — CES Essentials' };

export default function Page() {
  return (
    <>
      <div className="print:hidden">
        <p className="text-sm font-semibold uppercase tracking-widest text-subtle">For HR teams</p>
        <h1 className="text-[32px] font-extrabold tracking-tight">Benefits Guide</h1>
        <p className="text-muted">Everything included in your team&apos;s plan. Share these pages with employees.</p>
      </div>
      <BenefitsGuide services={benefitServices('hr')} printAllHref="/hr/benefits/print" />
    </>
  );
}
