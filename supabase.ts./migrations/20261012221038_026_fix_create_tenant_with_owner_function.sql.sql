/*
# Fix create_tenant_with_owner function — column references were broken

## Problem
The function referenced columns that don't exist:
- tenants.phone, tenants.address, tenants.created_by — these columns don't exist on the tenants table
- tenant_members.role — this column doesn't exist; the table uses role_id (FK to roles)
- tenant_modules.module_code — this column doesn't exist; the table uses module_id (FK to modules)
- modules.is_core — this column doesn't exist; the table uses is_optional (boolean)

## Fix
Rewrote the function to:
1. Generate a unique slug from the organization name (same pattern as create_tenant_for_user)
2. Store phone/address in tenants.settings JSONB (same as create_tenant_for_user)
3. Look up the 'owner' system role and use role_id in tenant_members
4. Set is_primary = true and joined_at = now() for the owner membership
5. Link the user's profile to the new tenant
6. Enable all core (is_optional = false) modules for the new tenant

## Security
- SECURITY DEFINER, search_path locked to public
- Uses auth.uid() for the current user
- No changes to RLS policies
*/

CREATE OR REPLACE FUNCTION public.create_tenant_with_owner(
  p_name text,
  p_name_ar text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_owner_role_id uuid;
  v_slug text;
  v_existing_tenant uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if user already has a tenant
  SELECT tenant_id INTO v_existing_tenant FROM profiles WHERE id = v_user_id;
  IF v_existing_tenant IS NOT NULL THEN
    RAISE EXCEPTION 'User already has a tenant';
  END IF;

  -- Generate a unique slug from the name
  v_slug := lower(regexp_replace(p_name, '[^a-zA-Z0-9]', '-', 'g')) || '-' || substr(md5(random()::text), 1, 8);

  -- Get the system owner role
  SELECT id INTO v_owner_role_id FROM roles WHERE name = 'owner' AND is_system = true LIMIT 1;

  -- Create the tenant — phone/address stored in settings JSONB
  INSERT INTO tenants (name, name_ar, slug, status, is_owner, settings)
  VALUES (
    p_name,
    p_name_ar,
    v_slug,
    'trial',
    false,
    jsonb_build_object('phone', p_phone, 'address', p_address, 'base_currency', 'SAR')
  )
  RETURNING id INTO v_tenant_id;

  -- Create the owner membership with role_id
  INSERT INTO tenant_members (tenant_id, user_id, role_id, is_primary, status, joined_at)
  VALUES (v_tenant_id, v_user_id, v_owner_role_id, true, 'active', now());

  -- Link the profile to the tenant
  UPDATE profiles SET tenant_id = v_tenant_id WHERE id = v_user_id;

  -- Enable all core (non-optional) modules for the new tenant
  INSERT INTO tenant_modules (tenant_id, module_id, is_enabled)
  SELECT v_tenant_id, id, true
  FROM modules
  WHERE is_optional = false AND is_active = true
  ON CONFLICT DO NOTHING;

  RETURN v_tenant_id;
END;
$function$;
