import { redirect } from 'next/navigation';
import { Logo } from '@/components/SiteChrome';
import { MemberNav } from '@/components/MemberNav';
import { logout } from '@/app/(auth)/actions';
import { currentUser } from '@/lib/supabase/server';
import { admin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const { data: profile } = await admin().from('profiles').select('full_name, email, role').eq('id', user.id).single();
  const first = profile?.full_name?.split(' ')[0] ?? '';

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-navy text-white print:hidden">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-4 text-[15px]">
            <span className="hidden text-mist sm:inline">{profile?.email}</span>
            <form action={logout}>
              <button className="min-h-11 rounded-lg border border-[#3A3D5C] px-4 font-semibold">Log out</button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1240px] flex-col gap-7 px-4 pb-16 pt-8 sm:px-6 lg:flex-row lg:items-start">
        <MemberNav greeting={first ? `Hi, ${first}` : 'Member area'} isAdmin={profile?.role === 'admin'} />
        <main className="flex min-w-0 flex-1 flex-col gap-6">{children}</main>
      </div>
    </div>
  );
}
