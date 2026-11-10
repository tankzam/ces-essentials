import { PublicPage } from '@/components/SiteChrome';

export const COMPANY = 'Creating Empowerment Solutions LLC';
export const CONTACT_EMAIL = 'abryant@tbfremail.com';
export const EFFECTIVE_DATE = 'November 9, 2026';

export function LegalPage({ title, intro, sections, date = EFFECTIVE_DATE }: { title: string; intro: React.ReactNode; sections: { heading: string; body: React.ReactNode }[]; date?: string }) {
  return (
    <PublicPage title={title}>
      <p className="mb-8 text-[15px] text-subtle">Effective date: {date}</p>
      <div className="flex flex-col gap-8 text-[17px] leading-relaxed">
        <div className="flex flex-col gap-4">{intro}</div>
        {sections.map((s, i) => (
          <section key={s.heading} className="flex flex-col gap-3">
            <h2 className="text-xl font-bold">
              {i + 1}. {s.heading}
            </h2>
            <div className="flex flex-col gap-3 text-muted [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-navy">{s.body}</div>
          </section>
        ))}
      </div>
    </PublicPage>
  );
}

export function Email() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-navy underline">
      {CONTACT_EMAIL}
    </a>
  );
}
