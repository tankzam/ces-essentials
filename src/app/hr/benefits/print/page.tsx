import { PrintOnLoad, ServiceView } from '@/components/BenefitsGuide';
import { BENEFIT_ORDER, benefitServices, withoutHealthcare } from '@/lib/benefits';
import { healthcareOnSale } from '@/lib/healthcare';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'CES Essentials Plan Guides' };

/** Every service, one per page, ready to save as PDF. */
export default async function Page() {
  const healthcare = await healthcareOnSale();
  const services = (healthcare ? benefitServices('hr') : withoutHealthcare(benefitServices('hr')));
  return (
    <div className="flex flex-col gap-8">
      <p className="rounded-xl bg-amber-soft px-5 py-3.5 text-amber-ink print:hidden">
        Your browser&apos;s print window opens automatically. Choose <strong>Save as PDF</strong> to download all pages.
      </p>
      {BENEFIT_ORDER.filter((k) => services[k]).map((k) => (
        <div key={k} className="break-after-page">
          <ServiceView s={services[k]} />
        </div>
      ))}
      <PrintOnLoad />
    </div>
  );
}
