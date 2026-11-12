import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/components/SiteChrome';
import { CompanySignupForm } from '@/components/CompanySignupForm';
import { admin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';
import { healthcareOnSale } from '@/lib/healthcare';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Company signup — CES Essentials', robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = admin();
  const { data: request } = await db.from('business_requests').select('*').eq('signup_token', token).maybeSingle();
  if (!request || !['approved', 'signed_up'].includes(request.status)) notFound();

  const [{ data: products }, { data: policy }, user, healthcare] = await Promise.all([
    db.from('products').select('id, name, price_cents').in('id', ['starter', 'all_in_one', 'starter_company', 'all_in_one_company']),
    db.from('policy_versions').select('version, wording').eq('slug', 'refund_ack_company').order('version', { ascending: false }).limit(1).single(),
    currentUser(),
    healthcareOnSale(),
  ]);
  const price = (id: string) => products?.find((p) => p.id === id)?.price_cents ?? 0;
  const allPlans = [
    { id: 'starter_company', name: 'Starter', priceCents: price('starter_company'), regularCents: price('starter'), includes: 'Family Legal + Tax Prep, Credit Monitoring + VPN, Discount Club' },
    {
      id: 'all_in_one_company',
      name: 'All-in-One',
      priceCents: price('all_in_one_company'),
      regularCents: price('all_in_one'),
      includes: 'Everything in Starter, plus unlimited $0-copay virtual healthcare for each employee and up to 3 more people, CESgpt, Streamify Me',
    },
  ];
  const plans = healthcare ? allPlans : allPlans.filter((p) => p.id !== 'all_in_one_company');
  const interest = !healthcare || request.interest === 'Starter' ? 'starter_company' : 'all_in_one_company';
  let signedInEmail: string | null = null;
  if (user) {
    const { data: p } = await db.from('profiles').select('email').eq('id', user.id).maybeSingle();
    signedInEmail = p?.email ?? null;
  }

  return (
    <div>
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-[1180px] items-center gap-2 px-4 py-5 sm:px-6">
          <Logo />
          <span className="text-xl font-extrabold">for Business</span>
        </div>
        <section className="mx-auto flex max-w-[1180px] flex-col items-center gap-4 px-4 pb-16 pt-12 text-center sm:px-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-amber">Private company offer</p>
          <h1 className="max-w-[820px] text-[34px] font-extrabold leading-[1.08] tracking-tight sm:text-5xl">Welcome, {request.company}.</h1>
          <p className="max-w-[640px] text-lg leading-relaxed text-mist">
            Your company pricing is ready. Pick one plan for your team, set up your HR login, and you&apos;ll be uploading employees in minutes.
          </p>
        </section>
      </header>
      <main className="mx-auto max-w-[980px] px-4 pb-24 pt-14 sm:px-6">
        {request.status === 'signed_up' ? (
          <div className="rounded-2xl border border-line bg-white p-8 text-center">
            <h2 className="mb-3 text-2xl font-extrabold">Your company plan is active.</h2>
            <Link href="/hr" className="inline-flex min-h-[52px] items-center rounded-[10px] bg-navy px-6 font-bold text-white">Go to HR dashboard</Link>
          </div>
        ) : (
          <CompanySignupForm
            token={token}
            plans={plans}
            defaultPlan={interest}
            defaultCompany={request.company}
            defaultName={request.contact_name}
            defaultEmail={request.email}
            signedInEmail={signedInEmail}
            policy={policy!}
          />
        )}
      </main>
      <footer className="bg-navy text-mist">
        <div className="mx-auto flex max-w-[1180px] flex-col items-center gap-2.5 px-4 py-9 text-center text-sm sm:px-6">
          <p>This page and its pricing are private to your company.</p>
          <p>© {new Date().getFullYear()} Creating Empowerment Solutions LLC</p>
        </div>
      </footer>
    </div>
  );
}
