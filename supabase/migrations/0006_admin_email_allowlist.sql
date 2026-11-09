-- People on this list become admins automatically when their account is created.
insert into settings (key, value) values ('admin_emails', 'abryant@tbfremail.com,debhullces@proton.me')
  on conflict (key) do update set value = excluded.value, updated_at = now();

create function grant_listed_admin() returns trigger language plpgsql security definer set search_path = public as $$
declare v_list text;
begin
  select value into v_list from settings where key = 'admin_emails';
  if v_list is not null and lower(new.email) = any (string_to_array(replace(lower(v_list), ' ', ''), ',')) then
    new.role := 'admin';
  end if;
  return new;
end $$;
revoke all on function grant_listed_admin() from public, anon, authenticated;

create trigger profiles_grant_listed_admin
  before insert on profiles
  for each row execute function grant_listed_admin();
