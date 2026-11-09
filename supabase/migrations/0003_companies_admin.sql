-- Company plans, HR dashboard, admin area, business requests.

-- Requests from the For Businesses form. Approving creates the organization
-- and a private signup token.
create table business_requests (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  contact_name text not null,
  email text not null,
  phone text not null,
  people_range text not null,
  interest text not null,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'signed_up')),
  signup_token text unique,
  organization_id uuid references organizations(id),
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

alter table organizations add column plan_product_id text references products(id);
alter table organizations add column hr_profile_id uuid references profiles(id);

alter table organization_members add column status text not null default 'active'
  check (status in ('active', 'removing', 'removed'));
alter table organization_members add column remove_at timestamptz;
alter table organization_members add column removed_at timestamptz;
alter table organization_members add column welcome_sent_at timestamptz;

-- Admin can switch a member's access off without deleting records.
alter table profiles add column access_disabled boolean not null default false;
alter table profiles add column disabled_at timestamptz;

-- Where an entitlement comes from.
alter table entitlements add column source text not null default 'subscription'
  check (source in ('subscription', 'organization', 'manual'));
alter table entitlements add column organization_id uuid references organizations(id);

alter table orders add column organization_id uuid references organizations(id);
alter table orders add column quantity int not null default 1;
alter table subscription_items add column quantity int not null default 1;

-- Company downgrades: old plan's services stay on until the paid month ends.
alter table subscriptions add column keep_product_ids text[];
alter table subscriptions add column keep_until timestamptz;

create table admin_activity (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references profiles(id),
  admin_email text not null,
  action text not null,
  target text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index admin_activity_created_idx on admin_activity (created_at desc);

alter table business_requests enable row level security;
alter table admin_activity enable row level security;

-- Company plans are now sold (through private links only, never public).
update products set active = true where kind = 'company_package';

insert into policy_versions (slug, version, wording) values
  ('refund_ack_company', 1, 'I understand there are no refunds once a billing month has started, and the company can cancel anytime to stop future charges.');

update settings set value = '20' where key = 'code_pool_alert_threshold';
insert into settings (key, value) values ('business_request_alert_email', 'abryant@tbfremail.com');

alter table invoices add column organization_id uuid references organizations(id);
alter table invoices add column quantity int;
create index invoices_org_idx on invoices (organization_id);
