'use server';

import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase/server';

export type FormState = { error?: string; message?: string } | undefined;

function safeNext(next: unknown): string {
  return typeof next === 'string' && next.startsWith('/member') ? next : '/member/services';
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const supabase = await serverClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get('email') ?? '').trim().toLowerCase(),
    password: String(form.get('password') ?? ''),
  });
  if (error) return { error: 'That email and password don’t match. Try again or reset your password.' };
  redirect(safeNext(form.get('next')));
}

export async function logout() {
  const supabase = await serverClient();
  await supabase.auth.signOut();
  redirect('/');
}

export async function requestReset(_: FormState, form: FormData): Promise<FormState> {
  const supabase = await serverClient();
  const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://cesessentials.com').replace(/\/$/, '');
  await supabase.auth.resetPasswordForEmail(String(form.get('email') ?? '').trim().toLowerCase(), {
    redirectTo: `${site}/auth/callback?next=/reset-password`,
  });
  // Same answer whether or not the email exists.
  return { message: 'If that email has an account, we just sent a link to reset your password.' };
}

export async function setNewPassword(_: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get('password') ?? '');
  if (password.length < 8) return { error: 'Use at least 8 characters.' };
  const supabase = await serverClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: 'That reset link has expired. Request a new one.' };
  redirect('/member/services');
}
