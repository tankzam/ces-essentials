import Link from 'next/link';
import { PublicPage } from '@/components/SiteChrome';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Checkout canceled — CES Essentials' };

export default function Page() {
  return (
    <PublicPage title="Checkout canceled">
      <p className="mb-6 text-lg text-muted">You weren’t charged. You can come back and check out whenever you’re ready.</p>
      <Link href="/" className="inline-flex min-h-[52px] items-center rounded-[10px] bg-amber px-7 font-bold text-navy">Go to the home page</Link>
    </PublicPage>
  );
}
