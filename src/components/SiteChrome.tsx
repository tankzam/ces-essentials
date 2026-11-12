import Link from 'next/link';
import { currentUser } from '@/lib/supabase/server';
import { homeFor } from '@/lib/accounts';
import { healthcareOnSale } from '@/lib/healthcare';
import { logout } from '@/app/(auth)/actions';

export function Logo({ dark = true }: { dark?: boolean }) {
  return (
    <Link href="/" className={`flex min-h-11 items-center gap-2.5 text-xl font-extrabold tracking-tight ${dark ? 'text-white' : 'text-navy'}`}>
      <span className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-amber text-[15px] font-extrabold text-navy">CES</span>
      <span>Essentials</span>
    </Link>
  );
}

const menu = [
  { href: '/#plans', label: 'Plans' },
  { href: '/#build', label: 'Build your own' },
  { href: '/benefits-guide', label: 'Benefits Guide' },
  { href: '/#faq', label: 'FAQ' },
];

function MenuLinks({ stacked = false, accountHref }: { stacked?: boolean; accountHref: string | null }) {
  return (
    <>
      {menu.map((m) => (
        <Link key={m.href} href={m.href} className={`inline-flex min-h-11 items-center text-[15px] text-[#E6E7F0] no-underline hover:text-white ${stacked ? 'py-1' : ''}`}>
          {m.label}
        </Link>
      ))}
      <Link href="/for-businesses" className={`inline-flex min-h-11 items-center text-[15px] font-semibold text-amber no-underline ${stacked ? 'py-1' : ''}`}>
        For Businesses
      </Link>
      {accountHref ? (
        <>
          <Link href={accountHref} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-white px-4 text-[15px] font-semibold text-navy no-underline">
            My Account
          </Link>
          <form action={logout}>
            <button className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-[#3A3D5C] px-4 text-[15px] font-semibold text-white">
              Log out
            </button>
          </form>
        </>
      ) : (
        <Link href="/login" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-white px-4 text-[15px] font-semibold text-navy no-underline">
          Member Login
        </Link>
      )}
    </>
  );
}

export async function TopNav() {
  const user = await currentUser();
  const accountHref = user ? await homeFor(user.id) : null;
  return (
    <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-4 py-5 sm:px-6">
      <Logo />
      <nav aria-label="Main" className="hidden items-center gap-6 lg:flex">
        <MenuLinks accountHref={accountHref} />
      </nav>
      <details className="group relative lg:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-lg border border-[#3A3D5C] px-4 font-semibold text-white [&::-webkit-details-marker]:hidden">
          Menu
        </summary>
        <nav aria-label="Main" className="absolute right-0 z-20 mt-2 flex w-64 flex-col gap-2 rounded-xl bg-navy-2 p-4 shadow-xl">
          <MenuLinks stacked accountHref={accountHref} />
        </nav>
      </details>
    </div>
  );
}

export async function SiteFooter() {
  const healthcare = await healthcareOnSale();
  const links = [
    { href: '/terms', label: 'Terms' },
    { href: '/privacy', label: 'Privacy' },
    { href: '/refund-policy', label: 'Refund Policy' },
    { href: '/contact', label: 'Contact' },
    { href: '/login', label: 'Member Login' },
    { href: '/for-businesses', label: 'For Businesses' },
    { href: '/benefits-guide', label: 'Benefits Guide' },
  ];
  return (
    <footer className="bg-navy text-mist">
      <div className="mx-auto flex max-w-[1180px] flex-col items-center gap-5 px-4 py-12 text-center sm:px-6">
        <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-[15px]">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-11 items-center text-[#E6E7F0] underline-offset-2 hover:underline">
              {l.label}
            </Link>
          ))}
        </nav>
        {healthcare && <p className="text-sm">Healthcare services are provided by a licensed telehealth provider.</p>}
        <p className="text-sm">© {new Date().getFullYear()} Creating Empowerment Solutions LLC</p>
      </div>
    </footer>
  );
}

/** Shell for simple public pages (placeholders, login). */
export function PublicPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-navy">
        <TopNav />
      </header>
      <main className="mx-auto w-full max-w-[720px] flex-1 px-4 py-14 sm:px-6">
        <h1 className="mb-6 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
