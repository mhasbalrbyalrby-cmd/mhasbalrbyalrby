-- Protect the primary System Owner membership from accidental role/status changes or deletion.
-- This migration is committed for review only; do not apply to the live database without approval.

create or replace function public.guard_system_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_is_owner boolean := false;
begin
  if tg_op = 'INSERT' then
    select t.is_owner into target_is_owner
    from public.tenants t
    where t.id = new.tenant_id;

    if coalesce(target_is_owner, false) and coalesce(new.is_primary, false) then
      raise exception 'The primary System Owner membership cannot be created or replaced through ordinary membership operations.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  select t.is_owner into target_is_owner
  from public.tenants t
  where t.id = old.tenant_id;

  if coalesce(target_is_owner, false) and coalesce(old.is_primary, false) then
    if tg_op = 'DELETE' then
      raise exception 'The primary System Owner membership cannot be deleted.'
        using errcode = '42501';
    end if;

    if new.tenant_id is distinct from old.tenant_id
       or new.user_id is distinct from old.user_id
       or new.role_id is distinct from old.role_id
       or new.status is distinct from old.status
       or new.is_primary is distinct from old.is_primary then
      raise exception 'The primary System Owner membership role, status, identity, and tenant are protected.'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    select t.is_owner into target_is_owner
    from public.tenants t
    where t.id = new.tenant_id;

    if coalesce(target_is_owner, false) and coalesce(new.is_primary, false)
       and not (coalesce((select t.is_owner from public.tenants t where t.id = old.tenant_id), false)
                and coalesce(old.is_primary, false)) then
      raise exception 'A second primary membership cannot be assigned to the System Owner tenant.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  return old;
end;
$$;

drop trigger if exists guard_system_owner_membership on public.tenant_members;
create trigger guard_system_owner_membership
before insert or update or delete on public.tenant_members
for each row execute function public.guard_system_owner_membership();


-- Prevent deletion/deactivation or tenant reassignment of the profile belonging to
-- the primary active membership of the System Owner tenant. Ordinary profile details
-- such as display name remain editable.
create or replace function public.guard_system_owner_profile()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  is_primary_system_owner boolean := false;
begin
  select exists (
    select 1
    from public.tenant_members tm
    join public.tenants t on t.id = tm.tenant_id
    where tm.user_id = old.id
      and tm.is_primary = true
      and tm.status = 'active'
      and t.is_owner = true
  ) into is_primary_system_owner;

  if is_primary_system_owner then
    if tg_op = 'DELETE' then
      raise exception 'The primary System Owner profile cannot be deleted.'
        using errcode = '42501';
    end if;

    if new.id is distinct from old.id
       or new.tenant_id is distinct from old.tenant_id
       or new.is_active is distinct from old.is_active then
      raise exception 'The primary System Owner profile identity, tenant, and active status are protected.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_system_owner_profile on public.profiles;
create trigger guard_system_owner_profile
before update or delete on public.profiles
for each row execute function public.guard_system_owner_profile();

revoke all on function public.guard_system_owner_membership() from public, anon, authenticated;
revoke all on function public.guard_system_owner_profile() from public, anon, authenticated;
