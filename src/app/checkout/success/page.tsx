import { PublicPage } from '@/components/SiteChrome';
import { PaymentWaiter } from '@/components/PaymentWaiter';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Setting up your membership — CES Essentials' };

export default async function Page({ searchParams }: { searchParams: Promise<{ session_id?: string; company?: string }> }) {
  const { session_id, company } = await searchParams;
  return (
    <PublicPage title="Thank you!">
      <PaymentWaiter sessionId={session_id ?? ''} dest={company ? '/hr' : '/member/services'} />
    </PublicPage>
  );
}
