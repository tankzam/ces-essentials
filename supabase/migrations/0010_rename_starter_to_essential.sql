-- Starter plan renamed to Essential (ids unchanged). Applied 2026-11-12.
update products set name = 'Essential' where id = 'starter';
update products set name = 'Essential (Company)' where id = 'starter_company';
