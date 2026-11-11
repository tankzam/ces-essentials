-- Shopify (CES Marketplace) checkout: each product's Shopify product, variant and monthly selling plan.
alter table products add column shopify_product_id text;
alter table products add column shopify_variant_id text;
alter table products add column shopify_selling_plan_id text;

-- Which processor bills each subscription/order; Shopify webhook log; the checkout switch.
alter table subscriptions add column provider text not null default 'stripe' check (provider in ('stripe', 'shopify'));
alter table orders add column shopify_order_id text;
alter table orders add column provider text not null default 'stripe';
create table shopify_events (
  id text primary key,
  topic text not null,
  shopify_order_id text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);
alter table shopify_events enable row level security;
insert into settings (key, value) values ('payment_provider', 'stripe') on conflict (key) do nothing;
