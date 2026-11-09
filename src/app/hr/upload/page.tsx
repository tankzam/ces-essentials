import { HrUpload } from '@/components/HrUpload';
import { requireHrPage } from '@/lib/accounts';
import { orgPeople } from '@/lib/hr';
import { admin } from '@/lib/supabase/admin';

export const metadata = { title: 'Upload employees — CES Essentials' };

export default async function Page() {
  const { org } = await requireHrPage();
  const [people, { data: plan }] = await Promise.all([
    orgPeople(org.id),
    admin().from('products').select('price_cents').eq('id', org.plan_product_id ?? '').maybeSingle(),
  ]);
  return (
    <>
      <h1 className="text-[32px] font-extrabold tracking-tight">Upload employees</h1>
      <ol className="flex list-decimal flex-col gap-2 pl-6 leading-relaxed text-muted">
        <li>
          <a href="/api/hr/upload" className="font-semibold text-navy underline">Download the template</a>. It has three columns: first name, last name, email.
        </li>
        <li>Fill in one row per person, using the email they&apos;ll register every service with.</li>
        <li>Upload it below. We check it before anyone is added.</li>
      </ol>
      <HrUpload activeCount={people.filter((p) => p.status === 'active').length} priceCents={plan?.price_cents ?? 0} />
    </>
  );
}
