import 'server-only';
import { admin } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { ensureAccount, setPasswordLink } from '@/lib/accounts';
import { getMember, syncSubscription } from '@/lib/fulfillment';
import { sendAccountInvite } from '@/lib/email';
import { billedSeats } from '@/lib/company';
import { refreshShopifySubscription } from '@/lib/shopify-billing';

export interface OrgSub {
  id: string;
  provider: 'stripe' | 'shopify';
  stripe_subscription_id: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  keep_until: string | null;
}

export async function orgSubscription(orgId: string): Promise<OrgSub | null> {
  const { data } = await admin()
    .from('subscriptions')
    .select('id, stripe_subscription_id, status, current_period_end, cancel_at_period_end, keep_until, provider')
    .eq('organization_id', orgId)
    .not('status', 'in', '(canceled,incomplete_expired)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export interface Person {
  profileId: string;
  name: string;
  email: string;
  status: 'active' | 'removing' | 'removed';
  invited: boolean; // has not logged in yet
  addedAt: string;
  removeAt: string | null;
}

export async function orgPeople(orgId: string): Promise<Person[]> {
  const db = admin();
  const [{ data: rows }, { data: logins }] = await Promise.all([
    db
      .from('organization_members')
      .select('profile_id, status, remove_at, created_at, profiles(full_name, email)')
      .eq('organization_id', orgId)
      .eq('role', 'employee')
      .order('created_at', { ascending: true }),
    db.rpc('org_member_logins', { p_org: orgId }),
  ]);
  const seen = new Map((logins ?? []).map((l: { profile_id: string; last_sign_in_at: string | null }) => [l.profile_id, l.last_sign_in_at]));
  return (rows ?? []).map((r) => {
    const p = (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles) as { full_name: string; email: string };
    return {
      profileId: r.profile_id,
      name: p?.full_name ?? '',
      email: p?.email ?? '',
      status: r.status,
      invited: !seen.get(r.profile_id),
      addedAt: r.created_at,
      removeAt: r.remove_at,
    };
  });
}

/** Sets the Stripe quantity to the active head count (5 minimum). */
export async function updateSeats(orgId: string) {
  const db = admin();
  const sub = await orgSubscription(orgId);
  if (!sub) return;
  const { count } = await db
    .from('organization_members')
    .select('profile_id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('role', 'employee')
    .eq('status', 'active');
  const qty = billedSeats(count ?? 0);
  // Shopify-billed companies: the seat count is changed in CES Marketplace, not here.
  if (sub.provider === 'shopify') return;
  const s = await stripe().subscriptions.retrieve(sub.stripe_subscription_id);
  const item = s.items.data[0];
  if (!item || item.quantity === qty) return;
  await stripe().subscriptions.update(sub.stripe_subscription_id, {
    items: [{ id: item.id, quantity: qty }],
    // Added people are charged for the rest of this month on the next bill;
    // removed people keep access to month end and simply drop off the next bill.
    proration_behavior: qty > (item.quantity ?? 0) ? 'create_prorations' : 'none',
  });
}

export interface NewPerson { firstName: string; lastName: string; email: string }
export type AddResult = { email: string; result: 'added' | 'already' | 'readded' | 'error'; message?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const validEmail = (e: string) => EMAIL.test(e);

/** Classifies rows before anything is added (used by the upload review step). */
export async function reviewPeople(orgId: string, rows: NewPerson[]) {
  const db = admin();
  const ready: NewPerson[] = [];
  const skipped: { email: string; reason: string }[] = [];
  const errors: { row: number; message: string }[] = [];
  const seen = new Set<string>();
  const emails = rows.map((r) => r.email.trim().toLowerCase()).filter(validEmail);
  const { data: profiles } = emails.length
    ? await db.from('profiles').select('id, email, organization_members(organization_id, status, role)').in('email', emails)
    : { data: [] };
  const byEmail = new Map((profiles ?? []).map((p) => [p.email as string, p]));

  rows.forEach((r, i) => {
    const rowNo = i + 2; // row 1 is the header
    const email = r.email.trim().toLowerCase();
    const name = `${r.firstName} ${r.lastName}`.trim();
    if (!validEmail(email)) return errors.push({ row: rowNo, message: `"${r.email}" isn't a complete email.` });
    if (!name) return errors.push({ row: rowNo, message: `${email} is missing a name.` });
    if (seen.has(email)) return skipped.push({ email, reason: 'listed twice in this file' });
    seen.add(email);
    const p = byEmail.get(email);
    const links = (p?.organization_members ?? []) as { organization_id: string; status: string; role: string }[];
    const here = links.find((l) => l.organization_id === orgId && l.role === 'employee');
    if (here && here.status !== 'removed') return skipped.push({ email, reason: 'already on your team' });
    if (links.some((l) => l.organization_id !== orgId && l.role === 'employee' && l.status !== 'removed')) {
      return errors.push({ row: rowNo, message: `${email} is already on another company's plan.` });
    }
    ready.push({ firstName: r.firstName.trim(), lastName: r.lastName.trim(), email });
  });
  return { ready, skipped, errors };
}

/** Adds people to the company plan, updates the bill, and sends welcome emails. */
export async function addPeople(org: { id: string; name: string }, rows: NewPerson[]): Promise<AddResult[]> {
  const db = admin();
  const sub = await orgSubscription(org.id);
  if (!sub || !['active', 'trialing', 'past_due'].includes(sub.status)) throw new Error('Your company plan is not active yet.');
  const { ready, errors } = await reviewPeople(org.id, rows);
  const results: AddResult[] = errors.map((e) => ({ email: '', result: 'error', message: e.message }));

  const added: { id: string; email: string; name: string }[] = [];
  for (const r of ready) {
    const name = `${r.firstName} ${r.lastName}`.trim();
    try {
      const acct = await ensureAccount({ email: r.email, fullName: name, organizationId: org.id, extra: { first_name: r.firstName, last_name: r.lastName } });
      const { data: prev } = await db
        .from('organization_members')
        .select('status')
        .eq('organization_id', org.id)
        .eq('profile_id', acct.id)
        .maybeSingle();
      await db.from('organization_members').upsert(
        { organization_id: org.id, profile_id: acct.id, role: 'employee', status: 'active', remove_at: null, removed_at: null },
        { onConflict: 'organization_id,profile_id' },
      );
      if (!acct.created) await db.from('profiles').update({ organization_id: org.id }).eq('id', acct.id).is('organization_id', null);
      added.push({ id: acct.id, email: r.email, name });
      results.push({ email: r.email, result: prev ? 'readded' : 'added' });
    } catch (e) {
      results.push({ email: r.email, result: 'error', message: e instanceof Error ? e.message : 'Could not add' });
    }
  }

  if (added.length) {
    await updateSeats(org.id);
    // turns services on, assigns codes, sends setup emails
    if (sub.provider === 'shopify') await refreshShopifySubscription(sub.id);
    else await syncSubscription(sub.stripe_subscription_id);
    const { data: product } = await db.from('organizations').select('products(name)').eq('id', org.id).single();
    const planName = ((Array.isArray(product?.products) ? product?.products[0] : product?.products) as { name?: string } | null)?.name?.replace(' (Company)', '');
    for (const a of added) await sendWelcome(org, a, planName);
  }
  return results;
}

async function sendWelcome(org: { id: string; name: string }, person: { id: string; email: string; name: string }, planName?: string) {
  try {
    const link = await setPasswordLink(person.email);
    await sendAccountInvite(person, link, { companyName: org.name, planName }, `${org.id}:${Date.now()}`);
    await admin().from('organization_members').update({ welcome_sent_at: new Date().toISOString() }).eq('organization_id', org.id).eq('profile_id', person.id);
  } catch (e) {
    console.error('welcome email failed', person.email, e);
  }
}

export async function resendWelcome(org: { id: string; name: string }, profileId: string) {
  const m = await getMember(profileId);
  if (!m) throw new Error('Person not found');
  await sendWelcome(org, { id: m.id, email: m.email, name: m.full_name });
}

/** Access continues to the end of the billing month; the next bill drops them. */
export async function removePerson(orgId: string, profileId: string) {
  const db = admin();
  const sub = await orgSubscription(orgId);
  const removeAt = sub?.current_period_end ?? new Date().toISOString();
  await db
    .from('organization_members')
    .update({ status: 'removing', remove_at: removeAt })
    .eq('organization_id', orgId)
    .eq('profile_id', profileId)
    .eq('role', 'employee')
    .eq('status', 'active');
  await updateSeats(orgId);
  return removeAt;
}

/** Undo a removal before it takes effect. */
export async function keepPerson(orgId: string, profileId: string) {
  await admin()
    .from('organization_members')
    .update({ status: 'active', remove_at: null })
    .eq('organization_id', orgId)
    .eq('profile_id', profileId)
    .eq('status', 'removing');
  await updateSeats(orgId);
}

/** Moves members whose removal date has passed off the plan (daily job). */
export async function finishRemovals() {
  const db = admin();
  const { data } = await db
    .from('organization_members')
    .select('organization_id')
    .eq('status', 'removing')
    .lte('remove_at', new Date().toISOString());
  const orgs = [...new Set((data ?? []).map((d) => d.organization_id as string))];
  for (const orgId of orgs) {
    const sub = await orgSubscription(orgId);
    if (!sub) continue;
    if (sub.provider === 'shopify') await refreshShopifySubscription(sub.id);
    else await syncSubscription(sub.stripe_subscription_id);
  }
}
