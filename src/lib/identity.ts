// Member identity: member ID, legal name, date of birth, and mailing address.
// Shared by the browser forms and the server, so the rules are identical.
import { z } from 'zod';

export const US_STATES: [string, string][] = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'],
  ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'],
  ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'],
  ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'],
  ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'],
  ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
  ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'], ['PR', 'Puerto Rico'], ['GU', 'Guam'], ['VI', 'U.S. Virgin Islands'],
  ['AS', 'American Samoa'], ['MP', 'Northern Mariana Islands'],
];
const STATE_CODES = new Set(US_STATES.map(([c]) => c));

export const formatMemberId = (n: number | string | null | undefined) => (n ? `CES-${n}` : '');

/** "CES-100001", "ces 100001" or "100001" → 100001 (or null). */
export function parseMemberId(text: string): number | null {
  const m = text.trim().match(/^(?:ces[\s-]*)?(\d{6,9})$/i);
  return m ? Number(m[1]) : null;
}

export function ageOn(dobIso: string, today = new Date()): number {
  const [y, m, d] = dobIso.split('-').map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--;
  return age;
}

const dob = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter your date of birth.')
  .refine((v) => !Number.isNaN(Date.parse(v)) && ageOn(v) <= 120 && ageOn(v) >= 0, 'Enter a real date of birth.');

/** Fields every member has. Adults only when they buy (adult = true). */
export const identitySchema = (opts: { adult: boolean }) =>
  z.object({
    firstName: z.string().trim().min(1, 'Enter your first name.').max(60),
    lastName: z.string().trim().min(1, 'Enter your last name.').max(60),
    dateOfBirth: opts.adult ? dob.refine((v) => ageOn(v) >= 18, 'You must be 18 or older to buy a plan.') : dob,
    addressLine1: z.string().trim().min(3, 'Enter your street address.').max(120),
    addressLine2: z.string().trim().max(120).optional().default(''),
    city: z.string().trim().min(2, 'Enter your city.').max(80),
    state: z.string().trim().toUpperCase().refine((v) => STATE_CODES.has(v), 'Choose your state.'),
    postalCode: z.string().trim().regex(/^\d{5}(-\d{4})?$/, 'Enter a 5-digit ZIP code.'),
  });

export type Identity = z.infer<ReturnType<typeof identitySchema>>;

/** Identity → profiles columns. */
export const identityColumns = (i: Identity) => ({
  first_name: i.firstName,
  last_name: i.lastName,
  date_of_birth: i.dateOfBirth,
  address_line1: i.addressLine1,
  address_line2: i.addressLine2 || null,
  city: i.city,
  state: i.state,
  postal_code: i.postalCode,
});

export interface ProfileIdentity {
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
}

export const IDENTITY_COLUMNS = 'member_number, first_name, last_name, date_of_birth, address_line1, address_line2, city, state, postal_code';

export const profileComplete = (p: ProfileIdentity | null | undefined) =>
  !!p && !!(p.first_name && p.last_name && p.date_of_birth && p.address_line1 && p.city && p.state && p.postal_code);

/** First error message per field, for showing next to each box. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of error.issues) {
    const k = String(i.path[0] ?? '');
    if (k && !out[k]) out[k] = i.message;
  }
  return out;
}
