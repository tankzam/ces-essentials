'use client';

import { useState } from 'react';
import { BENEFIT_ORDER, type BenefitService, type Section } from '@/lib/benefits';

export function SectionView({ sec }: { sec: Section }) {
  return (
    <section className="flex flex-col gap-3.5 break-inside-avoid">
      <h3 className="text-[21px] font-bold">{sec.title}</h3>
      {sec.intro && <p className="leading-relaxed text-muted">{sec.intro}</p>}
      {sec.type === 'numbered' && (
        <ol className="flex flex-col gap-2.5">
          {sec.items.map((it) => (
            <li key={it.title} className="flex gap-3">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-bold text-amber">{it.n}</span>
              <span className="leading-relaxed"><strong>{it.title}</strong>{it.text}</span>
            </li>
          ))}
        </ol>
      )}
      {sec.type === 'cards' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {sec.items.map((it) => (
            <div key={it.title} className="rounded-xl border border-line bg-cream p-4">
              <p className="mb-1 font-bold">{it.title}</p>
              <p className="text-[15px] leading-relaxed text-muted">{it.text}</p>
            </div>
          ))}
        </div>
      )}
      {sec.type === 'bullets' && (
        <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {sec.items.map((b) => (
            <li key={b} className="flex gap-2.5">
              <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-amber" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
      {sec.type === 'steps' && (
        <ol className="flex flex-col gap-2.5">
          {sec.items.map((st) => (
            <li key={st.n} className="flex gap-3">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-navy text-sm font-bold">{st.n}</span>
              <span className="leading-relaxed">{st.text}</span>
            </li>
          ))}
        </ol>
      )}
      {sec.type === 'links' && (
        <div className="flex flex-wrap gap-3">
          {sec.items.map((l) => (
            <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center rounded-[10px] bg-navy px-5 font-bold text-white">
              {l.label}
            </a>
          ))}
        </div>
      )}
      {sec.type === 'table' && (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[460px] border-collapse text-[15px]">
            <thead>
              <tr className="bg-navy text-left text-white">
                <th className="px-4 py-3">Legal service</th>
                <th className="px-4 py-3">Member rate</th>
                <th className="px-4 py-3">Non-member rate</th>
              </tr>
            </thead>
            <tbody>
              {sec.rows.map((r, i) => (
                <tr key={r.name} className={i % 2 ? 'bg-cream' : 'bg-white'}>
                  <td className="px-4 py-3">{r.name}</td>
                  <td className="px-4 py-3 font-bold">{r.member}</td>
                  <td className="px-4 py-3 text-subtle line-through">{r.regular}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sec.note && <p className="text-sm text-subtle">{sec.note}</p>}
    </section>
  );
}

export function ServiceView({ s }: { s: BenefitService }) {
  return (
    <article className="flex flex-col gap-7 rounded-2xl border border-line bg-white p-6 sm:p-8 print:border-0 print:p-0">
      <header className="flex flex-col gap-2">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-subtle">{s.group}</p>
        <h2 className="text-3xl font-extrabold tracking-tight">{s.name}</h2>
        <p className="text-lg leading-relaxed text-muted">{s.lead}</p>
        {s.provider && (
          <p className="text-[15px]">
            <span className="text-subtle">Provided by </span>
            <strong>{s.provider}</strong>
          </p>
        )}
      </header>
      {s.sections.map((sec) => (
        <SectionView key={sec.title} sec={sec} />
      ))}
      <p className="border-t border-line pt-4 text-sm text-subtle">Benefits may vary by state. Terms and conditions apply.</p>
    </article>
  );
}

export function BenefitsGuide({ services, printAllHref }: { services: Record<string, BenefitService>; printAllHref?: string }) {
  const [svc, setSvc] = useState<string>('legal');
  const s = services[svc];
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <nav aria-label="Benefits" className="flex flex-col gap-1.5 rounded-2xl border border-line bg-white p-3 print:hidden lg:sticky lg:top-4 lg:w-[260px] lg:shrink-0">
        {printAllHref && (
          <a href={printAllHref} target="_blank" className="mb-2 flex min-h-12 items-center justify-center rounded-[10px] bg-amber px-3 text-center text-[15px] font-bold text-navy">
            Download all PDFs to share with employees
          </a>
        )}
        <div className="flex flex-wrap gap-1.5 lg:flex-col">
          {BENEFIT_ORDER.filter((k) => services[k]).map((k) => {
            const on = k === svc;
            return (
              <button
                key={k}
                type="button"
                aria-current={on ? 'page' : undefined}
                onClick={() => setSvc(k)}
                className={`flex min-h-12 flex-col items-start justify-center rounded-[10px] px-3.5 py-2 text-left ${on ? 'bg-navy text-white' : 'hover:bg-cream'}`}
              >
                <span className="font-semibold">{services[k].name}</span>
                <span className={`text-[12px] ${on ? 'text-mist' : 'text-subtle'}`}>{services[k].group}</span>
              </button>
            );
          })}
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex justify-end print:hidden">
          <button type="button" onClick={() => window.print()} className="min-h-11 rounded-lg border border-navy bg-white px-4 font-semibold">
            Download one-page PDF
          </button>
        </div>
        <ServiceView s={s} />
      </div>
    </div>
  );
}

export function PrintOnLoad() {
  return (
    <script
      dangerouslySetInnerHTML={{ __html: 'window.addEventListener("load",function(){setTimeout(function(){window.print()},300)})' }}
    />
  );
}
