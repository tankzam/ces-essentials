-- Yearly billing for Essential: $239.88/year ($19.99/month). Applied 2026-11-13.
alter table products add column billing_interval text not null default 'month' check (billing_interval in ('month', 'year'));
alter table products add column yearly_of text references products(id);

insert into products (id, name, kind, price_cents, active, public, sort_order, billing_interval, yearly_of)
values ('starter_yearly', 'Essential (Yearly)', 'package', 23988, true, true, 1, 'year', 'starter');
insert into product_services (product_id, service_id)
select 'starter_yearly', service_id from product_services where product_id = 'starter';

-- Early-cancel refunds on yearly plans (first 3 months), and renewal reminders.
alter table subscriptions add column early_cancel_at timestamptz;
alter table subscriptions add column early_cancel_refund_cents integer;
alter table subscriptions add column renewal_reminder_for timestamptz;

insert into policy_versions (slug, version, wording) values (
  'refund_ack_yearly', 1,
  'I understand this plan is paid yearly ($239.88) and renews every year until I cancel, with a reminder email 30 days before it renews. If I cancel within the first 3 months, I pay $25.99 for each month I used (a partial month counts as a full month) and get the rest back. After 3 months there are no refunds, and my access continues through the end of my paid year.'
);
