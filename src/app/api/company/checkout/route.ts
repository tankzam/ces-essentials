import { NextResponse } from 'next/server';
import { z } from 'zod';
import { admin } from '@/lib/supabase/admin';
import { serverClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';
import { env, STRIPE_SOURCE } from '@/lib/env';
import { clientIp } from '@/lib/request';
import { MIN_SEATS } from '@/lib/company';
import { paymentProvider, shopifyCheckoutUrl, ShopifyNotReady } from '@/lib/shopify-billing';

export const runtime = 'nodejs';


const Body = z.object({
  token: z.string().min(20).max(200),
  plan: z.enum(['starter_company', 'all_in_one_company']),
  seats: z.number().int().min(MIN_SEATS).max(5000),
  companyName: z.string().trim().min(2).max(200),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200).optional(),
  agreed: z.literal(true),
  policyVersion: z.number().int(),
});

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const agreed = parsed.error.issues.some((i) => i.path[0] === 'agreed');
    return fail(agreed ? 'Please check the box to agree to the refund policy.' : 'Please fill in every field (minimum 5 people).');
  }
  const b = parsed.data;
  const db = admin();

  const { data: request } = await db.from('business_requests').select('*').eq('signup_token', b.token).maybeSingle();
  if (!request || !request.organization_id) return fail('This signup link is not valid.', 404);
  if (request.status === 'signed_up') return fail('Your company plan is already set up. Log in to your HR dashboard.', 409);
  if (request.status !== 'approved') return fail('This signup link is not active.', 404);
  const orgId = request.organization_id as string;

  const { data: liveSub } = await db
    .from('subscriptions')
    .select('id')
    .eq('organization_id', orgId)
    .in('status', ['active', 'trialing', 'past_due', 'unpaid', 'incomplete']);
  if (liveSub?.length) return fail('Your company plan is already set up. Log in to your HR dashboard.', 409);

  // HR login: the signed-in person, or a new account created now.
  const supabase = await serverClient();
  let { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    if (!b.password) return fail('Please create a password (at least 8 characters).');
    const { data: exists } = await db.from('profiles').select('id').eq('email', b.email).maybeSingle();
    if (exists) return fail('This email already has an account. Log in first, then come back to this link.', 409);
    const created = await db.auth.admin.createUser({ email: b.email, password: b.password, email_confirm: true, user_metadata: { full_name: b.fullName } });
    if (created.error || !created.data.user) return fail('We could not create your login. Please try again.', 409);
    const { error: pErr } = await db.from('profiles').insert({ id: created.data.user.id, email: b.email, full_name: b.fullName });
    if (pErr) {
      await db.auth.admin.deleteUser(created.data.user.id);
      return fail('We could not create your login. Please try again.', 500);
    }
    user = (await supabase.auth.signInWithPassword({ email: b.email, password: b.password })).data.user;
    if (!user) return fail('Your login was created. Please log in and open this link again.', 500);
  }
  const { data: hr } = await db.from('profiles').select('id, email, full_name').eq('id', user.id).single();
  if (!hr) return fail('Your account is missing details. Please contact support.', 500);

  await db.from('organizations').update({ name: b.companyName, hr_profile_id: hr.id }).eq('id', orgId);
  await db.from('organization_members').upsert(
    { organization_id: orgId, profile_id: hr.id, role: 'hr_admin', status: 'active' },
    { onConflict: 'organization_id,profile_id' },
  );

  const { data: product } = await db.from('products').select('*').eq('id', b.plan).eq('kind', 'company_package').eq('active', true).single();
  if (!product?.stripe_price_id) return fail('Company plans are not available yet. Please contact us.', 503);

  const { data: policy } = await db
    .from('policy_versions')
    .select('*')
    .eq('slug', 'refund_ack_company')
    .order('version', { ascending: false })
    .limit(1)
    .single();
  if (!policy || policy.version !== b.policyVersion) return fail('Our refund policy wording was updated. Please reload the page.', 409);

  const provider = await paymentProvider();
  if (provider === 'shopify') {
    try {
      shopifyCheckoutUrl({ orderId: 'check', products: [product], quantity: MIN_SEATS, email: hr.email });
    } catch (e) {
      if (e instanceof ShopifyNotReady) return fail('Company checkout is being updated right now. Please try again in a little while.', 503);
      throw e;
    }
  }

  const { data: org } = await db.from('organizations').select('*').eq('id', orgId).single();
  let customerId = org?.stripe_customer_id as string | null;
  if (provider === 'stripe' && !customerId) {
    customerId = (
      await stripe().customers.create({
        name: b.companyName,
        email: hr.email,
        metadata: { source: STRIPE_SOURCE, organization_id: orgId },
      })
    ).id;
    await db.from('organizations').update({ stripe_customer_id: customerId, contact_email: hr.email }).eq('id', orgId);
  }

  const seats = Math.max(MIN_SEATS, b.seats);
  const { data: order, error: oErr } = await db
    .from('orders')
    .insert({
      member_id: hr.id,
      organization_id: orgId,
      kind: 'new',
      product_ids: [product.id],
      items: [{ product_id: product.id, price_cents: product.price_cents, stripe_price_id: product.stripe_price_id, quantity: seats }],
      quantity: seats,
      expected_total_cents: product.price_cents * seats,
      provider,
    })
    .select('id')
    .single();
  if (oErr) throw oErr;

  await db.from('policy_acceptances').insert({
    member_id: hr.id,
    order_id: order.id,
    policy_version_id: policy.id,
    wording_snapshot: policy.wording,
    version_snapshot: policy.version,
    ip: clientIp(req),
    user_agent: req.headers.get('user-agent'),
  });

  if (provider === 'shopify') {
    return NextResponse.json({ url: shopifyCheckoutUrl({ orderId: order.id, products: [product], quantity: seats, email: hr.email }) });
  }

  const metadata = { source: STRIPE_SOURCE, order_id: order.id, organization_id: orgId, member_id: hr.id };
  const site = env.siteUrl();
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId!,
    client_reference_id: order.id,
    payment_method_configuration: process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION_ID || undefined,
    line_items: [{ price: product.stripe_price_id, quantity: seats }],
    metadata,
    subscription_data: { metadata: { source: STRIPE_SOURCE, organization_id: orgId, order_id: order.id } },
    success_url: `${site}/checkout/success?session_id={CHECKOUT_SESSION_ID}&company=1`,
    cancel_url: `${site}/company/signup/${b.token}`,
  });
  await db.from('orders').update({ stripe_checkout_session_id: session.id }).eq('id', order.id);
  return NextResponse.json({ url: session.url });
}
