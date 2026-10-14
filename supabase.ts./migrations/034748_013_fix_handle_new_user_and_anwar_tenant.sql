-- Fix: Apply the updated handle_new_user function (migration 009 was never applied)
-- AND fix Anwar's existing profile that was left without a tenant or membership.
--
-- Root cause: The handle_new_user trigger in the DB is still the old version
-- that only inserts a profile row. Migration 009 (which rewrites it to also
-- create a tenant + tenant_members) was never applied. Anwar signed up and
-- got a profile with tenant_id = null, no membership → "no tenant" error.
--
-- This migration:
-- 1. Rewrites handle_new_user to auto-create tenant + membership for new signups
-- 2. Fixes Anwar's existing profile by creating his tenant + membership
-- 3. Does NOT touch the existing owner tenant or its members
-- 4. Does NOT delete any data

-- ============================================================
-- 1. Rewrite handle_new_user (from migration 009)
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_tenant_id uuid;
  admin_role_id uuid;
  tenant_slug text;
  user_name text;
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;

  SELECT tenant_id INTO new_tenant_id FROM profiles WHERE id = NEW.id;
  IF new_tenant_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO admin_role_id FROM roles WHERE name = 'admin' AND is_system = true LIMIT 1;

  user_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
  tenant_slug := 'org-' || substr(replace(NEW.id::text, '-', ''), 1, 12);

  INSERT INTO tenants (name, slug, status, is_owner)
  VALUES (user_name, tenant_slug, 'active', false)
  RETURNING id INTO new_tenant_id;

  UPDATE profiles SET tenant_id = new_tenant_id WHERE id = NEW.id;

  INSERT INTO tenant_members (tenant_id, user_id, role_id, is_primary, status, joined_at)
  VALUES (new_tenant_id, NEW.id, admin_role_id, true, 'active', now())
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 2. Fix Anwar's existing profile (tenant_id = null, no membership)
--    This does exactly what the trigger would have done if migration 009
--    had been applied before Anwar signed up.
-- ============================================================
DO $$
DECLARE
  anwar_id uuid := '6bcff4ac-fa97-4b63-9697-0d3b7b724140';
  new_tenant_id uuid;
  admin_role_id uuid;
  tenant_slug text;
  user_name text;
BEGIN
  -- Check if Anwar already has a tenant (skip if so)
  SELECT tenant_id INTO new_tenant_id FROM profiles WHERE id = anwar_id;
  IF new_tenant_id IS NOT NULL THEN
    RAISE NOTICE 'Anwar already has tenant_id = %, skipping', new_tenant_id;
    RETURN;
  END IF;

  -- Get admin role
  SELECT id INTO admin_role_id FROM roles WHERE name = 'admin' AND is_system = true LIMIT 1;

  -- Get Anwar's display name
  SELECT COALESCE(full_name, email) INTO user_name FROM profiles WHERE id = anwar_id;

  -- Create a new tenant for Anwar (NOT the owner tenant)
  tenant_slug := 'org-' || substr(replace(anwar_id::text, '-', ''), 1, 12);
  INSERT INTO tenants (name, slug, status, is_owner)
  VALUES (user_name, tenant_slug, 'active', false)
  RETURNING id INTO new_tenant_id;

  -- Link profile to the new tenant
  UPDATE profiles SET tenant_id = new_tenant_id WHERE id = anwar_id;

  -- Create membership with admin role
  INSERT INTO tenant_members (tenant_id, user_id, role_id, is_primary, status, joined_at)
  VALUES (new_tenant_id, anwar_id, admin_role_id, true, 'active', now())
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  RAISE NOTICE 'Fixed Anwar: tenant_id = %, role = admin', new_tenant_id;
END $$;

-- Revoke EXECUTE on handle_new_user from anon (security)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
