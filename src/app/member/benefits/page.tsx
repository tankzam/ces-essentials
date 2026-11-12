import { BenefitsGuide } from '@/components/BenefitsGuide';
import { benefitServices, withoutHealthcare } from '@/lib/benefits';
import { healthcareOnSale } from '@/lib/healthcare';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Benefits Guide — CES Essentials' };

export default async function Page() {
  const healthcare = await healthcareOnSale();
  return (
    <>
      <div className="print:hidden">
        <h1 className="text-[32px] font-extrabold tracking-tight">Benefits Guide</h1>
        <p className="text-muted">Everything included in your plan: what&apos;s covered and how to get started.</p>
      </div>
      <BenefitsGuide services={(healthcare ? benefitServices('member') : withoutHealthcare(benefitServices('member')))} />
    </>
  );
}
