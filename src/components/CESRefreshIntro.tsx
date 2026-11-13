import '@/styles/ces-refresh.css';
import { money } from '@/lib/money';
import type { PublicCatalog } from '@/lib/catalog-shared';

// Homepage hero + service overview (Design 1 refresh). Presentation only:
// every price and "included" label comes from the live catalog.

const strokeIcon = (d: React.ReactNode) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const SERVICES: { id: string; description: string; icon: React.ReactNode }[] = [
  {
    id: 'legal_tax',
    description: 'Free attorney consultations, document reviews, and a simple will, plus free tax return preparation and unlimited tax advice.',
    icon: strokeIcon(<><path d="M12 3v18M7 21h10M5 7h14" /><path d="M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z" /></>),
  },
  {
    id: 'credit_vpn',
    description: 'Credit monitoring and identity theft protection, plus a VPN and device security for up to 10 devices.',
    icon: strokeIcon(<><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></>),
  },
  {
    id: 'healthcare',
    description: '$0-copay virtual visits by video, phone, or chat for you plus up to 3 more people, in English or Spanish.',
    icon: strokeIcon(<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />),
  },
  {
    id: 'cesgpt',
    description: 'An AI assistant that helps with research, writing, reports, and images.',
    icon: strokeIcon(<><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>),
  },
  {
    id: 'streamify',
    description: 'Find where any show or movie is streaming, and the best deal to watch it.',
    icon: strokeIcon(<><rect x="3" y="5" width="18" height="13" rx="2" /><path d="M10 9l5 2.5-5 2.5z" /><path d="M8 21h8" /></>),
  },
  {
    id: 'discount_club',
    description: 'Member deals on electronics, travel, movie tickets, groceries, and more.',
    icon: strokeIcon(<><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" /></>),
  },
];

/** `part="hero"` renders the header; `part="services"` the service cards (placed inside <main>). */
export function CESRefreshIntro({ catalog, healthcare, nav, part }: { catalog: PublicCatalog; healthcare: boolean; nav?: React.ReactNode; part: 'hero' | 'services' }) {
  const essential = catalog.products.find((p) => p.id === 'starter');
  const name = new Map(catalog.services.map((s) => [s.id, s.name]));
  const addon = new Map(catalog.products.filter((p) => p.kind === 'addon').map((p) => [p.serviceIds[0], p]));
  const cards = SERVICES.filter((s) => name.has(s.id));
  const tag = (id: string) => {
    if (id === 'discount_club') return 'Free with any plan';
    if (essential?.serviceIds.includes(id)) return `In the ${essential.name} plan`;
    const a = addon.get(id);
    return a ? `Add-on · ${money(a.priceCents)}/mo` : null;
  };
  const words = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];

  if (part === 'hero') return (
      <header className="ces-refresh-hero" aria-labelledby="ces-refresh-title">
        <img className="ces-refresh-hero__photo" src="/images/ces-family-hero.webp" alt="" fetchPriority="high" />
        <div className="ces-refresh-hero__shade" aria-hidden="true" />
        <div className="ces-refresh-hero__nav">{nav}</div>
        <div className="ces-refresh-hero__content">
          {essential && (
            <p className="ces-refresh-hero__eyebrow">
              <span aria-hidden="true" /> {essential.name} plan · {money(essential.priceCents)}/month
            </p>
          )}
          <h1 id="ces-refresh-title">
            {healthcare ? 'Healthcare, legal help, and protection for your whole family.' : 'Legal help, tax prep, and protection for your whole family.'}
          </h1>
          <p className="ces-refresh-hero__copy">
            {healthcare
              ? `Unlimited $0-copay doctor visits, a family legal plan, tax prep, and credit monitoring, starting at ${money(essential?.priceCents ?? 0)} a month.`
              : `A family legal plan, tax prep, credit monitoring, and a VPN, starting at ${money(essential?.priceCents ?? 0)} a month.`}
          </p>
          <a className="ces-refresh-button" href="#plans">
            See plans <span aria-hidden="true">→</span>
          </a>
          <p className="ces-refresh-hero__note">Cancel anytime. Your access lasts through the end of your billing month.</p>
        </div>
      </header>
  );

  return (
      <section className="ces-refresh-services" id="services" aria-labelledby="ces-refresh-services-title">
        <div className="ces-refresh-services__intro">
          <p className="ces-refresh-kicker">What&apos;s included</p>
          <h2 id="ces-refresh-services-title">{words[cards.length] ?? cards.length} essential services for your family.</h2>
          <p>
            {essential
              ? `The ${essential.name} plan covers legal help, tax prep, credit monitoring, and the Discount Club. Add the others anytime, or build your own plan.`
              : 'Pick a plan or build your own.'}
          </p>
        </div>
        <ul className="ces-refresh-services__grid" data-count={cards.length}>
          {cards.map((s) => (
            <li className="ces-refresh-service" key={s.id}>
              <span className="ces-refresh-service__icon">{s.icon}</span>
              <h3>{name.get(s.id)}</h3>
              <p>{s.description}</p>
              {tag(s.id) && <p className="ces-refresh-service__tag">{tag(s.id)}</p>}
            </li>
          ))}
        </ul>
      </section>
  );
}
