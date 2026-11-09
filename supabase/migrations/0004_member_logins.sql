-- Last login per person (auth.users is not exposed to the API). Service role only.
create function org_member_logins(p_org uuid)
returns table (profile_id uuid, last_sign_in_at timestamptz)
language sql security definer set search_path = public, auth as $$
  select m.profile_id, u.last_sign_in_at
  from organization_members m join auth.users u on u.id = m.profile_id
  where m.organization_id = p_org;
$$;
revoke all on function org_member_logins(uuid) from public, anon, authenticated;

create function member_logins(p_ids uuid[])
returns table (profile_id uuid, last_sign_in_at timestamptz)
language sql security definer set search_path = public, auth as $$
  select u.id, u.last_sign_in_at from auth.users u where u.id = any(p_ids);
$$;
revoke all on function member_logins(uuid[]) from public, anon, authenticated;

-- Set when an admin deactivation also stopped the member's renewals, so
-- reactivating can turn renewals back on.
alter table profiles add column disable_stopped_billing boolean not null default false;
