import Link from 'next/link';
import { PublicPage } from '@/components/SiteChrome';
import { COMPANY, Email } from '@/components/LegalPage';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Contact — CES Essentials' };

export default function Page() {
  return (
    <PublicPage title="Contact">
      <div className="flex flex-col gap-5 text-lg leading-relaxed">
        <p>Questions about your membership, billing, or your account? Email us and we&apos;ll get back to you.</p>
        <div className="rounded-2xl border border-line bg-white p-6">
          <p className="mb-1 text-sm text-subtle">Email</p>
          <p className="text-xl"><Email /></p>
          <p className="mt-4 text-[15px] text-muted">{COMPANY}</p>
        </div>
        <p className="text-[15px] text-muted">
          Members: most things, like canceling, changing your plan, or updating your card, can be done right away in your{' '}
          <Link href="/login" className="font-semibold text-navy underline">member area</Link>. To change your account email, please email us.
        </p>
        <p className="text-[15px] text-muted">
          Businesses: request company pricing on our <Link href="/for-businesses" className="font-semibold text-navy underline">For Businesses</Link> page.
        </p>
      </div>
    </PublicPage>
  );
}
