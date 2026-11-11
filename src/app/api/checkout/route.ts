import { NextResponse } from 'next/server';
import { z } from 'zod';
import { admin } from '@/lib/supabase/admin';
import { serverClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';
import { env, STRIPE_SOURCE } from '@/lib/env';
import { resolveSelection, SelectionError } from '@/lib/catalog';
import { clientIp } from '@/lib/request';
import { ageOn, identityColumns, identitySchema, profileComplete } from '@/lib/identity';
import { paymentProvider, shopifyCheckoutUrl, ShopifyNotReady } from '@/lib/shopify-billing';

export const runtime = 'nodejs';

const Body = z.object({
  selection: z.union([z.object({ plan: z.string() }), z.object({ addons: z.array(z.string()).max(10) })]),
  agreed: z.literal(true),
  policyVersion: z.number().int(),
  account: identitySchema({ adult: true })
    .extend({
      email: z.string().trim().toLowerCase().email().max(200),
      phone: z.string().trim().min(7).max(30),
      password: z.string().min(8).max(200),
    })
    .optional(),
});

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const agreed = parsed.error.issues.some((i) => i.path[0] === 'agreed');
    const detail = parsed.error.issues.find((i) => i.path[0] === 'account' && i.message && !i.message.startsWith('Invalid'));
    return fail(agreed ? 'Please check the box to agree to the refund policy.' : detail?.message ?? 'Please fill in every field.');
  }
  const { selection, account, policyVersion } = parsed.data;
  const db = admin();
  const supabase = await serverClient();

  // ── Who is buying: the signed-in member, or a new account created now.
  let { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    if (!account) return fail('Please enter your name, date of birth, address, email, phone, and a password.');
    const { data: exists } = await db.from('profiles').select('id').eq('email', account.email).maybeSingle();
    if (exists) return fail('This email already has an account. Log in first, then check out.', 409);

    const created = await db.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
      user_metadata: { full_name: `${account.firstName} ${account.lastName}` },
    });
    if (created.error || !created.data.user) {
      return fail(created.error?.message.includes('already') ? 'This email already has an account. Log in first, then check out.' : 'We could not create your account. Please try again.', 409);
    }
    const { error: profileError } = await db.from('profiles').insert({
      id: created.data.user.id,
      ...identityColumns(account),
      email: account.email,
      phone: account.phone,
    });
    if (profileError) {
      await db.auth.admin.deleteUser(created.data.user.id);
      return fail('We could not create your account. Please try again.', 500);
    }
    const signIn = await supabase.auth.signInWithPassword({ email: account.email, password: account.password });
    user = signIn.data.user;
    if (!user) return fail('Your account was created. Please log in to finish checking out.', 500);
  }

  const { data: profile } = await db.from('profiles').select('*').eq('id', user.id).single();
  if (!profile) return fail('Your account is missing details. Please contact support.', 500);
  if (!profileComplete(profile)) return fail('Please finish your profile first (name, date of birth, and address). Go to your member area, then come back to check out.', 409);
  if (ageOn(profile.date_of_birth) < 18) return fail('You must be 18 or older to buy a plan.', 403);

  // One plan per member. Existing members change items from My Plan.
  const { data: live } = await db
    .from('subscriptions')
    .select('id')
    .eq('member_id', profile.id)
    .in('status', ['active', 'trialing', 'past_due', 'unpaid', 'incomplete']);
  if (live && live.length) return fail('You already have a plan. Go to My Plan in your member area to change it.', 409);

  // ── Price comes from the products table only.
  let resolved;
  try {
    resolved = await resolveSelection(selection);
  } catch (e) {
    if (e instanceof SelectionError) return fail(e.message);
    throw e;
  }

  const { data: policy } = await db
    .from('policy_versions')
    .select('*')
    .eq('slug', 'refund_ack')
    .order('version', { ascending: false })
    .limit(1)
    .single();
  if (!policy || policy.version !== policyVersion) {
    return fail('Our refund policy wording was updated. Please reload the page and review it.', 409);
  }

  // ── Which processor takes the payment (Admin can switch it).
  const provider = await paymentProvider();
  if (provider === 'shopify') {
    try {
      shopifyCheckoutUrl({ orderId: 'check', products: resolved.products, email: profile.email });
    } catch (e) {
      if (e instanceof ShopifyNotReady) return fail('Checkout is being updated right now. Please try again in a little while.', 503);
      throw e;
    }
  }

  // ── Stripe customer, tagged for this site.
  let customerId = profile.stripe_customer_id as string | null;
  if (provider === 'stripe' && !customerId) {
    const customer = await stripe().customers.create({
      email: profile.email,
      name: profile.full_name,
      phone: profile.phone ?? undefined,
      metadata: { source: STRIPE_SOURCE, member_id: profile.id },
    });
    customerId = customer.id;
    await db.from('profiles').update({ stripe_customer_id: customerId }).eq('id', profile.id);
  }

  const items = resolved.products.map((p) => ({ product_id: p.id, price_cents: p.price_cents, stripe_price_id: p.stripe_price_id }));
  const { data: order, error: orderError } = await db
    .from('orders')
    .insert({
      member_id: profile.id,
      kind: 'new',
      product_ids: resolved.products.map((p) => p.id),
      items,
      expected_total_cents: resolved.totalCents,
      provider,
    })
    .select('id')
    .single();
  if (orderError) throw orderError;

  // Refund policy acceptance log (append-only).
  const { error: acceptError } = await db.from('policy_acceptances').insert({
    member_id: profile.id,
    order_id: order.id,
    policy_version_id: policy.id,
    wording_snapshot: policy.wording,
    version_snapshot: policy.version,
    ip: clientIp(req),
    user_agent: req.headers.get('user-agent'),
  });
  if (acceptError) throw acceptError;

  if (provider === 'shopify') {
    return NextResponse.json({ url: shopifyCheckoutUrl({ orderId: order.id, products: resolved.products, email: profile.email }) });
  }

  const metadata = { source: STRIPE_SOURCE, order_id: order.id, member_id: profile.id };
  const site = env.siteUrl();
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId!,
    client_reference_id: order.id,
    // Payment methods shown come from the Stripe dashboard settings (card).
    payment_method_configuration: process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION_ID || undefined,
    line_items: items.map((i) => ({ price: i.stripe_price_id!, quantity: 1 })),
    metadata,
    subscription_data: { metadata },
    success_url: `${site}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site}/checkout/canceled`,
  });

  await db.from('orders').update({ stripe_checkout_session_id: session.id }).eq('id', order.id);
  return NextResponse.json({ url: session.url });
}
