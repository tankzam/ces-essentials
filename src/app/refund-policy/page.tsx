import Link from 'next/link';
import { COMPANY, Email, LegalPage } from '@/components/LegalPage';

export const metadata = { title: 'Refund Policy — CES Essentials' };

export default function Page() {
  return (
    <LegalPage
      title="Refund Policy"
      intro={<p>CES Essentials plans are monthly subscriptions from {COMPANY}.</p>}
      sections={[
        { heading: 'No refunds once a billing month starts', body: <p>There are no refunds once a billing month has started, including for partial months or unused benefits. You confirm that you understand this at checkout.</p> },
        { heading: 'Cancel anytime', body: <p>You can cancel anytime from your member area to stop future charges. Your access continues through the end of the billing month you already paid for.</p> },
        { heading: 'Plan changes', body: <p>Moving to a plan that costs more starts right away, with a prorated charge for the rest of the month. Moving to a plan that costs less starts on your next billing date.</p> },
        { heading: 'Questions', body: <p>Email <Email />. See also our <Link href="/terms" className="font-semibold text-navy underline">Terms of Service</Link>.</p> },
      ]}
    />
  );
}
