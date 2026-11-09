import 'server-only';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const env = {
  supabaseUrl: () => required('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: () => required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: () => required('SUPABASE_SERVICE_ROLE_KEY'),
  stripeSecretKey: () => required('STRIPE_SECRET_KEY'),
  stripeWebhookSecret: () => required('STRIPE_WEBHOOK_SECRET'),
  stripePortalConfigId: () => process.env.STRIPE_PORTAL_CONFIGURATION_ID || undefined,
  resendApiKey: () => required('RESEND_API_KEY'),
  emailFrom: () => required('EMAIL_FROM'),
  siteUrl: () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://cesessentials.com').replace(/\/$/, ''),
  cronSecret: () => required('CRON_SECRET'),
};

/** Tag on every Stripe object CES Essentials creates. */
export const STRIPE_SOURCE = 'CES Essentials';

/** Failed payments keep access for this long before it pauses. */
export const GRACE_PERIOD_MS = 2 * 24 * 60 * 60 * 1000;
