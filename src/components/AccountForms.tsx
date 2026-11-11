'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { changePassword, saveDetails, type AccountState } from '@/app/member/account/actions';
import { IdentityFields, type IdentityDefaults } from '@/components/IdentityFields';

const field = 'min-h-12 w-full rounded-lg border border-[#C8C7BF] bg-white px-3 text-base aria-[invalid=true]:border-2 aria-[invalid=true]:border-danger';
const label = 'flex flex-col gap-1.5 text-sm font-semibold';
const primary = 'min-h-12 rounded-[10px] bg-navy px-6 font-bold text-white disabled:opacity-60';

function Status({ state }: { state: AccountState }) {
  if (state?.error) return <p role="alert" className="font-semibold text-danger sm:col-span-2">{state.error}</p>;
  if (state?.message) return <p role="status" className="font-semibold text-ok sm:col-span-2">{state.message}</p>;
  return null;
}

/** Name, birth date, address, and phone. Also used for "finish your profile". */
export function DetailsForm({ defaults, phone, submitLabel = 'Save changes' }: { defaults: IdentityDefaults; phone: string; submitLabel?: string }) {
  const [state, action, saving] = useActionState(saveDetails, undefined);
  const errs = state?.fields ?? {};
  return (
    <form action={action} className="grid gap-[18px] sm:grid-cols-2">
      <IdentityFields defaults={defaults} errors={errs} />
      <label className={`${label} sm:col-span-2`}>
        Phone
        <input name="phone" type="tel" defaultValue={phone} autoComplete="tel" aria-invalid={!!errs.phone} className={field} />
        {errs.phone && <span role="alert" className="font-semibold text-danger">{errs.phone}</span>}
      </label>
      <Status state={state} />
      <div><button className={primary} disabled={saving}>{saving ? 'Saving…' : submitLabel}</button></div>
    </form>
  );
}

export function AccountForms({ defaults, phone, email, memberId }: { defaults: IdentityDefaults; phone: string; email: string; memberId: string }) {
  const [pw, pwAction, changing] = useActionState(changePassword, undefined);
  return (
    <>
      <section className="flex flex-col gap-1 rounded-2xl border border-line bg-white p-6 sm:p-7">
        <p className="text-sm font-semibold text-subtle">Your member ID</p>
        <p className="text-[28px] font-extrabold tracking-tight">{memberId}</p>
        <p className="text-[15px] text-muted">Give this number when you contact us. It never changes.</p>
      </section>

      <section className="flex flex-col gap-[18px] rounded-2xl border border-line bg-white p-6 sm:p-7">
        <h2 className="text-xl font-bold">Your details</h2>
        <DetailsForm defaults={defaults} phone={phone} />
        <label className={label}>
          Account email
          <input value={email} readOnly aria-readonly="true" className={`${field} bg-cream text-subtle`} />
          <span className="font-medium text-[#7A4E05]">
            This is the email you register every service with. To change it, <Link href="/contact" className="underline">contact support</Link>.
          </span>
        </label>
      </section>

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
