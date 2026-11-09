'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { login, requestReset, setNewPassword, type FormState } from '@/app/(auth)/actions';

const field = 'min-h-12 w-full rounded-lg border border-[#C8C7BF] bg-white px-3 text-base';
const primary = 'min-h-[52px] rounded-[10px] bg-navy px-6 text-[17px] font-bold text-white disabled:opacity-60';

function Status({ state }: { state: FormState }) {
  if (state?.error) return <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 font-semibold text-[#7A1F15]">{state.error}</p>;
  if (state?.message) return <p role="status" className="rounded-lg bg-ok-soft px-4 py-3 font-semibold text-ok">{state.message}</p>;
  return null;
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-6 sm:p-8">
      <input type="hidden" name="next" value={next ?? ''} />
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Email<input name="email" type="email" autoComplete="email" required className={field} /></label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Password<input name="password" type="password" autoComplete="current-password" required className={field} /></label>
      <Status state={state} />
      <button className={primary} disabled={pending}>{pending ? 'Logging in…' : 'Log in'}</button>
      <div className="flex flex-wrap justify-between gap-2 text-[15px]">
        <Link href="/forgot-password" className="underline">Forgot password?</Link>
        <Link href="/#plans" className="underline">Not a member? See plans</Link>
      </div>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestReset, undefined);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-6 sm:p-8">
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Account email<input name="email" type="email" autoComplete="email" required className={field} /></label>
      <Status state={state} />
      <button className={primary} disabled={pending}>{pending ? 'Sending…' : 'Email me a reset link'}</button>
    </form>
  );
}

export function ResetForm() {
  const [state, action, pending] = useActionState(setNewPassword, undefined);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-6 sm:p-8">
      <label className="flex flex-col gap-1.5 text-sm font-semibold">New password (at least 8 characters)<input name="password" type="password" autoComplete="new-password" minLength={8} required className={field} /></label>
      <Status state={state} />
      <button className={primary} disabled={pending}>{pending ? 'Saving…' : 'Save new password'}</button>
    </form>
  );
}
