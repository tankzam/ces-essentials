-- CES Essentials — phase 1 schema.
-- All writes happen on the server with the service role (webhooks, server
-- actions). Members can read only their own rows. Tables for later phases
-- (organizations, admin) exist now so phase 2 needs no restructuring.

create extension if not exists pgcrypto;

-- ───────────────────────── Later-phase placeholders ─────────────────────────
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_email text,
  stripe_customer_id text unique,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

-- ───────────────────────────── Members ─────────────────────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  email text not null unique,          -- locked: changed only by support
  stripe_customer_id text unique,
  role text not null default 'member' check (role in ('member', 'admin')),
  organization_id uuid references organizations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'employee' check (role in ('hr_admin', 'employee')),
  created_at timestamptz not null default now(),
  primary key (organization_id, profile_id)
);

-- ───────────────────────────── Catalog ─────────────────────────────
-- Partner names live only here and in services.member_*; public pages never
-- read these columns.
create table providers (
  id text primary key,
  name text not null,
  website_url text,
  app_store_url text,
  play_store_url text,
  support_email text
);

create table services (
  id text primary key,                 -- healthcare, legal_tax, credit_vpn, discount_club, cesgpt, streamify
  name text not null,
  public_description text not null,    -- generic wording, safe for public pages
  member_description text not null,    -- may name the partner (member area only)
  setup_steps jsonb not null default '[]'::jsonb,
  provider_id text references providers(id),
  code_type text not null default 'none' check (code_type in ('none', 'pooled', 'shared_setting')),
  code_setting_key text,               -- for shared_setting codes
  open_url_setting_key text,           -- for CESgpt / Streamify "Open" buttons
  activation_delay_hours int not null default 0,
  sort_order int not null default 0
);

create table products (
  id text primary key,                 -- starter, all_in_one, healthcare, legal_tax, ...
  name text not null,
  kind text not null check (kind in ('package', 'addon', 'company_package')),
  price_cents int not null check (price_cents >= 0),
  currency text not null default 'usd',
  stripe_product_id text unique,
  stripe_price_id text unique,
  active boolean not null default true,
  public boolean not null default true,  -- company plans are never public
  badge text,
  sort_order int not null default 0
);

create table product_services (
  product_id text not null references products(id) on delete cascade,
  service_id text not null references services(id),
  primary key (product_id, service_id)
);

-- ───────────────────────── Orders and billing ─────────────────────────
create table orders (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references profiles(id),
  kind text not null default 'new' check (kind in ('new', 'change')),
  product_ids text[] not null,
  items jsonb not null,                -- snapshot: [{product_id, price_cents, stripe_price_id}]
  expected_total_cents int not null,
  currency text not null default 'usd',
  stripe_checkout_session_id text unique,
  stripe_subscription_id text,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'amount_mismatch', 'expired', 'failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index orders_member_idx on orders (member_id);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references profiles(id),
  organization_id uuid references organizations(id),
  stripe_subscription_id text not null unique,
  stripe_schedule_id text,             -- pending downgrade, if any
  status text not null,                -- mirrors Stripe
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  ended_at timestamptz,
  past_due_since timestamptz,          -- drives the 2-day grace period
  access_paused_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_member_idx on subscriptions (member_id);

create table subscription_items (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  product_id text not null references products(id),
  stripe_subscription_item_id text not null unique,
  unit_amount_cents int not null,
  price_verified boolean not null default false  -- Stripe price matched products.price_cents
);

create table invoices (
  stripe_invoice_id text primary key,
  member_id uuid references profiles(id),
  subscription_id uuid references subscriptions(id),
  amount_due_cents int not null default 0,
  amount_paid_cents int not null default 0,
  currency text not null default 'usd',
  status text not null,
  description text,
  hosted_invoice_url text,
  invoice_pdf_url text,
  period_start timestamptz,
  period_end timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index invoices_member_idx on invoices (member_id);

-- The only table access checks read.
create table entitlements (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references profiles(id) on delete cascade,
  service_id text not null references services(id),
  subscription_id uuid references subscriptions(id),
  status text not null check (status in ('active', 'grace', 'paused', 'ended')),
  starts_at timestamptz not null default now(),
  available_at timestamptz not null default now(),  -- legal/tax: +24h
  ends_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (member_id, service_id)
);

create table stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

-- ───────────────────────── Refund policy log ─────────────────────────
create table policy_versions (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  version int not null,
  wording text not null,
  active_from timestamptz not null default now(),
  unique (slug, version)
);

create table policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references profiles(id),
  order_id uuid not null references orders(id),
  policy_version_id uuid not null references policy_versions(id),
  wording_snapshot text not null,
  version_snapshot int not null,
  ip text,
  user_agent text,
  accepted_at timestamptz not null default now()
);

-- Append-only: no updates or deletes, even with the service role.
create function forbid_change() returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'policy_acceptances is append-only';
end $$;
create trigger policy_acceptances_append_only
  before update or delete on policy_acceptances
  for each row execute function forbid_change();

-- ───────────────────────────── Fulfillment ─────────────────────────────
create table activation_codes (
  id uuid primary key default gen_random_uuid(),
  service_id text not null default 'credit_vpn' references services(id),
  code text not null unique,
  batch text,
  assigned_to uuid references profiles(id),   -- never cleared
  assigned_at timestamptz,
  imported_at timestamptz not null default now()
);
create index activation_codes_unassigned_idx on activation_codes (service_id, imported_at) where assigned_to is null;
create unique index activation_codes_one_per_member on activation_codes (service_id, assigned_to) where assigned_to is not null;

-- A code, once assigned, can never be reassigned or released.
create function guard_code_assignment() returns trigger language plpgsql set search_path = public as $$
begin
  if old.assigned_to is not null and new.assigned_to is distinct from old.assigned_to then
    raise exception 'activation codes are never reassigned';
  end if;
  return new;
end $$;
create trigger activation_codes_never_reassign
  before update on activation_codes
  for each row execute function guard_code_assignment();

-- Returns the member's code, assigning the next unused one if they have none.
-- A returning member gets their own code back. Null = pool empty.
create function assign_activation_code(p_member uuid, p_service text default 'credit_vpn')
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  select code into v_code from activation_codes
    where service_id = p_service and assigned_to = p_member;
  if v_code is not null then return v_code; end if;

  update activation_codes set assigned_to = p_member, assigned_at = now()
    where id = (
      select id from activation_codes
      where service_id = p_service and assigned_to is null
      order by imported_at, id
      limit 1
      for update skip locked
    )
    returning code into v_code;
  return v_code;
end $$;
revoke all on function assign_activation_code(uuid, text) from public, anon, authenticated;

create table settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

create table email_log (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references profiles(id),
  template text not null,
  to_email text not null,
  idempotency_key text not null unique,
  provider_message_id text,
  sent_at timestamptz not null default now()
);

-- ───────────────────────────── RLS ─────────────────────────────
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table profiles enable row level security;
alter table providers enable row level security;
alter table services enable row level security;
alter table products enable row level security;
alter table product_services enable row level security;
alter table orders enable row level security;
alter table subscriptions enable row level security;
alter table subscription_items enable row level security;
alter table invoices enable row level security;
alter table entitlements enable row level security;
alter table stripe_events enable row level security;
alter table policy_versions enable row level security;
alter table policy_acceptances enable row level security;
alter table activation_codes enable row level security;
alter table settings enable row level security;
alter table email_log enable row level security;

-- Public catalog (prices and generic descriptions only are shown publicly).
create policy "read public products" on products for select using (active and public);
create policy "read product services" on product_services for select using (true);

-- Members read their own rows.
create policy "own profile" on profiles for select using (auth.uid() = id);
create policy "own subscriptions" on subscriptions for select using (auth.uid() = member_id);
create policy "own entitlements" on entitlements for select using (auth.uid() = member_id);
create policy "own invoices" on invoices for select using (auth.uid() = member_id);
-- Everything else: no policy = no access for anon/authenticated.

-- ───────────────────────────── Seed data ─────────────────────────────
insert into providers (id, name, website_url, app_store_url, play_store_url, support_email) values
  ('misalud', 'MiSalud', null,
   'https://apps.apple.com/us/app/misalud-health/id1601700024',
   'https://play.google.com/store/apps/details?id=io.ionic.misalud', null),
  ('legalclub', 'Legal Club', 'https://legalclub.com/members.aspx', null, null, null),
  ('identityiq', 'IdentityIQ + Bitdefender', null, null, null, null),
  ('workingadvantage', 'Working Advantage', 'https://www.workingadvantage.com', null, null, 'customerservice@workingadvantage.com');

insert into services (id, name, public_description, member_description, setup_steps, provider_id, code_type, code_setting_key, open_url_setting_key, activation_delay_hours, sort_order) values
  ('healthcare', 'Virtual Healthcare',
   'Unlimited $0-copay doctor and mental health visits from a licensed telehealth provider, for you plus up to 3 more people.',
   'Unlimited $0-copay doctor and mental health visits through MiSalud, for you plus up to 3 more people.',
   '["Download the MiSalud app from the App Store or Google Play.", "Create your account using your account email.", "Enter your group code when asked."]',
   'misalud', 'shared_setting', 'healthcare_group_code', null, 0, 1),
  ('legal_tax', 'Family Legal + Tax Prep',
   'A family legal plan plus tax preparation and advice.',
   'Legal help for your family plus tax preparation and advice through Legal Club. Your account takes 24 to 48 hours to become active.',
   '["Wait 24 to 48 hours after payment for your account to become active.", "Go to the Legal Club member site.", "Register with your account email. If it is not recognized yet, try again after 48 hours."]',
   'legalclub', 'none', null, null, 24, 2),
  ('credit_vpn', 'Credit Monitoring + VPN',
   'Credit monitoring with identity theft protection, plus a VPN. One code covers both.',
   'Credit monitoring from IdentityIQ plus a Bitdefender VPN. One activation code covers both.',
   '["Copy your activation code below.", "Open the provider site and choose to activate.", "Register with your account email and enter your code."]',
   'identityiq', 'pooled', null, 'credit_vpn_url', 0, 3),
  ('cesgpt', 'CESgpt',
   'Your AI assistant for questions, writing, and research.',
   'Your AI assistant for questions, writing, and research.',
   '["Click Open CESgpt.", "Sign up with your account email."]',
   null, 'none', null, 'cesgpt_url', 0, 4),
  ('streamify', 'Streamify Me',
   'Find where any show or movie is streaming, and the best deals.',
   'Find where any show or movie is streaming, and the best deals.',
   '["Click Open Streamify Me.", "Sign up with your account email."]',
   null, 'none', null, 'streamify_url', 0, 5),
  ('discount_club', 'Discount Club',
   'Member discounts on electronics, travel, movie tickets, theme parks, and more. Free with any purchase.',
   'Discounts through Working Advantage on electronics, travel, movie tickets, theme parks, and more.',
   '["Go to WorkingAdvantage.com.", "Click Become a Member.", "Enter your company code.", "Register with your account email."]',
   'workingadvantage', 'shared_setting', 'discount_club_company_code', null, 0, 6);

insert into products (id, name, kind, price_cents, public, badge, sort_order) values
  ('starter',            'Starter',                 'package',          2599, true,  null,         1),
  ('all_in_one',         'All-in-One',              'package',          5999, true,  'Best Value', 2),
  ('healthcare',         'Virtual Healthcare',      'addon',            2599, true,  null,         3),
  ('legal_tax',          'Family Legal + Tax Prep', 'addon',            2299, true,  null,         4),
  ('credit_vpn',         'Credit Monitoring + VPN', 'addon',            1299, true,  null,         5),
  ('cesgpt',             'CESgpt',                  'addon',             999, true,  null,         6),
  ('streamify',          'Streamify Me',            'addon',             499, true,  null,         7),
  -- Company plans (later phase): never public, off until then.
  ('starter_company',    'Starter (Company)',       'company_package',  1599, false, null,         8),
  ('all_in_one_company', 'All-in-One (Company)',    'company_package',  3999, false, null,         9);
update products set active = false where kind = 'company_package';

-- Discount Club is granted with every purchase; it is listed on packages so
-- the package cards can show it, and added in code for à la carte orders.
insert into product_services (product_id, service_id) values
  ('starter', 'legal_tax'), ('starter', 'credit_vpn'), ('starter', 'discount_club'),
  ('all_in_one', 'healthcare'), ('all_in_one', 'legal_tax'), ('all_in_one', 'credit_vpn'),
  ('all_in_one', 'cesgpt'), ('all_in_one', 'streamify'), ('all_in_one', 'discount_club'),
  ('healthcare', 'healthcare'), ('legal_tax', 'legal_tax'), ('credit_vpn', 'credit_vpn'),
  ('cesgpt', 'cesgpt'), ('streamify', 'streamify'),
  ('starter_company', 'legal_tax'), ('starter_company', 'credit_vpn'), ('starter_company', 'discount_club'),
  ('all_in_one_company', 'healthcare'), ('all_in_one_company', 'legal_tax'), ('all_in_one_company', 'credit_vpn'),
  ('all_in_one_company', 'cesgpt'), ('all_in_one_company', 'streamify'), ('all_in_one_company', 'discount_club');

insert into policy_versions (slug, version, wording) values
  ('refund_ack', 1, 'I understand there are no refunds once a billing month has started, and I can cancel anytime to stop future charges.');

insert into settings (key, value) values
  ('healthcare_group_code', ''),
  ('discount_club_company_code', ''),
  ('cesgpt_url', ''),
  ('streamify_url', ''),
  ('credit_vpn_url', ''),
  ('code_pool_alert_email', 'abryant@tbfremail.com'),
  ('code_pool_alert_threshold', '25');
