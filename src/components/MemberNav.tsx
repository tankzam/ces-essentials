'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/member/services', label: 'My Services' },
  { href: '/member/plan', label: 'My Plan' },
  { href: '/member/billing', label: 'Billing' },
  { href: '/member/account', label: 'Account' },
  { href: '/member/benefits', label: 'Benefits Guide' },
];

export function MemberNav({ greeting }: { greeting: string }) {
  const path = usePathname();
  return (
    <nav aria-label="Member menu" className="print:hidden flex flex-col gap-1.5 rounded-2xl border border-line bg-white p-3.5 lg:w-[250px] lg:shrink-0">
      <p className="mx-2.5 mb-2 mt-1.5 text-[13px] font-semibold uppercase tracking-wider text-subtle">{greeting}</p>
      <div className="flex flex-wrap gap-1.5 lg:flex-col">
        {tabs.map((t) => {
          const on = path === t.href;
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
