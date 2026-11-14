'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { login, requestReset, sendCode, setNewPassword, verifyCode, type CodeState, type FormState } from '@/app/(auth)/actions';

const field = 'min-h-12 w-full rounded-lg border border-[#C8C7BF] bg-white px-3 text-base';
const primary = 'min-h-[52px] rounded-[10px] bg-navy px-6 text-[17px] font-bold text-white disabled:opacity-60';

function Status({ state }: { state: FormState }) {
  if (state?.error) return <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 font-semibold text-[#7A1F15]">{state.error}</p>;
  if (state?.message) return <p role="status" className="rounded-lg bg-ok-soft px-4 py-3 font-semibold text-ok">{state.message}</p>;
  return null;
}

export function LoginForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<'password' | 'code'>('password');
  const tab = (on: boolean) => `flex-1 min-h-12 rounded-[10px] font-bold ${on ? 'bg-navy text-white' : 'text-navy'}`;
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-6 sm:p-8">
      <div role="tablist" aria-label="How to sign in" className="flex gap-1.5 rounded-xl bg-cream p-1.5">
        <button type="button" role="tab" aria-selected={mode === 'password'} onClick={() => setMode('password')} className={tab(mode === 'password')}>Password</button>
        <button type="button" role="tab" aria-selected={mode === 'code'} onClick={() => setMode('code')} className={tab(mode === 'code')}>Email me a code</button>
      </div>
      {mode === 'password' ? <PasswordLogin next={next} /> : <CodeLogin next={next} />}
      <div className="flex flex-wrap justify-between gap-2 text-[15px]">
        <Link href="/forgot-password" className="inline-flex min-h-11 items-center underline">Forgot password?</Link>
        <Link href="/" className="inline-flex min-h-11 items-center underline">Not a member yet? Visit our home page</Link>
      </div>
    </div>
  );
}

function PasswordLogin({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ''} />
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Email<input name="email" type="email" autoComplete="email" required className={field} /></label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Password<input name="password" type="password" autoComplete="current-password" required className={field} /></label>
      <Status state={state} />
      <button className={primary} disabled={pending}>{pending ? 'Logging in…' : 'Log in'}</button>
    </form>
  );
}

function CodeLogin({ next }: { next?: string }) {
  const [sent, sendAction, sending] = useActionState<CodeState, FormData>(sendCode, undefined);
  const [checked, verifyAction, verifying] = useActionState<CodeState, FormData>(verifyCode, undefined);
  const step = checked?.step ?? sent?.step ?? 'email';
  const email = checked?.email ?? sent?.email ?? '';

  if (step === 'email') {
    return (
      <form action={sendAction} className="flex flex-col gap-4">
        <p className="text-[15px] text-muted">No password needed. We&apos;ll email you a sign-in code.</p>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Account email<input name="email" type="email" autoComplete="email" required className={field} /></label>
        <Status state={sent} />
        <button className={primary} disabled={sending}>{sending ? 'Sending…' : 'Email me a code'}</button>
      </form>
    );
  }
  return (
    <form action={verifyAction} className="flex flex-col gap-4">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next ?? ''} />
      {!checked && sent?.message && <p role="status" className="rounded-lg bg-ok-soft px-4 py-3 font-semibold text-ok">{sent.message}</p>}
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Sign-in code from the email
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={12}
          required
          autoFocus
          className={`${field} text-center text-2xl font-extrabold tracking-[0.2em]`}
        />
      </label>
      <Status state={checked} />
      <button className={primary} disabled={verifying}>{verifying ? 'Checking…' : 'Sign in'}</button>
      <p className="text-[15px] text-muted">
        Didn&apos;t get it? Check spam, or{' '}
        <button type="submit" formAction={sendAction} formNoValidate className="inline-flex min-h-11 items-center font-semibold text-navy underline">send a new code</button> (one per minute).
      </p>
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
