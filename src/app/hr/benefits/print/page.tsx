import { PrintOnLoad, ServiceView } from '@/components/BenefitsGuide';
import { BENEFIT_ORDER, benefitServices } from '@/lib/benefits';

export const metadata = { title: 'CES Essentials Benefits Guide' };

/** Every service, one per page, ready to save as PDF. */
export default function Page() {
  const services = benefitServices('hr');
  return (
    <div className="flex flex-col gap-8">
      <p className="rounded-xl bg-amber-soft px-5 py-3.5 text-amber-ink print:hidden">
        Your browser&apos;s print window opens automatically. Choose <strong>Save as PDF</strong> to download all pages.
      </p>
      {BENEFIT_ORDER.map((k) => (
        <div key={k} className="break-after-page">
          <ServiceView s={services[k]} />
        </div>
      ))}
      <PrintOnLoad />
    </div>
  );
}
