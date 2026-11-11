-- Every member: permanent member ID, first/last name, date of birth, address.
-- Applied 2026-11-11.
create sequence if not exists member_number_seq start 100001;
alter table profiles add column member_number bigint;
alter table profiles add column first_name text;
alter table profiles add column last_name text;
alter table profiles add column date_of_birth date;
alter table profiles add column address_line1 text;
alter table profiles add column address_line2 text;
alter table profiles add column city text;
alter table profiles add column state text;
alter table profiles add column postal_code text;

update profiles p set member_number = s.n from (
  select id, 100000 + row_number() over (order by created_at, id) as n from profiles
) s where p.id = s.id;
select setval('member_number_seq', greatest((select max(member_number) from profiles), 100000));
alter table profiles alter column member_number set default nextval('member_number_seq');
alter table profiles alter column member_number set not null;
alter table profiles add constraint profiles_member_number_key unique (member_number);
alter sequence member_number_seq owned by profiles.member_number;

update profiles set
  first_name = coalesce(first_name, split_part(trim(full_name), ' ', 1)),
  last_name = coalesce(last_name, nullif(trim(substr(trim(full_name), length(split_part(trim(full_name), ' ', 1)) + 1)), ''))
where full_name is not null;

create or replace function sync_profile_names() returns trigger language plpgsql set search_path = public as $$
begin
  if new.first_name is not null and (tg_op = 'INSERT' or new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name) then
    new.full_name := trim(new.first_name || ' ' || coalesce(new.last_name, ''));
  elsif new.full_name is not null and (tg_op = 'INSERT' or new.full_name is distinct from old.full_name) then
    new.first_name := split_part(trim(new.full_name), ' ', 1);
    new.last_name := nullif(trim(substr(trim(new.full_name), length(split_part(trim(new.full_name), ' ', 1)) + 1)), '');
  end if;
  return new;
end $$;
create trigger profiles_sync_names before insert or update on profiles for each row execute function sync_profile_names();

create or replace function keep_member_number() returns trigger language plpgsql set search_path = public as $$
begin
  if new.member_number is distinct from old.member_number then
    raise exception 'member IDs never change';
  end if;
  return new;
end $$;
create trigger profiles_keep_member_number before update on profiles for each row execute function keep_member_number();
