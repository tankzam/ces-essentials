import Link from 'next/link';
import { COMPANY, Email, LegalPage } from '@/components/LegalPage';

export const metadata = { title: 'Terms of Service — CES Essentials' };

export default function Page() {
  return (
    <LegalPage
      title="Terms of Service"
      date="November 11, 2026"
      intro={
        <>
          <p>
            These Terms of Service (&quot;Terms&quot;) are an agreement between you and {COMPANY} (&quot;CES,&quot; &quot;we,&quot; &quot;us&quot;) and
            cover your use of CES Essentials, including cesessentials.com, your member area, and the membership benefits you buy from us
            (together, the &quot;Service&quot;).
          </p>
          <p>By creating an account, buying a plan, or using the Service, you agree to these Terms. If you do not agree, please do not use the Service.</p>
        </>
      }
      sections={[
        {
          heading: 'What CES Essentials is',
          body: (
            <>
              <p>
                CES Essentials is a membership that gives you access to benefits delivered by independent third-party providers, such as virtual
                healthcare, a family legal plan, tax preparation, credit monitoring with a VPN, a discount club, and CES digital tools. What you get
                depends on the plan or items you choose.
              </p>
              <p>
                <strong>CES Essentials is not insurance.</strong> It is not a health insurance plan, does not meet any requirement for minimum
                essential coverage, and is not a substitute for health insurance.
              </p>
            </>
          ),
        },
        {
          heading: 'Healthcare and medical emergencies',
          body: (
            <>
              <p>
                Healthcare services are provided by a licensed telehealth provider, not by CES. CES does not practice medicine or give medical advice.
                Decisions about diagnosis, treatment, and prescriptions are made only by licensed clinicians.
              </p>
              <p>
                <strong>Virtual healthcare is not for emergencies. If you think you are having a medical emergency, call 911 or go to the nearest
                emergency room.</strong>
              </p>
            </>
          ),
        },
        {
          heading: 'Third-party providers',
          body: (
            <>
              <p>
                Each benefit is provided by a separate company under its own terms and privacy policy, which you may be asked to accept when you
                register with that provider. Your use of a benefit is between you and that provider. CES is not responsible for a provider&apos;s
                services, advice, availability, or decisions, and benefits may vary by state.
              </p>
              <p>Providers and the details of a benefit can change over time. If a change materially reduces a benefit you pay for, we will tell you.</p>
            </>
          ),
        },
        {
          heading: 'Your account',
          body: (
            <>
              <p>
                You must be at least 18 years old to buy a plan. Give us accurate information and keep it current, including your legal first and
                last name, date of birth, mailing address, email, and phone number. We may ask you to complete or update these details before you can
                use your member area. Keep your password private; you are responsible for activity in your account.
              </p>
              <p>
                Each account gets a <strong>member ID</strong> (for example, CES-100001). It identifies your membership, never changes, and may not
                be transferred. Please give it when you contact us.
              </p>
              <p>
                <strong>Register every service with the same email you used for your CES Essentials account.</strong> Providers match your
                membership by that email, and a service may not recognize you if you use a different one. To change your account email, contact us.
              </p>
            </>
          ),
        },
        {
          heading: 'Plans, prices, and billing',
          body: (
            <>
              <p>
                Plans are monthly subscriptions billed in U.S. dollars to the card you provide. Your plan renews automatically every month on your
                billing date, and you authorize us (through our payment processor, Stripe) to charge your card each month until you cancel.
              </p>
              <p>
                The price you pay is the price shown at checkout. If we change the price of your plan, we will tell you before the change applies to
                you, and you can cancel before it takes effect.
              </p>
              <p>
                <strong>Plan changes:</strong> if you change to a plan that costs more each month, the change starts right away and you are charged
                the prorated difference for the rest of the current month. If you change to a plan that costs less, the change starts on your next
                billing date and you keep your current benefits until then.
              </p>
            </>
          ),
        },
        {
          heading: 'Cancellation and no refunds',
          body: (
            <>
              <p>
                You can cancel anytime from your member area (My Plan). When you cancel, you will not be charged again, and your access continues
                through the end of the billing month you already paid for.
              </p>
              <p>
                <strong>There are no refunds once a billing month has started</strong>, including for partial months or unused benefits. At checkout
                you confirm that you understand this. See our <Link href="/refund-policy" className="font-semibold text-navy underline">Refund Policy</Link>.
              </p>
            </>
          ),
        },
        {
          heading: 'Failed payments',
          body: (
            <p>
              If a monthly payment fails, your access stays on for 2 days while we retry the charge and email you. If the payment still has not gone
              through after 2 days, your access pauses until it does. If every retry fails, your subscription is canceled. You can update your card
              anytime in Billing.
            </p>
          ),
        },
        {
          heading: 'Activation codes and access',
          body: (
            <p>
              Some benefits use an activation code or a group code that we show in your member area. Codes are for your personal use only and may not
              be shared, sold, or transferred. Codes are not refundable and are not replaced if shared. Some benefits take time to activate; for
              example, Family Legal + Tax Prep takes 24 to 48 hours to become active.
            </p>
          ),
        },
        {
          heading: 'Company plans',
          body: (
            <p>
              If your employer or organization provides CES Essentials, your access depends on your organization keeping you on its plan. When your
              organization removes you, your access ends at the end of that billing month. Organizations agree to company pricing and billing terms
              when they sign up, including a 5-person minimum, and are responsible for their own monthly payment.
            </p>
          ),
        },
        {
          heading: 'Acceptable use',
          body: (
            <>
              <p>You agree not to:</p>
              <ul>
                <li>share your account, codes, or benefits with people not covered by your plan;</li>
                <li>use the Service for anything unlawful, fraudulent, or abusive;</li>
                <li>try to get around security, payment, or access controls; or</li>
                <li>copy, scrape, or resell any part of the Service.</li>
              </ul>
              <p>We may suspend or end access for anyone who breaks these Terms.</p>
            </>
          ),
        },
        {
          heading: 'Our content',
          body: <p>The CES Essentials name, logo, website, and content belong to {COMPANY} or its licensors. You may use them only to use the Service.</p>,
        },
        {
          heading: 'Disclaimers',
          body: (
            <p>
              The Service is provided &quot;as is&quot; and &quot;as available.&quot; To the fullest extent the law allows, CES disclaims all
              warranties, express or implied, including warranties of merchantability, fitness for a particular purpose, and non-infringement. We do
              not promise that the Service or any benefit will always be available, uninterrupted, or error-free.
            </p>
          ),
        },
        {
          heading: 'Limitation of liability',
          body: (
            <p>
              To the fullest extent the law allows, CES will not be liable for any indirect, incidental, special, consequential, or punitive damages,
              or for anything a third-party provider does or does not do. Our total liability for any claim related to the Service is limited to the
              amount you paid us in the 3 months before the claim arose. Some places do not allow these limits, so they may not fully apply to you.
            </p>
          ),
        },
        {
          heading: 'Governing law',
          body: (
            <p>
              These Terms are governed by the laws of the State of Wyoming, without regard to its conflict-of-law rules. Any dispute about these
              Terms or the Service will be handled in the state or federal courts located in Wyoming, unless the law where you live gives you the
              right to bring it somewhere else. Before starting any formal dispute, please email us so we can try to resolve it first.
            </p>
          ),
        },
        {
          heading: 'Changes to these Terms',
          body: (
            <p>
              We may update these Terms. When we do, we will change the effective date above, and for material changes we will notify you by email or
              in your member area. Continuing to use the Service after a change takes effect means you accept the updated Terms.
            </p>
          ),
        },
        {
          heading: 'Contact us',
          body: (
            <p>
              {COMPANY}
              <br />
              Email: <Email />
            </p>
          ),
        },
      ]}
    />
  );
}
