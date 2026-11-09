import { AccountForms } from '@/components/AccountForms';
import { admin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';

export const metadata = { title: 'Account — CES Essentials' };

export default async function Page() {
  const user = (await currentUser())!;
  const { data: profile } = await admin().from('profiles').select('full_name, phone, email').eq('id', user.id).single();
  return (
    <>
      <h1 className="text-[32px] font-extrabold tracking-tight">Account</h1>
      <AccountForms fullName={profile?.full_name ?? ''} phone={profile?.phone ?? ''} email={profile?.email ?? ''} />
    </>
  );
}
