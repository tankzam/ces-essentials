import { COMPANY, Email, LegalPage } from '@/components/LegalPage';

export const metadata = { title: 'Privacy Policy — CES Essentials' };

export default function Page() {
  return (
    <LegalPage
      title="Privacy Policy"
      date="November 11, 2026"
      intro={
        <p>
          This Privacy Policy explains how {COMPANY} (&quot;CES,&quot; &quot;we,&quot; &quot;us&quot;) collects, uses, and shares information when
          you use CES Essentials, including cesessentials.com and your member area (the &quot;Service&quot;).
        </p>
      }
      sections={[
        {
          heading: 'Information we collect',
          body: (
            <>
              <p><strong>Information you give us:</strong></p>
              <ul>
                <li>Account details: your first and last name, date of birth, mailing address, email address, phone number, and password (stored only in encrypted form).</li>
                <li>Your member ID, a number we assign to your account so we can identify you when you contact us. It never changes.</li>
                <li>Your plan and the benefits you choose.</li>
                <li>For company plans: company name, HR contact details, and the names and emails of employees an HR contact adds.</li>
                <li>Messages and requests you send us, such as the For Businesses form.</li>
              </ul>
              <p><strong>Payment information:</strong> card payments are handled by our payment processor, Stripe. We do not see or store your full
                card number; we receive limited details such as card brand, last four digits, and payment status.</p>
              <p><strong>Information collected automatically:</strong></p>
              <ul>
                <li>When you check out, a record of the refund-policy box you checked, including the exact wording, its version, the date and time,
                  your IP address, and your browser type. We keep this as proof of your agreement.</li>
                <li>Basic technical information such as IP address, browser type, and pages visited, used to run and secure the Service.</li>
                <li>Cookies that keep you logged in. We do not use advertising cookies.</li>
              </ul>
            </>
          ),
        },
        {
          heading: 'Health information',
          body: (
            <p>
              CES does not provide healthcare and does not receive your medical records, visit details, or other health information. When you use
              virtual healthcare, you deal directly with a licensed telehealth provider, and that provider&apos;s own privacy policy and applicable
              health privacy laws govern your health information.
            </p>
          ),
        },
        {
          heading: 'How we use information',
          body: (
            <ul>
              <li>to create and manage your account and membership, and to identify you by your member ID;</li>
              <li>to confirm you are 18 or older and to confirm your identity and eligibility with benefit providers;</li>
              <li>to process payments, renewals, and plan changes;</li>
              <li>to turn on your benefits and show your setup steps and activation codes;</li>
              <li>to send emails about your account, such as welcome and setup emails, receipts, payment notices, and cancellation confirmations;</li>
              <li>to provide company plans, including showing HR contacts who is on their plan and whether they have logged in;</li>
              <li>to answer your questions and provide support;</li>
              <li>to prevent fraud, secure the Service, and resolve payment disputes; and</li>
              <li>to meet legal obligations.</li>
            </ul>
          ),
        },
        {
          heading: 'How we share information',
          body: (
            <>
              <p>We do not sell your personal information. We share it only as needed to run the Service:</p>
              <ul>
                <li><strong>Benefit providers:</strong> the companies that deliver the benefits on your plan may receive the details needed to
                  enroll you and confirm your membership, such as your name, email address, and, where a provider needs it to confirm eligibility or
                  identity, your date of birth and mailing address.</li>
                <li><strong>Service providers:</strong> companies that help us operate, including payment processing, website hosting, database
                  hosting, and email delivery. They may use your information only to provide their services to us.</li>
                <li><strong>Your organization:</strong> if you are on a company plan, your HR contact can see your name, email, membership status,
                  and whether you have logged in. They cannot see your date of birth, your address, or which benefits you use.</li>
                <li><strong>Legal reasons:</strong> when required by law, or to protect the rights, safety, and property of CES, our members, or
                  others.</li>
                <li><strong>Business changes:</strong> if CES is involved in a merger, acquisition, or sale of assets, as part of that transaction.</li>
              </ul>
            </>
          ),
        },
        {
          heading: 'How long we keep information',
          body: (
            <p>
              We keep account and membership information while your account is open and for as long as needed afterward for legal, tax, accounting,
              and dispute purposes. Payment records and refund-policy acceptance records are kept so we can resolve billing questions and disputes.
              Activation codes, once assigned, stay linked to the member they were assigned to.
            </p>
          ),
        },
        {
          heading: 'Security',
          body: (
            <p>
              We use reasonable safeguards to protect your information, including encrypted connections, encrypted password storage, and access
              controls that limit each member to their own information. No system is perfectly secure, so please use a strong password and keep it
              private.
            </p>
          ),
        },
        {
          heading: 'Your choices and rights',
          body: (
            <>
              <p>You can view and update your name, phone number, and password in your member area. To change your account email, ask for a copy of
                your information, or ask us to delete your account, email us. We will respond as required by applicable law, and we may need to
                verify your identity first. Some information must be kept for legal or billing reasons even after an account is closed.</p>
              <p>We send emails that are needed to run your membership, such as receipts and payment notices. These are not marketing emails, so they
                continue while your account is active.</p>
            </>
          ),
        },
        {
          heading: 'Children',
          body: <p>The Service is for adults 18 and older. We do not knowingly collect information from children under 13 through our website.</p>,
        },
        {
          heading: 'Changes to this policy',
          body: (
            <p>
              We may update this Privacy Policy. When we do, we will change the effective date above, and for material changes we will notify you by
              email or in your member area.
            </p>
          ),
        },
        {
          heading: 'Contact us',
          body: (
            <p>
              Questions about this policy or your information:
              <br />
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
