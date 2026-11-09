import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';

/** Password-reset links land here; exchange the code for a session. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next');
  const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/member/services';
  if (code) {
    const supabase = await serverClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(dest, url.origin));
  }
  return NextResponse.redirect(new URL('/forgot-password', url.origin));
}
