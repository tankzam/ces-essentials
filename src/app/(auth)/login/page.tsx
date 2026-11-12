import { redirect } from 'next/navigation';
import { PublicPage } from '@/components/SiteChrome';
import { LoginForm } from '@/components/AuthForms';
import { currentUser } from '@/lib/supabase/server';
import { homeFor } from '@/lib/accounts';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Member Login — CES Essentials' };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await currentUser();
  if (user) redirect(await homeFor(user.id));
  const { next } = await searchParams;
  return (
    <PublicPage title="Member Login">
      <LoginForm next={next} />
    </PublicPage>
  );
}
