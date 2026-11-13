import { DashHeader, SideNav } from '@/components/SideNav';
import { logout } from '@/app/(auth)/actions';
import { requireHrPage } from '@/lib/accounts';

export const dynamic = 'force-dynamic';

export default async function HrLayout({ children }: { children: React.ReactNode }) {
  const { viewer, org } = await requireHrPage();
  return (
    <div className="min-h-screen bg-cream">
      <DashHeader title="Essentials for Business" who={`${org.name} · ${viewer.email}`}>
        <form action={logout}>
          <button className="min-h-11 rounded-lg border border-[#3A3D5C] px-4 font-semibold">Log out</button>
        </form>
      </DashHeader>
      <div className="mx-auto flex max-w-[1320px] flex-col gap-7 px-4 pb-16 pt-8 sm:px-6 lg:flex-row lg:items-start">
        <SideNav
          title="HR Dashboard"
          label="HR menu"
          tabs={[
            { href: '/hr', label: 'Overview', exact: true },
            { href: '/hr/employees', label: 'Employees' },
            { href: '/hr/upload', label: 'Upload' },
            { href: '/hr/billing', label: 'Billing' },
            { href: '/hr/benefits', label: 'Plan Guides' },
          ]}
        />
        <main className="flex min-w-0 flex-1 flex-col gap-6">{children}</main>
      </div>
    </div>
  );
}
