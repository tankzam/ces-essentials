-- Essential (and Essential for companies) now include CESgpt and Streamify Me. Applied 2026-11-13.
insert into product_services (product_id, service_id) values
  ('starter','cesgpt'),('starter','streamify'),('starter_company','cesgpt'),('starter_company','streamify')
on conflict do nothing;
