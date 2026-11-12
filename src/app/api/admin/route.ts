import { syncProductNames } from '@/lib/product-names';
import { stopHealthcareOnStripe } from '@/lib/healthcare';
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { addAdmin, adminOrNull, ensureAccount, logActivity, setPasswordLink } from '@/lib/accounts';
import { admin } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { env } from '@/lib/env';
import { applyEntitlements, getMember, resyncMember, setupInfo } from '@/lib/fulfillment';
import { allProducts, planLabel, servicesFor } from '@/lib/catalog';
import { currentPlan } from '@/lib/plan';
import { sendAccountInvite, sendCompanySignupLink, sendServiceSetup, sendWelcome } from '@/lib/email';

export const runtime = 'nodejs';
export const maxDuration = 120;

const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('manual_activate'),
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    email: z.string().trim().toLowerCase().email(),
    phone: z.string().trim().max(30).optional(),
    productIds: z.array(z.string()).min(1).max(10),
  }),
  z.object({ action: z.literal('deactivate'), profileId: z.string().uuid() }),
  z.object({ action: z.literal('activate'), profileId: z.string().uuid() }),
  z.object({ action: z.literal('resend_emails'), profileId: z.string().uuid() }),
  z.object({ action: z.literal('set_provider'), provider: z.enum(['stripe', 'shopify']) }),
  z.object({ action: z.literal('refresh_shopify_plans') }),
  z.object({ action: z.literal('healthcare_stripe_off') }),
  z.object({ action: z.literal('sync_product_names') }),
  z.object({ action: z.literal('threshold'), value: z.number().int().min(0).max(100000) }),
  z.object({ action: z.literal('add_admin'), email: z.string().trim().toLowerCase().email(), fullName: z.string().trim().min(2).max(120) }),
  z.object({ action: z.literal('approve_request'), requestId: z.string().uuid() }),
  z.object({ action: z.literal('decline_request'), requestId: z.string().uuid() }),
]);

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const me = await adminOrNull();
  if (!me) return fail('Not allowed.', 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail('Something is missing. Please check the form.');
  const b = parsed.data;
  const db = admin();

  switch (b.action) {
    case 'manual_activate': {
      const products = (await allProducts()).filter((p) => b.productIds.includes(p.id) && p.kind !== 'company_package');
      if (products.length !== b.productIds.length) return fail('Pick a plan or items.');
      if (products.some((p) => p.kind === 'package') && products.length > 1) return fail('Pick one plan, or à la carte items, not both.');
      const acct = await ensureAccount({ email: b.email, fullName: `${b.firstName} ${b.lastName}`, phone: b.phone, extra: { first_name: b.firstName, last_name: b.lastName } });
      const member = await getMember(acct.id);
      if (!member) return fail('Could not create the account.', 500);
      await applyEntitlements(member, { subscriptionRowId: null, source: 'manual', organizationId: null }, servicesFor(products), 'active');
      const link = await setPasswordLink(member.email);
      await sendAccountInvite({ id: member.id, email: member.email, name: member.full_name }, link, { planName: planLabel(products) }, `manual:${Date.now()}`);
      await logActivity(me, `manually activated ${member.email} (${planLabel(products)})`, member.email, { products: b.productIds });
      return NextResponse.json({ ok: true, message: `${member.email} is active and got a welcome email.` });
    }

    case 'deactivate': {
      const member = await getMember(b.profileId);
      if (!member) return fail('Member not found.', 404);
      let stopped = false;
      const plan = await currentPlan(member.id);
      if (plan && plan.subscription.provider === 'stripe' && !plan.subscription.cancel_at_period_end && ['active', 'trialing', 'past_due'].includes(plan.subscription.status)) {
        await stripe().subscriptions.update(plan.subscription.stripe_subscription_id, { cancel_at_period_end: true });
        stopped = true;
      }
      await db.from('profiles').update({ access_disabled: true, disabled_at: new Date().toISOString(), disable_stopped_billing: stopped }).eq('id', member.id);
      await resyncMember(member.id);
      await logActivity(me, `deactivated ${member.email}${stopped ? ' (renewals stopped)' : ''}`, member.email);
      return NextResponse.json({ ok: true, message: `${member.email} is deactivated.${stopped ? ' Their plan won’t renew.' : ''}` });
    }

    case 'refresh_shopify_plans': {
      const { syncShopifySellingPlans } = await import('@/lib/shopify-billing');
      const plans = await syncShopifySellingPlans();
      const missing = Object.entries(plans).filter(([, v]) => !v.startsWith('monthly')).map(([k]) => k);
      await logActivity(me, 'refreshed Shopify subscription plans');
      return NextResponse.json({ ok: missing.length === 0, message: missing.length ? `Still missing a monthly plan: ${missing.join(', ')}` : 'All products have a monthly Shopify plan.' }, { status: missing.length ? 409 : 200 });
    }

    case 'set_provider': {
      if (b.provider === 'shopify') {
        const { data: notReady } = await db.from('products').select('id').eq('active', true).or('shopify_variant_id.is.null,shopify_selling_plan_id.is.null');
        if (notReady?.length) {
          return fail(`Shopify isn't ready yet: ${notReady.map((p) => p.id).join(', ')} need a monthly subscription plan in Shopify. Set them up, then click "Check Shopify plans".`, 409);
        }
      }
      await db.from('settings').update({ value: b.provider, updated_at: new Date().toISOString() }).eq('key', 'payment_provider');
      await logActivity(me, `switched checkout to ${b.provider === 'shopify' ? 'Shopify (CES Marketplace)' : 'Stripe'}`);
      return NextResponse.json({ ok: true, message: `New checkouts now go through ${b.provider === 'shopify' ? 'Shopify (CES Marketplace)' : 'Stripe'}. Existing members stay on what they signed up with.` });
    }

    case 'healthcare_stripe_off': {
      const { done, problems } = await stopHealthcareOnStripe();
      await logActivity(me, 'turned off Virtual Healthcare and All-in-One in Stripe', undefined, { done, problems });
      if (problems.length) return fail(`Stripe said: ${problems.join(' | ')}${done.length ? `. Archived OK: ${done.join(', ')}` : ''}`, 409);
      return NextResponse.json({ ok: true, message: `Archived in Stripe (product and price): ${done.join(', ')}. Stripe can no longer charge for them.` });
    }

    case 'sync_product_names': {
      const { updated, problems } = await syncProductNames();
      await logActivity(me, 'updated product names in Stripe and Shopify', undefined, { updated, problems });
      if (problems.length) return fail(`Some names did not update: ${problems.join(' | ')}${updated.length ? `. Updated: ${updated.join(', ')}` : ''}`, 409);
      return NextResponse.json({ ok: true, message: updated.length ? `Updated: ${updated.join(', ')}.` : 'Stripe and Shopify already match.' });
    }

    case 'resend_emails': {
      const member = await getMember(b.profileId);
      if (!member) return fail('Member not found.', 404);
      const stamp = `resend:${Date.now()}`;
      const plan = await currentPlan(member.id);
      if (plan) {
        const products = (await allProducts()).filter((p) => plan.items.some((i) => i.product_id === p.id));
        await sendWelcome({ id: member.id, email: member.email, name: member.full_name }, planLabel(products), stamp);
      }
      const { data: ents } = await db.from('entitlements').select('service_id').eq('member_id', member.id).in('status', ['active', 'grace']);
      for (const e of ents ?? []) {
        const info = await setupInfo(e.service_id, member.id, { assignCode: true });
        if (!info.waitingForCode) await sendServiceSetup(member, info, stamp);
      }
      await logActivity(me, `resent welcome and setup emails to ${member.email}`, member.email);
      return NextResponse.json({ ok: true, message: `Sent ${plan ? 'the welcome email and ' : ''}${ents?.length ?? 0} setup email${ents?.length === 1 ? '' : 's'} to ${member.email}.` });
    }

    case 'activate': {
      const { data: p } = await db.from('profiles').select('email, disable_stopped_billing').eq('id', b.profileId).single();
      if (!p) return fail('Member not found.', 404);
      const plan = await currentPlan(b.profileId);
      if (p.disable_stopped_billing && plan?.subscription.cancel_at_period_end) {
        await stripe().subscriptions.update(plan.subscription.stripe_subscription_id, { cancel_at_period_end: false });
      }
      await db.from('profiles').update({ access_disabled: false, disabled_at: null, disable_stopped_billing: false }).eq('id', b.profileId);
      await resyncMember(b.profileId);
      await logActivity(me, `activated ${p.email}`, p.email);
      return NextResponse.json({ ok: true, message: `${p.email} is active again.` });
    }

    case 'add_admin': {
      const r = await addAdmin(b.email, b.fullName);
      await logActivity(me, `made ${b.email} an admin`, b.email, { newAccount: r.created });
      return NextResponse.json({ ok: true, message: `${b.email} is an admin and got an email to set a password.` });
    }

    case 'threshold': {
      await db.from('settings').update({ value: String(b.value), updated_at: new Date().toISOString() }).eq('key', 'code_pool_alert_threshold');
      await logActivity(me, `set the low-code alert to ${b.value}`);
      return NextResponse.json({ ok: true, message: 'Saved.' });
    }

    case 'approve_request': {
      const { data: r } = await db.from('business_requests').select('*').eq('id', b.requestId).single();
      if (!r) return fail('Request not found.', 404);
      if (r.status !== 'pending') return fail('This request was already handled.', 409);
      const { data: org, error } = await db
        .from('organizations')
        .insert({ name: r.company, contact_email: r.email, status: 'pending' })
        .select('id')
        .single();
      if (error) throw error;
      const token = randomBytes(24).toString('base64url');
      await db
        .from('business_requests')
        .update({ status: 'approved', signup_token: token, organization_id: org.id, decided_by: me.id, decided_at: new Date().toISOString() })
        .eq('id', r.id);
      const url = `${env.siteUrl()}/company/signup/${token}`;
      await sendCompanySignupLink(r, url);
      await logActivity(me, `approved and sent a signup link to ${r.company}`, r.company);
      return NextResponse.json({ ok: true, message: `Signup link emailed to ${r.email}.`, url });
    }

    case 'decline_request': {
      const { data: r } = await db.from('business_requests').select('company, status').eq('id', b.requestId).single();
      if (!r) return fail('Request not found.', 404);
      await db.from('business_requests').update({ status: 'declined', decided_by: me.id, decided_at: new Date().toISOString() }).eq('id', b.requestId);
      await logActivity(me, `declined ${r.company}`, r.company);
      return NextResponse.json({ ok: true, message: 'Declined.' });
    }
  }
}
