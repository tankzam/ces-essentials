'use server';

import { revalidatePath } from 'next/cache';
import { admin } from '@/lib/supabase/admin';
import { currentUser, serverClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe';
import { fieldErrors, identityColumns, identitySchema } from '@/lib/identity';

export type AccountState = { error?: string; message?: string; fields?: Record<string, string> } | undefined;

export async function saveDetails(_: AccountState, form: FormData): Promise<AccountState> {
  const user = await currentUser();
  if (!user) return { error: 'Please log in.' };
  const get = (k: string) => String(form.get(k) ?? '');
  const checked = identitySchema({ adult: false }).safeParse({
    firstName: get('firstName'),
    lastName: get('lastName'),
    dateOfBirth: get('dateOfBirth'),
    addressLine1: get('addressLine1'),
    addressLine2: get('addressLine2'),
    city: get('city'),
    state: get('state'),
    postalCode: get('postalCode'),
  });
  const fields = checked.success ? {} : fieldErrors(checked.error);
  const phone = get('phone').trim();
  if (phone.replace(/\D/g, '').length < 7) fields.phone = 'Enter your phone number.';
  if (!checked.success || Object.keys(fields).length) return { error: 'Please fix the highlighted details.', fields };

  const id = checked.data;
  const { data: profile, error } = await admin()
    .from('profiles')
    .update({ ...identityColumns(id), phone, updated_at: new Date().toISOString() })
    .eq('id', user.id)
    .select('stripe_customer_id, full_name')
    .single();
  if (error) return { error: 'Could not save. Please try again.' };
  if (profile.stripe_customer_id) {
    await stripe()
      .customers.update(profile.stripe_customer_id, {
        name: profile.full_name,
        phone,
        address: { line1: id.addressLine1, line2: id.addressLine2 || undefined, city: id.city, state: id.state, postal_code: id.postalCode, country: 'US' },
      })
      .catch((e) => console.error('stripe customer update failed', e));
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
