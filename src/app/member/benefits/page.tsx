import { BenefitsGuide } from '@/components/BenefitsGuide';
import { benefitServices } from '@/lib/benefits';

export const metadata = { title: 'Benefits Guide — CES Essentials' };

export default function Page() {
  return (
    <>
      <div className="print:hidden">
        <h1 className="text-[32px] font-extrabold tracking-tight">Benefits Guide</h1>
        <p className="text-muted">Everything included in your plan: what&apos;s covered and how to get started.</p>
      </div>
      <BenefitsGuide services={benefitServices('member')} />
    </>
  );
}
