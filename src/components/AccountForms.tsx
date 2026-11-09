'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { changePassword, saveDetails, type AccountState } from '@/app/member/account/actions';

const field = 'min-h-[46px] w-full rounded-lg border border-[#C8C7BF] bg-white px-3 text-base';
const label = 'flex flex-col gap-1.5 text-sm font-semibold';
const primary = 'min-h-12 rounded-[10px] bg-navy px-6 font-bold text-white disabled:opacity-60';

function Status({ state }: { state: AccountState }) {
  if (state?.error) return <p role="alert" className="font-semibold text-danger sm:col-span-2">{state.error}</p>;
  if (state?.message) return <p role="status" className="font-semibold text-ok sm:col-span-2">{state.message}</p>;
  return null;
}

export function AccountForms({ fullName, phone, email }: { fullName: string; phone: string; email: string }) {
  const [details, saveAction, saving] = useActionState(saveDetails, undefined);
  const [pw, pwAction, changing] = useActionState(changePassword, undefined);
  return (
    <>
      <form action={saveAction} className="grid gap-[18px] rounded-2xl border border-line bg-white p-6 sm:grid-cols-2 sm:p-7">
        <label className={label}>Full name<input name="fullName" defaultValue={fullName} autoComplete="name" required className={field} /></label>
        <label className={label}>Phone<input name="phone" type="tel" defaultValue={phone} autoComplete="tel" required className={field} /></label>
        <label className={`${label} sm:col-span-2`}>
          Account email
          <input value={email} readOnly aria-readonly="true" className={`${field} bg-cream text-subtle`} />
          <span className="font-medium text-[#7A4E05]">
            This is the email you register every service with. To change it, <Link href="/contact" className="underline">contact support</Link>.
          </span>
        </label>
        <Status state={details} />
        <div><button className={primary} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
      </form>

      <form action={pwAction} className="grid gap-[18px] rounded-2xl border border-line bg-white p-6 sm:grid-cols-2 sm:p-7">
        <h2 className="text-xl font-bold sm:col-span-2">Change password</h2>
        <label className={label}>New password<input name="password" type="password" autoComplete="new-password" minLength={8} required className={field} /></label>
        <label className={label}>Confirm new password<input name="confirm" type="password" autoComplete="new-password" minLength={8} required className={field} /></label>
        <Status state={pw} />
        <div><button className={primary} disabled={changing}>{changing ? 'Saving…' : 'Change password'}</button></div>
      </form>
    </>
  );
}
