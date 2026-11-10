import Link from 'next/link';
import { DashHeader, SideNav } from '@/components/SideNav';
import { logout } from '@/app/(auth)/actions';
import { requireAdminPage } from '@/lib/accounts';
import { admin } from '@/lib/supabase/admin';
import { getSetting } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAdminPage();
  const [{ count: left }, threshold] = await Promise.all([
    admin().from('activation_codes').select('id', { count: 'exact', head: true }).is('assigned_to', null).eq('retired', false),
    getSetting('code_pool_alert_threshold'),
  ]);
  const low = (left ?? 0) < Number(threshold || 20);

  return (
    <div className="min-h-screen bg-cream">
      <DashHeader title="Essentials Admin" who={`Signed in as ${me.email}`}>
        <form action={logout}>
          <button className="min-h-11 rounded-lg border border-[#3A3D5C] px-4 font-semibold">Log out</button>
        </form>
      </DashHeader>
      <div className="mx-auto flex max-w-[1320px] flex-col gap-7 px-4 pb-16 pt-8 sm:px-6 lg:flex-row lg:items-start">
        <SideNav
          title="Admin"
          label="Admin menu"
          tabs={[
            { href: '/admin', label: 'Members', exact: true },
            { href: '/admin/codes', label: 'Codes' },
            { href: '/admin/revenue', label: 'Orders & Revenue' },
            { href: '/admin/business', label: 'Business Requests' },
            { href: '/admin/policy', label: 'Policy Log' },
            { href: '/admin/activity', label: 'Activity Log' },
            { href: '/member/services', label: '← My member area' },
          ]}
        />
        <main className="flex min-w-0 flex-1 flex-col gap-6">
          {low && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger bg-danger-soft px-5 py-3.5">
              <p className="font-semibold text-[#7A1F15]">
                Only {left ?? 0} Credit Monitoring + VPN codes left. Upload more before they run out. An alert email has been sent.
              </p>
              <Link href="/admin/codes" className="inline-flex min-h-10 items-center rounded-lg bg-navy px-4 text-sm font-bold text-white">Go to Codes</Link>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
