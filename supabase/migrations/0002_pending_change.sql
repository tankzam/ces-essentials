-- A downgrade waits for the next billing date; remember what it changes to
-- so My Plan can show it.
alter table subscriptions add column pending_product_ids text[];
alter table subscriptions add column pending_change_at timestamptz;
