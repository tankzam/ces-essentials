import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { serverClient } from '@/lib/supabase/server';

/** Links from our own emails (set your password, reset password). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const next = url.searchParams.get('next');
  const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/member/services';
  if (tokenHash && type) {
    const supabase = await serverClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(new URL(dest, url.origin));
  }
  return NextResponse.redirect(new URL('/forgot-password?expired=1', url.origin));
}
