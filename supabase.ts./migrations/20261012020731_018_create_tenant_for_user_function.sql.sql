/*
# Create tenant onboarding function

## Purpose
Allows a newly registered user to create their own tenant (organization) and become its owner,
without needing admin intervention. This fixes the dead-end where new users had no tenant
and saw a "contact admin" message.

## Changes
1. New function: `create_tenant_for_user` (SECURITY DEFINER)
   - Creates a tenant with `is_owner = false` (tenant owner, not system owner)
   - Creates a `tenant_members` row with the system `owner` role
   - Updates the user's `profile.tenant_id` to link them
   - Returns the new tenant ID
   - Validates that the user doesn't already have a tenant

2. Grants EXECUTE to `authenticated` role only (not anon)

## Security
- SECURITY DEFINER: runs with function owner privileges to bypass RLS on tenants/tenant_members/profiles
- Only operates on the calling user's own data (auth.uid())
- Cannot be used to join an existing tenant or escalate to system owner
- `is_owner` is hardcoded to `false` — tenants created this way are never system owners
*/

CREATE OR REPLACE FUNCTION public.create_tenant_for_user(
  p_name TEXT,
  p_name_ar TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_owner_role_id uuid;
  v_slug TEXT;
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

  -- Create the tenant (NOT a system owner tenant)
  INSERT INTO tenants (name, name_ar, slug, status, is_owner, settings)
  VALUES (p_name, p_name_ar, v_slug, 'trial', false, jsonb_build_object('phone', p_phone, 'address', p_address, 'base_currency', 'SAR'))
  RETURNING id INTO v_tenant_id;

  -- Create the owner membership
  INSERT INTO tenant_members (tenant_id, user_id, role_id, is_primary, status, joined_at)
  VALUES (v_tenant_id, v_user_id, v_owner_role_id, true, 'active', now());

  -- Link the profile to the tenant
  UPDATE profiles SET tenant_id = v_tenant_id WHERE id = v_user_id;

  RETURN v_tenant_id;
END;
$$;

-- Revoke all then grant only to authenticated
REVOKE ALL ON FUNCTION create_tenant_for_user(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_tenant_for_user(TEXT, TEXT, TEXT, TEXT) TO authenticated;
