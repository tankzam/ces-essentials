import { redirect } from 'next/navigation';
import { PublicPage } from '@/components/SiteChrome';
import { ResetForm } from '@/components/AuthForms';
import { currentUser } from '@/lib/supabase/server';

export const metadata = { title: 'Choose a new password — CES Essentials' };

export default async function Page() {
  if (!(await currentUser())) redirect('/forgot-password');
  return (
    <PublicPage title="Choose your password">
      <ResetForm />
    </PublicPage>
  );
}
