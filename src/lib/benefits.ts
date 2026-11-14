// Plan Guides content, from the CES Essentials design.
// Public view never shows partner names or app links.

export type BenefitsView = 'public' | 'member' | 'hr';

export type Section =
  | { type: 'numbered' | 'cards'; title: string; intro?: string; note?: string; items: { n?: number; title: string; text: string }[] }
  | { type: 'bullets'; title: string; intro?: string; note?: string; items: string[] }
  | { type: 'steps'; title: string; intro?: string; note?: string; items: { n: number; text: string }[] }
  | { type: 'links'; title: string; intro?: string; note?: string; items: { label: string; href: string }[] }
  | { type: 'table'; title: string; intro?: string; note?: string; rows: { name: string; member: string; regular: string }[] };

export interface BenefitService {
  id: string;
  name: string;
  group: string;
  provider: string | null;
  lead: string;
  sections: Section[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sec = (o: any): Section => ({ items: [], ...o });
const num = (list: string[][]) => list.map((x, i) => ({ n: i + 1, title: x[0], text: x[1] }));
const cards = (list: string[][]) => list.map((x) => ({ title: x[0], text: x[1] }));
const steps = (list: string[]) => list.map((t, i) => ({ n: i + 1, text: t }));

export const BENEFIT_ORDER = ['legal', 'tax', 'credit', 'health', 'gpt', 'stream', 'wallet'] as const;

export function benefitServices(view: BenefitsView): Record<string, BenefitService> {
  const pub = view === 'public';
  const start = (publicSteps: string[], memberSteps: string[]) =>
    sec({ type: 'steps', title: 'How to get started', items: steps(pub ? publicSteps : memberSteps) });

  const legalRows = [
      ['Simple Will with Minor’s Trust', '$300.00', '$580.00'],
      ['Chapter 7 Bankruptcy', '$995.00', '$1,800.00'],
      ['Non-Payment of Court-Ordered Support', '$1,250.00', '$3,000.00'],
      ['Uncontested Divorce', '$750.00', '$1,500.00'],
      ['Small Business Incorporation', '$750.00', '$2,000.00'],
      ['Residential Real Estate Document Review', '$350.00', '$775.00'],
      ['Traffic Ticket Defense', '$89.00', '$199.00']
    ].map((r) => ({ name: r[0], member: r[1], regular: r[2] }));

    const services = {
      legal: {
        name: 'Family Legal Plan', group: 'Family Legal + Tax Prep', provider: 'Legal Club',
        lead: 'Real legal help for you and your family: free consultations, document reviews, wills, and more through your plan attorney.',
        sections: [
          sec({ type: 'numbered', title: 'Free legal services', intro: 'Nine services available at no charge from your plan attorney.', items: num([
            ['Initial phone consultations', ' for each new matter, with no time limit.'],
            ['Initial face-to-face consultations', ' for each new legal matter, with no time limit.'],
            ['Review of legal documents', ': up to six pages per document, with no limit on the number of new documents.'],
            ['A free Simple Will', ' for you and your family, updated every year at no charge.'],
            ['A state-specific Living Will form', ' online, which can be notarized by a Notary Public.'],
            ['Help representing yourself', ' in small claims court.'],
            ['Help with government programs', ', such as immigration services and welfare.'],
            ['Letters written on your behalf', ' when your attorney deems it appropriate (one per legal matter, no limit on new matters).'],
            ['Phone calls made on your behalf', ' when your attorney deems it appropriate (one per legal matter, no limit on new matters).']
          ]), note: 'In certain situations, attorney liability may require plan attorneys to ask for a retainer before providing some of the free legal services.' }),
          sec({ type: 'table', title: 'Deeply discounted legal services', intro: 'Seven commonly used services at a one-time, deeply discounted fee.', rows: legalRows }),
          sec({ type: 'cards', title: 'Beyond the included services', items: cards([
            ['Reduced hourly rate', '40% off the attorney’s normal hourly rate (minimum $125/hour) for care beyond the free and discounted services.'],
            ['Contingency fee discount', '10% off the state maximum rate or the attorney’s usual rate, whichever is lower.'],
            ['Retainers', 'For extended legal care, plan attorneys may ask you for a retainer.']
          ]) }),
          sec({ type: 'bullets', title: 'Free online legal forms', intro: 'Download and complete state-specific, self-service forms to create legally valid documents.', items: ['Last Will and Testament', 'Bill of Sale', 'Landlord/Tenant Agreements', 'Leases', 'Advance Health Care Directive / Living Will', 'Power of Attorney'] }),
          start(
            ['Join with Essential, All-in-One, or Family Legal + Tax Prep.', 'You get a setup email with the link to create your legal plan account.', 'Your account becomes active within 24 to 48 hours.'],
            ['Open your setup email, or go to legalclub.com/members.aspx.', 'Register with your CES Essentials account email.', 'Allow 24 to 48 hours for your account to become active. If you aren’t recognized yet, try again after 48 hours.']
          )
        ]
      },
      tax: {
        name: 'Tax Preparation & Advice', group: 'Family Legal + Tax Prep', provider: 'Legal Club',
        lead: 'Free tax return preparation, unlimited tax advice, and expert help with IRS notices and audits.',
        sections: [
          sec({ type: 'numbered', title: 'Tax-related benefits', items: num([
            ['Free mail-in tax return preparation', ' for your Form 1040.*'],
            ['Free preparation of all schedules', ' that accompany Form 1040.*'],
            ['Unlimited federal tax advice', ' for personal and business matters by phone, fax, or email, with no time or frequency limits.'],
            ['IRS notice review', ': tax professionals review any IRS notice or letter and advise you on how to resolve it.'],
            ['IRS audit assistance', ' and IRS notification assistance.'],
            ['Online tutorials', ' covering IRS audits and IRS notifications.'],
            ['Tax planning', ' to help you prepare for the year ahead.'],
            ['Review of your prior year’s tax return.', '*']
          ]), note: '*Limit one per household. Free tax preparation is limited to individual returns filed on Form 1040 and its accompanying schedules.' }),
          sec({ type: 'bullets', title: 'Member tax portal', items: ['Tax tips', 'Tax law changes', 'Tax organization area', 'IRS audit area', 'IRS notification area', 'Online member advice'] }),
          sec({ type: 'cards', title: 'Qualified professionals, backed by $1 million', items: cards([
            ['Who helps you', 'Tax attorneys, financial analysts, CPAs, former auditors, and IRS Enrolled Agents.'],
            ['Peace of mind', 'All tax hotline advice is backed by a $1 million liability policy.']
          ]) }),
          start(
            ['Join with Essential, All-in-One, or Family Legal + Tax Prep.', 'You get a setup email with the link to create your account.', 'Your account becomes active within 24 to 48 hours.'],
            ['Use the same account as your Family Legal Plan: legalclub.com/members.aspx.', 'Register with your CES Essentials account email.', 'Allow 24 to 48 hours for your account to become active.']
          )
        ]
      },
      credit: {
        name: 'Credit Monitoring + VPN', group: 'Identity & online protection', provider: 'IdentityIQ (Secure Plan) and Bitdefender Total Security',
        lead: 'Complete identity protection 24/7, plus a VPN and device security for up to 10 devices.',
        sections: [
          sec({ type: 'cards', title: 'Credit monitoring & ID theft protection', items: cards([
            ['Credit monitoring & alerts', 'Active 1-bureau credit monitoring with alerts.'],
            ['$1 million ID theft coverage', 'Up to $1 million in identity theft insurance for the primary member.*'],
            ['Dark web & internet monitoring', 'We search the dark web for your SSN, name, email, and address in 25+ languages and alert you to suspicious activity.'],
            ['SSN alerts', 'We monitor your Social Security number for attempted misuse.'],
            ['U.S.-based fraud restoration', 'Expert restoration specialists help protect your finances, privacy, and rights.'],
            ['Synthetic ID theft monitoring', 'Watches for fraud that combines real and fake data to create a new identity.'],
            ['File sharing network monitoring', 'We watch networks where thieves may share or sell identity files.'],
            ['Checking account reporting', 'Checks for flagged checking accounts that may signal fraud or unpaid fees.'],
            ['Lost wallet assistance', 'Help quickly canceling and replacing lost cards and IDs.'],
            ['Junk mail & do-not-call opt-out', 'Keep telemarketers and direct mailers away.']
          ]), note: '*Identity theft insurance covers the primary member. Terms and conditions apply.' }),
          sec({ type: 'cards', title: 'VPN & device security', intro: 'Block suspicious network activity and stay anonymous online on PC, Mac, or mobile.', items: cards([
            ['VPN online privacy', 'Encrypts your internet connection. Unlimited encrypted traffic for up to 10 devices.'],
            ['Password manager', 'Securely store and organize your logins.'],
            ['Anti-malware', 'Detects, blocks, and removes viruses, spyware, and other threats.'],
            ['Parental controls', 'Help keep your kids safe online. Children are often targets of identity theft that goes unnoticed for years.']
          ]) }),
          start(
            ['Join with Essential, All-in-One, or Credit Monitoring + VPN.', 'Your activation code appears in your member area right away.', 'Activate both credit monitoring and the VPN with that one code.'],
            ['Copy your activation code from My Services.', 'Click Activate with provider and register with your CES Essentials account email.', 'Install the security app on up to 10 devices. VPN questions: (877) 875-4374.']
          )
        ]
      },
      health: {
        name: 'Virtual Healthcare', group: 'All-in-One or à la carte', provider: 'MiSalud',
        lead: 'Care today and care that lasts: same-day primary and urgent care, mental health support, and ongoing care for chronic conditions. In English or Spanish, with a $0 copay.',
        sections: [
          sec({ type: 'bullets', title: 'How it works', items: ['$0 copay on every visit', 'You plus up to 3 more people', 'By video, phone, or chat', 'In English or Spanish', 'Same-day care for everyday and urgent needs', 'Prescriptions when clinically appropriate'] }),
          sec({ type: 'cards', title: 'Ways to get care', intro: 'One care team for what hurts now and what comes next.', items: cards([
            ['Primary & urgent care', 'Colds, flu, injuries, and sick days, same day. A bilingual health coach first, and a U.S.-licensed clinician when needed.'],
            ['Mental health', 'Confidential support in English or Spanish, same day, from the same care team.'],
            ['Chronic conditions', 'Diabetes, blood pressure, and cholesterol. A coach and a physician together in one 12- to 16-week program.'],
            ['Nutrition', 'Twelve coaching sessions built around the food you already eat, in your language.'],
            ['Women\u2019s health', 'One care pathway for every stage, from cycle health through menopause.'],
            ['Kids & teens', 'Care for the whole family, with Healthy Bites and Healthy Kids programs for parents and kids together.'],
            ['GLP-1 support', 'Screening, physician review, a treatment plan, coaching, and labs and refills. A physician decides; a coach stays with you. Part of chronic conditions care.'],
            ['Same care team over time', 'For ongoing conditions and refills, you keep working with people who already know you.']
          ]), note: 'Care is provided by a licensed telehealth provider. A U.S.-licensed clinician decides on prescriptions and treatment.' }),
          start(
            ['Join with All-in-One or add Virtual Healthcare.', 'You get a setup email with the app download steps and your access code.', 'Download the app and book your first visit, same day.'],
            ['Download the MiSalud app (links below).', 'Enter the group code shown on your Virtual Healthcare card in My Services.', 'Register with your CES Essentials account email, then add up to 3 more people.']
          ),
          sec({ type: 'links', title: 'Get the app', items: pub ? [] : [{ label: 'Download on the App Store', href: 'https://apps.apple.com/us/app/misalud-health/id1601700024' }, { label: 'Get it on Google Play', href: 'https://play.google.com/store/apps/details?id=io.ionic.misalud' }] })
        ].filter((x) => !(x.type === 'links' && x.items.length === 0))
      },
      gpt: {
        name: 'CESgpt', group: 'Essential, All-in-One, or à la carte', provider: 'Creating Empowerment Solutions',
        lead: 'An AI assistant that streamlines your work, sparks creativity, and handles complex tasks for you.',
        sections: [
          sec({ type: 'cards', title: 'Core features', items: cards([
            ['Super Agent', 'Give it one goal. It breaks the job into steps, works through each one, checks results, and delivers the finished output: research, content series, data analysis, reports.'],
            ['Image generation', 'Describe what you need, such as a logo, illustration, or social media graphic, and get it instantly. Control style, size, colors, and detail, and refine until it’s right.'],
            ['Always growing', 'New tools and specialized modes for business and personal productivity are added over time.']
          ]) }),
          start(
            ['Join with Essential, All-in-One, or add CESgpt.', 'Open CESgpt from your member area.', 'Start with a clear goal or prompt.'],
            ['Click Open CESgpt in My Services.', 'Give it a clear goal or prompt.', 'Use Super Agent for multi-step tasks and Image Generation for visuals.']
          )
        ]
      },
      stream: {
        name: 'Streamify Me', group: 'Essential, All-in-One, or à la carte', provider: 'Creating Empowerment Solutions',
        lead: 'Find where any show or movie is streaming, and the best deal to watch it.',
        sections: [
          sec({ type: 'cards', title: 'What you get', items: cards([
            ['Best streaming deals', 'Compares prices across streaming platforms so you don’t overpay.'],
            ['Search by title or actor', 'See exactly where a movie or show is streaming.'],
            ['Where it works', 'United States, United Kingdom, and Canada. Mexico is coming soon.']
          ]) }),
          start(
            ['Join with Essential, All-in-One, or add Streamify Me.', 'Open it from your member area.'],
            ['Click Open Streamify Me in My Services.', 'Search any movie, show, or actor.']
          )
        ]
      },
      wallet: {
        name: 'Discount Club', group: 'Free with any plan', provider: 'Working Advantage',
        lead: 'More perks, more savings: exclusive deals and limited-time offers on the products, services, and experiences you need and love.',
        sections: [
          sec({ type: 'bullets', title: 'Start saving on', items: ['Electronics', 'Appliances', 'Apparel', 'Cars', 'Flowers', 'Fitness memberships', 'Gift cards', 'Groceries', 'Hotels', 'Movie tickets', 'Rental cars', 'Special events', 'Theme parks', 'And more'] }),
          start(
            ['Join with any plan. The Discount Club is included free.', 'Your member area shows how to sign up and your access code.', 'Create your account and start saving.'],
            ['Go to cesdiscountclub.com and click Become a Member.', 'Enter the company code shown on your Discount Club card in My Services.', 'Create your account with your CES Essentials account email.']
          )
        ]
      }
    };

  const out: Record<string, BenefitService> = {};
  for (const [id, svc] of Object.entries(services)) {
    out[id] = { ...svc, id, provider: pub ? null : svc.provider };
  }
  return out;
}

/** The guide with Virtual Healthcare (and the All-in-One plan that includes it) taken out. */
export function withoutHealthcare(services: Record<string, BenefitService>): Record<string, BenefitService> {
  const fix = (t: string) =>
    t
      .replace(/Essential, All-in-One, or /g, 'Essential or ')
      .replace(/Join with All-in-One or add (.+?)\./g, 'Add $1 à la carte.')
      .replace(/All-in-One or à la carte/g, 'À la carte');
  const deep = <T,>(v: T): T => {
    if (typeof v === 'string') return fix(v) as T;
    if (Array.isArray(v)) return v.map(deep) as T;
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)])) as T;
    return v;
  };
  const out: Record<string, BenefitService> = {};
  for (const [id, s] of Object.entries(services)) if (id !== 'health') out[id] = deep(s);
  return out;
}

/** Public guide on the business-only site: "how to join" steps describe company plans, not individual purchase. */
export function forBusiness(services: Record<string, BenefitService>): Record<string, BenefitService> {
  const fix = (t: string) =>
    t
      .replace(/^Join with [^.]*\./, 'Your company adds you to CES Essentials.')
      .replace(/^Add .+? à la carte\./, 'Your company adds you to CES Essentials.')
      .replace(/^Essential(, All-in-One,)? or à la carte$/, 'In the Essential plan')
      .replace(/^All-in-One or à la carte$/, 'All-in-One plan')
      .replace(/^Free with any plan$/, 'Included in every plan');
  const deep = <T,>(v: T): T => {
    if (typeof v === 'string') return fix(v) as T;
    if (Array.isArray(v)) return v.map(deep) as T;
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)])) as T;
    return v;
  };
  return Object.fromEntries(Object.entries(services).map(([id, s]) => [id, deep(s)]));
}
