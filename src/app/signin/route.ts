import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/supabase/server';
import { homeFor } from '@/lib/accounts';

/** Where one-tap sign-in links land: send the person to their home area. */
export async function GET(req: Request) {
  const user = await currentUser();
  const dest = user ? await homeFor(user.id) : '/login';
  return NextResponse.redirect(new URL(dest, req.url));
}
