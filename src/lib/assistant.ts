import 'server-only';
import { allProducts } from '@/lib/catalog';
import { BENEFIT_ORDER, benefitServices, withoutHealthcare, type Section } from '@/lib/benefits';
import { healthcareOnSale, includesHealthcare } from '@/lib/healthcare';
import { MIN_SEATS } from '@/lib/company';
import { money } from '@/lib/money';
import { admin } from '@/lib/supabase/admin';
import { env } from '@/lib/env';

// Everything the website chat knows comes from here: live prices from the
// products table, the public Plan Guides (no partner names), and our policies.

const PARTNER_NAMES = ['MiSalud', 'IdentityIQ', 'Bitdefender', 'Legal Club', 'Working Advantage'];

function sectionText(s: Section): string {
  const lines = [`### ${s.title}`];
  if (s.intro) lines.push(s.intro);
  if (s.type === 'numbered' || s.type === 'cards') for (const i of s.items) lines.push(`- ${i.title}${i.text.startsWith(' ') || i.text.startsWith(':') || i.text.startsWith(',') ? i.text : `: ${i.text}`}`);
  if (s.type === 'bullets') for (const i of s.items) lines.push(`- ${i}`);
  if (s.type === 'steps') for (const i of s.items) lines.push(`${i.n}. ${i.text}`);
  if (s.type === 'table') for (const r of s.rows) lines.push(`- ${r.name}: member price ${r.member} (regular ${r.regular})`);
  if (s.note) lines.push(`Note: ${s.note}`);
  return lines.join('\n');
}

// Public pages the chat reads word for word. The Plan Guides page is covered
// in full by the structured data below (its page only renders one tab at a time).
const PAGES: [string, string][] = [
  ['/', 'Homepage (plans, build your own, checkout, savings, FAQ)'],
  ['/for-businesses', 'For Businesses'],
  ['/terms', 'Terms of Service'],
  ['/privacy', 'Privacy Policy'],
  ['/refund-policy', 'Refund Policy'],
  ['/contact', 'Contact'],
];

function htmlToText(html: string): string {
  let b = html.replace(/[\s\S]*?<body[^>]*>/i, '').replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ');
  b = b
    .replace(/<\/(p|li|h[1-6]|div|section|tr|summary|details|label|button|dt|dd)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ');
  return b
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((l, i, a) => a.indexOf(l) === i)
    .filter((l) => l !== 'Ask a question')
    .join('\n');
}

/** Live text of every public page. Missing pages are skipped and retried soon. */
async function websitePages(): Promise<{ text: string; complete: boolean }> {
  const results = await Promise.all(
    PAGES.map(async ([path, title]) => {
      try {
        const res = await fetch(`${env.siteUrl()}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`${res.status}`);
        return `## Page: ${title} (${env.siteUrl()}${path === '/' ? '' : path})\n${htmlToText(await res.text())}`;
      } catch (err) {
        console.error('chat: could not read page', path, err);
        return null;
      }
    }),
  );
  return { text: results.filter(Boolean).join('\n\n'), complete: results.every(Boolean) };
}

async function buildKnowledge(): Promise<string> {
  const [products, services, healthcare] = await Promise.all([
    allProducts(),
    admin().from('services').select('id, name, public_description, sort_order').order('sort_order'),
    healthcareOnSale(),
  ]);
  if (services.error) throw services.error;
  const serviceName = new Map(services.data.map((s) => [s.id, s.name as string]));
  const live = products.filter((p) => p.active && (healthcare || !includesHealthcare(p)));
  const includes = (p: (typeof live)[number]) =>
    [...p.product_services.map((s) => serviceName.get(s.service_id) ?? s.service_id), 'Discount Club (free with any purchase)']
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(', ');

  // A yearly plan is mentioned only once it can actually be bought.
  const packages = live.filter((p) => p.public && p.kind === 'package' && (p.billing_interval !== 'year' || !!p.stripe_price_id || !!p.shopify_selling_plan_id));
  const addons = live.filter((p) => p.public && p.kind === 'addon');
  const company = live.filter((p) => p.kind === 'company_package');
  const regularFor = (id: string) => live.find((p) => p.id === id.replace(/_company$/, ''));

  const guide = healthcare ? benefitServices('public') : withoutHealthcare(benefitServices('public'));
  const benefitText = BENEFIT_ORDER.filter((id) => guide[id]).map((id) => {
    const b = guide[id];
    return [`## ${b.name} (${b.group})`, b.lead, ...b.sections.map(sectionText)].join('\n\n');
  }).join('\n\n');

  return `# CES Essentials: product and price facts

Website: ${env.siteUrl()}
Company: Creating Empowerment Solutions LLC (Wyoming). Contact email: abryant@tbfremail.com (Contact page: ${env.siteUrl()}/contact).

## Plans for individuals and families (U.S. dollars)
${packages
  .map((p) =>
    p.billing_interval === 'year'
      ? `- ${p.name}: ${money(p.price_cents)} per year, paid once a year (works out to ${money(Math.round(p.price_cents / 12))} a month). Includes: ${includes(p)}.`
      : `- ${p.name}: ${money(p.price_cents)} per month. Includes: ${includes(p)}.`,
  )
  .join('\n')}

## Build your own (à la carte, each billed monthly)
${addons.map((p) => `- ${p.name}: ${money(p.price_cents)} per month. Includes: ${includes(p)}.`).join('\n')}
- Any combination can be picked. If the picks cost more than a package that covers them, the website shows a "Save $X" tip pointing to that package.
- The Discount Club is free with any purchase; it cannot be bought on its own.

## Company plans (businesses and organizations)
${company.map((p) => {
    const reg = regularFor(p.id);
    return `- ${p.name}: ${money(p.price_cents)} per person per month${reg ? ` (regular price ${money(reg.price_cents)})` : ''}. Includes: ${includes(p)}.`;
  }).join('\n')}
- Minimum ${MIN_SEATS} people. The company is billed monthly for its active people, with a ${MIN_SEATS}-person minimum (fewer than ${MIN_SEATS} people are billed as ${MIN_SEATS}).
- One plan for the whole team (${company.map((p) => p.name.replace(' (Company)', '')).join(' or ')}). À la carte items are not offered as company plans.
- How to sign up: fill out the form on the For Businesses page (${env.siteUrl()}/for-businesses). CES reviews it and emails a private signup link with company pricing. The company then picks the plan and number of people, sets up an HR login, and pays with a company card.
- HR dashboard: upload one spreadsheet of names and emails; each person gets their own login and welcome email. Add or remove people anytime; the bill adjusts. A removed person keeps access to the end of that billing month.
- Companies sign a company agreement at signup (including not going around CES to deal directly with its providers).

## How buying works (individuals)
1. Pick a plan, or build your own on the homepage.
2. Fill in your details, check the box confirming you understand the no-refund policy, and pay securely by card.
3. Your member area unlocks right away with everything you bought, including activation codes and setup steps. You also get a welcome email and setup emails.
- Register every service with the same email you used for your CES Essentials account. Providers match you by that email.
- You must be 18 or older to buy.

## Billing and policies
- Plans are subscriptions that renew automatically until canceled: monthly, or yearly for the yearly plan listed above (if one is listed). Sales tax is not added.
- Yearly plans: If you cancel a yearly plan within the first 3 months of a paid year, you pay the regular monthly price for each month you used (a partial month counts as a full month), the rest of what you paid is refunded to your card, and your access ends when the last of those months ends. After the first 3 months of a paid year there are no refunds, and your access continues through the end of the year you paid for. Yearly members get a reminder email about 30 days before renewal. Switching between monthly and yearly is done by emailing us.
- Cancel anytime from the member area (My Plan). No future charges; access lasts through the end of the month already paid for.
- Monthly plans: no refunds once a billing month has started, including partial months or unused benefits.
- Switching plans: anytime in the member area. Moving to a more expensive plan starts right away (prorated difference charged). Moving to a cheaper plan starts on the next billing date.
- Failed payment: access stays on for 2 days while the charge is retried, then pauses until payment goes through.
- Activation codes are for personal use only and are never reused or shared.
- CES Essentials is not insurance and is not a substitute for health insurance.${healthcare ? ' Virtual healthcare is not for emergencies: call 911.' : ''}
- To change your account email, email us.

## Speed of access
- Most services are ready right after payment.
- Family Legal + Tax Prep takes 24 to 48 hours to become active.
- Credit Monitoring + VPN: one activation code, shown in the member area, activates both.
${healthcare ? '- Healthcare covers you plus up to 3 more people, at any address, with a $0 copay.' : '- Virtual Healthcare and the All-in-One plan are not offered right now. If asked, say they are not available at this time and suggest Essential or the à la carte items above. Do not describe healthcare benefits or give a date for their return.'}

# Benefit details (public Plan Guides)

${benefitText}
`;
}

const RULES = `You are the CES Essentials website assistant. You answer questions from shoppers, members, and businesses about CES Essentials plans, prices, what each benefit includes, how to sign up, company plans, and billing policies.

How to answer:
- Use only the facts in the knowledge section below: the product facts, the Plan Guides, and the current text of every public page of the website (homepage, For Businesses, Terms, Privacy, Refund Policy, Contact). Prices there are current; quote them exactly. You may answer questions about the Terms, Privacy Policy, and Refund Policy by explaining what those pages say, and link the page. Never invent a price, discount, benefit, or policy. If the answer is not in the facts, say you don't have that detail and suggest emailing abryant@tbfremail.com or visiting the Contact page.
- Never name the companies that provide the benefits, even if asked directly or if the visitor names one. Say the services come from independent, licensed partner providers, and that members see setup details in their member area.
- Help people compare. When someone lists what they want, add up the à la carte prices and point out a package if it is cheaper. Do the math carefully. For companies, multiply the per-person price by the number of people, using the ${MIN_SEATS}-person minimum.
- You cannot see anyone's account, orders, or codes, and you cannot buy, cancel, or change anything. Point members to their member area (Log in at the top of the site) for that, and businesses to the For Businesses page.
- Do not give medical, legal, or tax advice. Explain what the benefit offers and suggest using it. For a medical emergency, tell them to call 911.
- Stay on CES Essentials topics. Politely decline unrelated requests.
- Write in plain, friendly, short answers: a few sentences or a short list. Use simple words. Plain text only: no headings, no tables, no bold or other markdown symbols; use "- " for list items when a list helps.`;

let cached: { text: string; until: number } | null = null;

/** The full system prompt. Rebuilt every 10 minutes so price and page changes show up. */
export async function assistantSystemPrompt(): Promise<string> {
  if (cached && Date.now() < cached.until) return cached.text;
  const [facts, pages] = await Promise.all([buildKnowledge(), websitePages()]);
  let knowledge = `${facts}\n# Website pages (current text of cesessentials.com)\n\n${pages.text}\n`;
  for (const name of PARTNER_NAMES) {
    if (knowledge.toLowerCase().includes(name.toLowerCase())) {
      console.error(`chat: partner name found in website text and removed: ${name}`);
      knowledge = scrubPartnerNames(knowledge);
    }
  }
  const text = `${RULES}\n\n<knowledge>\n${knowledge}</knowledge>`;
  cached = { text, until: Date.now() + (pages.complete ? 10 : 1) * 60 * 1000 };
  return text;
}

/** Last-line safety net on the model's reply. */
export function scrubPartnerNames(text: string): string {
  let out = text;
  for (const name of PARTNER_NAMES) out = out.replace(new RegExp(name.replace(/\s+/g, '\\s*'), 'gi'), 'our partner provider');
  return out;
}
