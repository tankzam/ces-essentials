import 'server-only';
import { redirect } from 'next/navigation';
import { admin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';
import { env } from '@/lib/env';

/** A link that signs the person in and lets them choose a password. */
export async function setPasswordLink(email: string): Promise<string> {
  const { data, error } = await admin().auth.admin.generateLink({ type: 'recovery', email });
  if (error || !data.properties?.hashed_token) throw error ?? new Error('Could not create link');
  const q = new URLSearchParams({ token_hash: data.properties.hashed_token, type: 'recovery', next: '/reset-password' });
  return `${env.siteUrl()}/auth/confirm?${q}`;
}

/**
 * Finds or creates an account for an email (no password yet). Returns the
 * profile id and whether it was newly created.
 */
export async function ensureAccount(opts: {
  email: string;
  fullName: string;
  phone?: string | null;
  organizationId?: string | null;
  /** Extra profile columns (first/last name, birth date, address). */
  extra?: Record<string, string | null>;
}): Promise<{ id: string; created: boolean }> {
  const db = admin();
  const email = opts.email.trim().toLowerCase();
  const { data: existing } = await db.from('profiles').select('id').eq('email', email).maybeSingle();
  if (existing) return { id: existing.id, created: false };

  const created = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: opts.fullName } });
  if (created.error || !created.data.user) throw created.error ?? new Error('Could not create account');
  const { error } = await db.from('profiles').insert({
    id: created.data.user.id,
    email,
    full_name: opts.fullName,
    phone: opts.phone ?? null,
    organization_id: opts.organizationId ?? null,
    ...(opts.extra ?? {}),
  });
  if (error) {
    await db.auth.admin.deleteUser(created.data.user.id);
    throw error;
  }
  return { id: created.data.user.id, created: true };
}

export interface Viewer {
  id: string;
  email: string;
  full_name: string;
  role: 'member' | 'admin';
}

async function viewer(): Promise<Viewer | null> {
  const user = await currentUser();
  if (!user) return null;
  const { data } = await admin().from('profiles').select('id, email, full_name, role').eq('id', user.id).maybeSingle();
  return data as Viewer | null;
}

/** For pages: sends non-admins away. */
export async function requireAdminPage(): Promise<Viewer> {
  const v = await viewer();
  if (!v) redirect('/login?next=/admin');
  if (v.role !== 'admin') redirect('/member/services');
  return v;
}

/** For API routes: null if not an admin. */
export async function adminOrNull(): Promise<Viewer | null> {
  const v = await viewer();
  return v?.role === 'admin' ? v : null;
}

export interface HrContext {
  viewer: Viewer;
  org: { id: string; name: string; plan_product_id: string | null; stripe_customer_id: string | null; status: string };
}

async function hrContext(): Promise<HrContext | null> {
  const v = await viewer();
  if (!v) return null;
  const { data: link } = await admin()
    .from('organization_members')
    .select('organization_id, organizations(id, name, plan_product_id, stripe_customer_id, status)')
    .eq('profile_id', v.id)
    .eq('role', 'hr_admin')
    .limit(1)
    .maybeSingle();
  const org = link && (Array.isArray(link.organizations) ? link.organizations[0] : link.organizations);
  return org ? { viewer: v, org: org as HrContext['org'] } : null;
}

export async function requireHrPage(): Promise<HrContext> {
  const ctx = await hrContext();
  if (!ctx) {
    if (!(await currentUser())) redirect('/login?next=/hr');
    redirect('/member/services');
  }
  return ctx;
}

export const hrOrNull = hrContext;

/** Where someone lands after logging in. */
export async function homeFor(userId: string): Promise<string> {
  const db = admin();
  const { data: p } = await db.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (p?.role === 'admin') return '/admin';
  const { data: hr } = await db.from('organization_members').select('organization_id').eq('profile_id', userId).eq('role', 'hr_admin').limit(1);
  if (hr?.length) {
    const { count } = await db.from('entitlements').select('id', { count: 'exact', head: true }).eq('member_id', userId).neq('status', 'ended');
    if (!count) return '/hr';
  }
  return '/member/services';
}

export async function logActivity(adminViewer: Viewer, action: string, target?: string, details?: Record<string, unknown>) {
  await admin().from('admin_activity').insert({
    admin_id: adminViewer.id,
    admin_email: adminViewer.email,
    action,
    target: target ?? null,
    details: details ?? null,
  });
}

/** Gives someone admin access (creating a login if needed) and emails them a set-password link. */
export async function addAdmin(email: string, fullName: string): Promise<{ id: string; created: boolean }> {
  const { sendAdminInvite } = await import('@/lib/email');
  const acct = await ensureAccount({ email, fullName });
  await admin().from('profiles').update({ role: 'admin', updated_at: new Date().toISOString() }).eq('id', acct.id);
  const link = await setPasswordLink(email.trim().toLowerCase());
  await sendAdminInvite({ id: acct.id, email: email.trim().toLowerCase(), name: fullName }, link);
  return acct;
}
