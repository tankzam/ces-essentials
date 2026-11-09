import { PublicPage } from '@/components/SiteChrome';
import { PaymentWaiter } from '@/components/PaymentWaiter';

export const metadata = { title: 'Setting up your membership — CES Essentials' };

export default async function Page({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id } = await searchParams;
  return (
    <PublicPage title="Thank you!">
      <PaymentWaiter sessionId={session_id ?? ''} />
    </PublicPage>
  );
}
