import type { IdentityDefaults } from '@/components/IdentityFields';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const identityDefaults = (p: any): IdentityDefaults => ({
  firstName: p?.first_name,
  lastName: p?.last_name,
  dateOfBirth: p?.date_of_birth,
  addressLine1: p?.address_line1,
  addressLine2: p?.address_line2,
  city: p?.city,
  state: p?.state,
  postalCode: p?.postal_code,
});
