import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

/** Stripe customer portal, limited to updating the card on file (see scripts/setup-stripe.mjs). */
export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
  const { data: profile } = await admin().from('profiles').select('stripe_customer_id').eq('id', user.id).single();
  if (!profile?.stripe_customer_id) return NextResponse.json({ error: 'No billing account yet.' }, { status: 409 });
  const session = await stripe().billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${env.siteUrl()}/member/billing`,
    configuration: env.stripePortalConfigId(),
  });
  return NextResponse.json({ url: session.url });
}
