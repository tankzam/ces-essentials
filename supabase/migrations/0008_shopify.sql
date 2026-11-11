-- Shopify (CES Marketplace) checkout: each product's Shopify product, variant and monthly selling plan.
alter table products add column shopify_product_id text;
alter table products add column shopify_variant_id text;
alter table products add column shopify_selling_plan_id text;
