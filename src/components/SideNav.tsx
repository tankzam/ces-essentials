'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Left menu used by the HR dashboard and the admin area. */
export function SideNav({ title, tabs, label }: { title: string; label: string; tabs: { href: string; label: string; exact?: boolean }[] }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="flex flex-col gap-1.5 rounded-2xl border border-line bg-white p-3.5 print:hidden lg:w-[250px] lg:shrink-0">
      <p className="mx-2.5 mb-2 mt-1.5 text-[13px] font-semibold uppercase tracking-wider text-subtle">{title}</p>
      <div className="flex flex-wrap gap-1.5 lg:flex-col">
        {tabs.map((t) => {
          const on = t.exact ? path === t.href : path === t.href || path.startsWith(`${t.href}/`);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? 'page' : undefined}
              className={`flex min-h-12 items-center rounded-[10px] px-3.5 font-semibold ${on ? 'bg-navy text-white' : 'text-navy hover:bg-cream'}`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function DashHeader({ title, who, children }: { title: string; who: string; children?: React.ReactNode }) {
  return (
    <header className="bg-navy text-white print:hidden">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 text-xl font-extrabold">
          <span className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-amber text-[15px] font-extrabold text-navy">CES</span>
          <span>{title}</span>
        </Link>
        <div className="flex items-center gap-4 text-[15px]">
          <span className="hidden text-mist sm:inline">{who}</span>
          {children}
        </div>
      </div>
    </header>
  );
}
