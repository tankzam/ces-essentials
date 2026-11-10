-- Codes already given out before CES Essentials (e.g. a name in the provider's
-- file) are stored as retired: kept on record, never assigned.
alter table activation_codes add column retired boolean not null default false;
alter table activation_codes add column retired_note text;

drop index if exists activation_codes_unassigned_idx;
create index activation_codes_available_idx on activation_codes (service_id, imported_at) where assigned_to is null and not retired;

create or replace function assign_activation_code(p_member uuid, p_service text default 'credit_vpn')
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  select code into v_code from activation_codes
    where service_id = p_service and assigned_to = p_member;
  if v_code is not null then return v_code; end if;

  update activation_codes set assigned_to = p_member, assigned_at = now()
    where id = (
      select id from activation_codes
      where service_id = p_service and assigned_to is null and not retired
      order by imported_at, id
      limit 1
      for update skip locked
    )
    returning code into v_code;
  return v_code;
end $$;
revoke all on function assign_activation_code(uuid, text) from public, anon, authenticated;

create or replace function guard_code_assignment() returns trigger language plpgsql set search_path = public as $$
begin
  if old.assigned_to is not null and new.assigned_to is distinct from old.assigned_to then
    raise exception 'activation codes are never reassigned';
  end if;
  if old.retired and new.assigned_to is not null then
    raise exception 'retired activation codes are never assigned';
  end if;
  return new;
end $$;

-- A code can never be used twice: assigned or retired codes cannot be deleted
-- (so they can't be re-uploaded), un-retired, edited, or moved to someone else.
create or replace function guard_code_assignment() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.assigned_to is not null or old.retired then
      raise exception 'activation code % has been used and can never be deleted or reused', old.code;
    end if;
    return old;
  end if;
  if new.code is distinct from old.code then
    raise exception 'activation codes cannot be edited';
  end if;
  if old.assigned_to is not null and new.assigned_to is distinct from old.assigned_to then
    raise exception 'activation codes are never reassigned';
  end if;
  if old.retired and not new.retired then
    raise exception 'a used (retired) activation code can never be made available again';
  end if;
  if new.retired and new.assigned_to is not null and old.assigned_to is null then
    raise exception 'retired activation codes are never assigned';
  end if;
  return new;
end $$;

drop trigger if exists activation_codes_never_reassign on activation_codes;
create trigger activation_codes_never_reused
  before update or delete on activation_codes
  for each row execute function guard_code_assignment();
