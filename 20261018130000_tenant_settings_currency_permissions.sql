-- Role-restricted tenant settings and currency management.
-- Draft only: review and apply to an isolated test database before production.

create or replace function public.can_manage_tenant_settings(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    public.is_owner_user()
    or (
      p_tenant_id is not null
      and exists (
        select 1
        from public.tenant_members tm
        join public.roles r on r.id = tm.role_id
        where tm.user_id = auth.uid()
          and tm.tenant_id = p_tenant_id
          and tm.status = 'active'
          and lower(r.name) in ('owner', 'admin')
      )
    );
$function$;

revoke all on function public.can_manage_tenant_settings(uuid) from public, anon;
grant execute on function public.can_manage_tenant_settings(uuid) to authenticated;

create or replace function public.update_tenant_company_settings(
  p_tenant_id uuid,
  p_name text,
  p_name_ar text,
  p_phone text,
  p_address text,
  p_base_currency text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_tenant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_tenant_id is null or not public.can_manage_tenant_settings(p_tenant_id) then
    raise exception 'You are not allowed to manage this tenant settings' using errcode = '42501';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception 'Tenant name is required' using errcode = '22023';
  end if;

  if length(btrim(p_name)) > 150 or length(btrim(coalesce(p_name_ar, ''))) > 150 then
    raise exception 'Tenant name exceeds 150 characters' using errcode = '22023';
  end if;

  update public.tenants t
  set
    name = btrim(p_name),
    name_ar = nullif(btrim(coalesce(p_name_ar, '')), ''),
    settings = coalesce(t.settings, '{}'::jsonb)
      || jsonb_build_object(
        'phone', coalesce(p_phone, ''),
        'address', coalesce(p_address, ''),
        'base_currency', coalesce(nullif(btrim(p_base_currency), ''), 'SAR')
      ),
    updated_at = now()
  where t.id = p_tenant_id
  returning t.id into v_tenant_id;

  if v_tenant_id is null then
    raise exception 'Tenant not found or not updated' using errcode = 'P0002';
  end if;

  return v_tenant_id;
end;
$function$;

revoke all on function public.update_tenant_company_settings(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.update_tenant_company_settings(uuid, text, text, text, text, text) to authenticated;

-- Keep currency reads unchanged, but limit writes to tenant owners/admins and the system owner.
drop policy if exists insert_currencies on public.currencies;
create policy insert_currencies on public.currencies
  for insert to authenticated
  with check (public.can_manage_tenant_settings(tenant_id));

drop policy if exists update_currencies on public.currencies;
create policy update_currencies on public.currencies
  for update to authenticated
  using (public.can_manage_tenant_settings(tenant_id))
  with check (public.can_manage_tenant_settings(tenant_id));

drop policy if exists delete_currencies on public.currencies;
create policy delete_currencies on public.currencies
  for delete to authenticated
  using (public.can_manage_tenant_settings(tenant_id));
