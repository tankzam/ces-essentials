import { NextResponse } from 'next/server';
import { admin } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Polled by the success page until the webhook has confirmed payment. */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ status: 'signed_out' }, { status: 401 });
  const sessionId = new URL(req.url).searchParams.get('session_id');
  if (!sessionId) return NextResponse.json({ status: 'unknown' }, { status: 400 });
  const { data } = await admin()
    .from('orders')
    .select('status')
    .eq('stripe_checkout_session_id', sessionId)
    .eq('member_id', user.id)
    .maybeSingle();
  return NextResponse.json({ status: data?.status ?? 'unknown' });
}
