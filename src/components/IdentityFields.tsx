'use client';

import { US_STATES } from '@/lib/identity';

export interface IdentityDefaults {
  firstName?: string | null;
  lastName?: string | null;
  dateOfBirth?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}

const field =
  'min-h-12 w-full rounded-lg border border-[#C8C7BF] bg-white px-3 text-base aria-[invalid=true]:border-2 aria-[invalid=true]:border-danger';
const label = 'flex flex-col gap-1.5 text-sm font-semibold';

/** Name, date of birth, and address boxes. Values are read by input name. */
export function IdentityFields({
  defaults = {},
  errors = {},
  onEdit,
}: {
  defaults?: IdentityDefaults;
  errors?: Record<string, string>;
  onEdit?: (name: string) => void;
}) {
  const err = (n: string) => errors[n] && <span role="alert" className="font-semibold text-danger">{errors[n]}</span>;
  const common = (n: string) => ({ name: n, 'aria-invalid': !!errors[n], onInput: () => onEdit?.(n), className: field });
  return (
    <>
      <label className={label}>
        First name
        <input {...common('firstName')} autoComplete="given-name" defaultValue={defaults.firstName ?? ''} />
        {err('firstName')}
      </label>
      <label className={label}>
        Last name
        <input {...common('lastName')} autoComplete="family-name" defaultValue={defaults.lastName ?? ''} />
        {err('lastName')}
      </label>
      <label className={`${label} sm:col-span-2`}>
        Date of birth
        <input {...common('dateOfBirth')} type="date" autoComplete="bday" max={new Date().toISOString().slice(0, 10)} defaultValue={defaults.dateOfBirth ?? ''} />
        {err('dateOfBirth')}
      </label>
      <label className={`${label} sm:col-span-2`}>
        Street address
        <input {...common('addressLine1')} autoComplete="address-line1" defaultValue={defaults.addressLine1 ?? ''} />
        {err('addressLine1')}
      </label>
      <label className={`${label} sm:col-span-2`}>
        Apartment, suite, etc. (optional)
        <input {...common('addressLine2')} autoComplete="address-line2" defaultValue={defaults.addressLine2 ?? ''} />
      </label>
      <label className={label}>
        City
        <input {...common('city')} autoComplete="address-level2" defaultValue={defaults.city ?? ''} />
        {err('city')}
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className={label}>
          State
          <select {...common('state')} autoComplete="address-level1" defaultValue={defaults.state ?? ''}>
            <option value="">Choose</option>
            {US_STATES.map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
          {err('state')}
        </label>
        <label className={label}>
          ZIP code
          <input {...common('postalCode')} inputMode="numeric" autoComplete="postal-code" maxLength={10} defaultValue={defaults.postalCode ?? ''} />
          {err('postalCode')}
        </label>
      </div>
    </>
  );
}

/** Reads the identity boxes inside a container. */
export function readIdentity(box: HTMLElement | null) {
  const v = (n: string) => (box?.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${n}"]`)?.value ?? '').trim();
  return {
    firstName: v('firstName'),
    lastName: v('lastName'),
    dateOfBirth: v('dateOfBirth'),
    addressLine1: v('addressLine1'),
    addressLine2: v('addressLine2'),
    city: v('city'),
    state: v('state'),
    postalCode: v('postalCode'),
  };
}
