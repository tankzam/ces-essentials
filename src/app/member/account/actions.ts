'use server';

import { revalidatePath } from 'next/cache';
import { admin } from '@/lib/supabase/admin';
import { currentUser, serverClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';

export type AccountState = { error?: string; message?: string } | undefined;

export async function saveDetails(_: AccountState, form: FormData): Promise<AccountState> {
  const user = await currentUser();
  if (!user) return { error: 'Please log in.' };
  const fullName = String(form.get('fullName') ?? '').trim();
  const phone = String(form.get('phone') ?? '').trim();
  if (fullName.length < 2) return { error: 'Please enter your full name.' };
  if (phone.length < 7) return { error: 'Please enter your phone number.' };

  const { data: profile, error } = await admin()
    .from('profiles')
    .update({ full_name: fullName, phone, updated_at: new Date().toISOString() })
    .eq('id', user.id)
    .select('stripe_customer_id')
    .single();
  if (error) return { error: 'Could not save. Please try again.' };
  if (profile.stripe_customer_id) {
    await stripe().customers.update(profile.stripe_customer_id, { name: fullName, phone });
  }
  revalidatePath('/member', 'layout');
  return { message: 'Saved.' };
}

export async function changePassword(_: AccountState, form: FormData): Promise<AccountState> {
  const password = String(form.get('password') ?? '');
  if (password.length < 8) return { error: 'Use at least 8 characters.' };
  if (password !== String(form.get('confirm') ?? '')) return { error: 'The two passwords don’t match.' };
  const supabase = await serverClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: 'Could not change your password. Please try again.' };
  return { message: 'Your password is changed.' };
}
