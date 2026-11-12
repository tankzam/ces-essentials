import { healthcareOnSale } from '@/lib/healthcare';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { hrOrNull } from '@/lib/accounts';
import { addPeople, keepPerson, orgSubscription, removePerson, resendWelcome } from '@/lib/hr';
import { admin } from '@/lib/supabase/admin';
import { stripe } from '@/lib/stripe';
import { env } from '@/lib/env';
import { syncSubscription } from '@/lib/fulfillment';
import { formatDate } from '@/lib/money';
import { shopifyAccountUrl } from '@/lib/shopify-billing';

export const runtime = 'nodejs';
export const maxDuration = 300;

const Person = z.object({ firstName: z.string().trim().max(80), lastName: z.string().trim().max(80), email: z.string().trim().max(200) });
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), people: z.array(Person).min(1).max(2000) }),
  z.object({ action: z.literal('remove'), profileId: z.string().uuid() }),
  z.object({ action: z.literal('keep'), profileId: z.string().uuid() }),
  z.object({ action: z.literal('resend'), profileId: z.string().uuid() }),
  z.object({ action: z.literal('plan'), plan: z.enum(['starter_company', 'all_in_one_company']) }),
  z.object({ action: z.literal('portal') }),
]);

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const ctx = await hrOrNull();
  if (!ctx) return fail('Please log in to your HR dashboard.', 401);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail('Something is missing. Please try again.');
  const b = parsed.data;
  const org = ctx.org;
  const db = admin();

  // Person-level actions only touch people in this company.
  if ('profileId' in b) {
    const { data: link } = await db
      .from('organization_members')
      .select('profile_id')
      .eq('organization_id', org.id)
      .eq('profile_id', b.profileId)
      .eq('role', 'employee')
      .maybeSingle();
    if (!link) return fail('That person is not on your team.', 404);
  }

  switch (b.action) {
    case 'add': {
      try {
        const results = await addPeople(org, b.people);
        const added = results.filter((r) => r.result === 'added' || r.result === 'readded').length;
        const problems = results.filter((r) => r.result === 'error');
        return NextResponse.json({
          ok: true,
          added,
          results,
          message: added
            ? `${added} ${added === 1 ? 'person' : 'people'} added. Welcome emails are on their way.`
            : problems[0]?.message ?? 'Nobody new to add.',
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : 'Could not add people.', 409);
      }
    }
    case 'remove': {
      const until = await removePerson(org.id, b.profileId);
      return NextResponse.json({ ok: true, message: `Removed. They keep access through ${formatDate(until)}, and your next bill adjusts.` });
    }
    case 'keep':
      await keepPerson(org.id, b.profileId);
      return NextResponse.json({ ok: true, message: 'They’ll stay on your plan.' });
    case 'resend':
      await resendWelcome(org, b.profileId);
      return NextResponse.json({ ok: true, message: 'Welcome email sent again.' });
    case 'portal': {
      if ((await orgSubscription(org.id))?.provider === 'shopify') return NextResponse.json({ url: shopifyAccountUrl() });
      if (!org.stripe_customer_id) return fail('No billing account yet.', 409);
      const session = await stripe().billingPortal.sessions.create({
        customer: org.stripe_customer_id,
        return_url: `${env.siteUrl()}/hr/billing`,
        configuration: env.stripePortalConfigId(),
      });
      return NextResponse.json({ url: session.url });
    }
    case 'plan': {
      const sub = await orgSubscription(org.id);
      if (!sub || sub.status !== 'active') return fail('Your plan can be changed once your payment is up to date.', 409);
      if (sub.provider === 'shopify') return fail('Your company plan is billed through CES Marketplace. Email us to switch plans and we will update it for you.', 409);
      if (org.plan_product_id === b.plan) return fail('That is already your plan.');
      if (b.plan === 'all_in_one_company' && !(await healthcareOnSale())) return fail('The All-in-One plan is not available right now. Please choose Starter.');
      const { data: next } = await db.from('products').select('*').eq('id', b.plan).single();
      const { data: current } = await db.from('products').select('*').eq('id', org.plan_product_id ?? '').maybeSingle();
      if (!next?.stripe_price_id) return fail('That plan is not available.', 409);
      const s = await stripe().subscriptions.retrieve(sub.stripe_subscription_id);
      const item = s.items.data[0];
      const upgrade = !current || next.price_cents > current.price_cents;
      try {
        await stripe().subscriptions.update(sub.stripe_subscription_id, {
          items: [{ id: item.id, price: next.stripe_price_id, quantity: item.quantity }],
          proration_behavior: upgrade ? 'always_invoice' : 'none',
          payment_behavior: upgrade ? 'error_if_incomplete' : undefined,
        });
      } catch (e) {
        if (e instanceof Stripe.errors.StripeCardError) return fail('The company card was declined. Update it in Billing and try again.', 402);
        throw e;
      }
      await db.from('orders').insert({
        member_id: ctx.viewer.id,
        organization_id: org.id,
        kind: 'change',
        product_ids: [next.id],
        items: [{ product_id: next.id, price_cents: next.price_cents, stripe_price_id: next.stripe_price_id, quantity: item.quantity }],
        quantity: item.quantity,
        expected_total_cents: next.price_cents * (item.quantity ?? 1),
        stripe_subscription_id: sub.stripe_subscription_id,
        status: 'paid',
        paid_at: new Date().toISOString(),
      });
      if (!upgrade && current) {
        // Downgrade: the team keeps the All-in-One services until the paid month ends.
        await db.from('subscriptions').update({ keep_product_ids: [current.id], keep_until: sub.current_period_end }).eq('id', sub.id);
      }
      await syncSubscription(sub.stripe_subscription_id);
      return NextResponse.json({
        ok: true,
        message: upgrade
          ? `Your team is on ${next.name.replace(' (Company)', '')} now. The difference for this month was charged to the company card.`
          : `Your team moves to ${next.name.replace(' (Company)', '')} on ${formatDate(sub.current_period_end)}. Everyone keeps their current services until then.`,
      });
    }
  }
}
