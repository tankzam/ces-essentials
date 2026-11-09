'use server';

import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase/server';
import { homeFor, setPasswordLink } from '@/lib/accounts';
import { admin } from '@/lib/supabase/admin';
import { sendPasswordReset, sendSignInCode } from '@/lib/email';

export type FormState = { error?: string; message?: string } | undefined;

function safeNext(next: unknown): string | null {
  return typeof next === 'string' && /^\/(member|hr|admin)(\/|$)/.test(next) ? next : null;
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const supabase = await serverClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(form.get('email') ?? '').trim().toLowerCase(),
    password: String(form.get('password') ?? ''),
  });
  if (error) return { error: 'That email and password don’t match. Try again or reset your password.' };
  redirect(safeNext(form.get('next')) ?? (await homeFor(data.user.id)));
}

export async function logout() {
  const supabase = await serverClient();
  await supabase.auth.signOut();
  redirect('/');
}

/** One email per person per minute, whichever kind. */
const minuteBucket = () => new Date().toISOString().slice(0, 16);

async function profileFor(emailRaw: unknown) {
  const email = String(emailRaw ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { email, profile: null };
  const { data } = await admin().from('profiles').select('id, email').eq('email', email).maybeSingle();
  return { email, profile: data };
}

export async function requestReset(_: FormState, form: FormData): Promise<FormState> {
  const { profile } = await profileFor(form.get('email'));
  if (profile) {
    try {
      await sendPasswordReset(profile, await setPasswordLink(profile.email), minuteBucket());
    } catch (e) {
      console.error('password reset email failed', e);
    }
  }
  // Same answer whether or not the email exists.
  return { message: 'If that email has an account, we just sent a link to reset your password. Check your inbox (and spam folder).' };
}

export type CodeState = { error?: string; message?: string; email?: string; step?: 'email' | 'code' } | undefined;

/** Step 1: email a 6-digit sign-in code (and a one-tap link). */
export async function sendCode(_: CodeState, form: FormData): Promise<CodeState> {
  const { email, profile } = await profileFor(form.get('email'));
  if (!email) return { error: 'Enter your account email.', step: 'email' };
  if (profile) {
    try {
      const { data, error } = await admin().auth.admin.generateLink({ type: 'magiclink', email: profile.email });
      if (error || !data.properties?.email_otp) throw error ?? new Error('no code');
      const q = new URLSearchParams({ token_hash: data.properties.hashed_token, type: 'magiclink', next: '/signin' });
      const link = `${(process.env.NEXT_PUBLIC_SITE_URL || 'https://cesessentials.com').replace(/\/$/, '')}/auth/confirm?${q}`;
      await sendSignInCode(profile, data.properties.email_otp, link, minuteBucket());
    } catch (e) {
      console.error('sign-in code email failed', e);
    }
  }
  // Same answer whether or not the email exists.
  return { step: 'code', email, message: `If ${email} has an account, we just emailed a 6-digit code. It can take a minute to arrive.` };
}

/** Step 2: check the code and sign in. */
export async function verifyCode(_: CodeState, form: FormData): Promise<CodeState> {
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const token = String(form.get('code') ?? '').replace(/\D/g, '');
  if (token.length !== 6) return { step: 'code', email, error: 'Enter the 6-digit code from the email.' };
  const supabase = await serverClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error || !data.user) return { step: 'code', email, error: 'That code didn’t work. It may have expired or already been used. Ask for a new code.' };
  redirect(safeNext(form.get('next')) ?? (await homeFor(data.user.id)));
}

export async function setNewPassword(_: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get('password') ?? '');
  if (password.length < 8) return { error: 'Use at least 8 characters.' };
  const supabase = await serverClient();
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) return { error: 'That link has expired. Request a new one.' };
  redirect(await homeFor(data.user.id));
}
