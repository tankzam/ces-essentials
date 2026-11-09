import { redirect } from 'next/navigation';
import { PublicPage } from '@/components/SiteChrome';
import { LoginForm } from '@/components/AuthForms';
import { currentUser } from '@/lib/supabase/server';

export const metadata = { title: 'Member Login — CES Essentials' };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await currentUser()) redirect('/member/services');
  const { next } = await searchParams;
  return (
    <PublicPage title="Member Login">
      <LoginForm next={next} />
    </PublicPage>
  );
}
