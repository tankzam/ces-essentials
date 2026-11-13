import Link from 'next/link';
import { COMPANY, Email, LegalPage } from '@/components/LegalPage';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Refund Policy — CES Essentials' };

export default function Page() {
  return (
    <LegalPage
      title="Refund Policy"
      date="November 13, 2026"
      intro={<p>CES Essentials plans are subscriptions from {COMPANY}, billed monthly or, where offered, yearly.</p>}
      sections={[
        { heading: 'Monthly plans: no refunds once a billing month starts', body: <p>There are no refunds once a billing month has started, including for partial months or unused benefits. You confirm that you understand this at checkout.</p> },
        {
          heading: 'Yearly plans: first 3 months',
          body: (
            <>
              <p>If you cancel a yearly plan within the first 3 months of a paid year, you pay the regular monthly price for each month you used (a partial month counts as a full month), the rest of what you paid is refunded to your card, and your access ends when the last of those months ends. After the first 3 months of a paid year there are no refunds, and your access continues through the end of the year you paid for.</p>
              <p>For example, on a $239.88 yearly plan with a $25.99 monthly price: cancel in month 1 and $213.89 is refunded; in month 2, $187.90; in month 3, $161.91. You confirm that you understand this at checkout.</p>
              <p>Yearly plans renew automatically each year until you cancel. We email you about 30 days before your plan renews.</p>
            </>
          ),
        },
        { heading: 'Cancel anytime', body: <p>You can cancel anytime from your member area to stop future charges. On a monthly plan, your access continues through the end of the billing month you already paid for. On a yearly plan, see the rule above.</p> },
        { heading: 'Plan changes', body: <p>Moving to a plan that costs more starts right away, with a prorated charge for the rest of the month. Moving to a plan that costs less starts on your next billing date.</p> },
        { heading: 'Questions', body: <p>Email <Email />. See also our <Link href="/terms" className="font-semibold text-navy underline">Terms of Service</Link>.</p> },
      ]}
    />
  );
}
