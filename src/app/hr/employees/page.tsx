import Link from 'next/link';
import { HrEmployees } from '@/components/HrEmployees';
import { requireHrPage } from '@/lib/accounts';
import { orgPeople } from '@/lib/hr';
import { formatDate } from '@/lib/money';

export const metadata = { title: 'Employees — CES Essentials' };

export default async function Page() {
  const { org } = await requireHrPage();
  const people = (await orgPeople(org.id)).filter((p) => p.status !== 'removed');
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[32px] font-extrabold tracking-tight">Employees</h1>
        <Link href="/hr/upload" className="inline-flex min-h-[46px] items-center rounded-[10px] bg-navy px-5 font-bold text-white">Upload spreadsheet</Link>
      </div>
      <HrEmployees
        people={people.map((p) => ({
          profileId: p.profileId,
          name: p.name,
          email: p.email,
          status: p.status === 'removing' ? `Leaving ${formatDate(p.removeAt)}` : p.invited ? 'Invited' : 'Active',
          kind: p.status === 'removing' ? 'removing' : p.invited ? 'invited' : 'active',
          added: formatDate(p.addedAt),
        }))}
      />
      <p className="text-sm text-subtle">
        Removing someone ends their access at the end of this billing month, and your next bill adjusts. &quot;Invited&quot; means they haven&apos;t logged in yet. Their welcome email can be resent from their row.
      </p>
    </>
  );
}
