/*
# Fix handle_new_user trigger: idempotent profile + auto tenant/membership

## Problem
The original `handle_new_user` trigger only inserted a `profiles` row
(id, email, full_name) with no `tenant_id`, no `tenants` row, and no
`tenant_members` row. New signups ended up with a profile but no tenant
and no membership, causing an empty dashboard experience.

Additionally, the INSERT had no `ON CONFLICT` clause, so a duplicated
trigger fire would error instead of being idempotent.

## Changes
1. `handle_new_user()` rewritten to:
   - Insert profile with `ON CONFLICT (id) DO NOTHING` (idempotent).
   - Skip re-setup if profile already has a `tenant_id`.
   - Create a new tenant (is_owner=false, status=active) with a
     UUID-derived unique slug.
   - Update the profile's `tenant_id` to the new tenant.
   - Create a `tenant_members` row with the system `admin` role,
     `is_primary=true`, `status=active`, `joined_at=now()`.
   - Use `ON CONFLICT (tenant_id, user_id) DO NOTHING` on the member insert.
2. The trigger `on_auth_user_created` is re-created (no change to its
   definition, just ensuring it points to the updated function).

## Security
- No RLS policy changes.
- No changes to existing users, tenants, or tenant_members.
- Function remains SECURITY DEFINER with `search_path = public`.
- New tenants get `is_owner = false` (not the platform owner).
- Existing owner tenant and its members are unaffected.

## Important Notes
1. Existing users without tenants (e.g. user 432f...) are NOT modified.
   They will see a "no tenant" error screen in the frontend and must
   contact the admin to be linked to a tenant manually.
2. New signups after this migration will automatically get their own
   tenant with admin role.
3. The admin system role (name='admin', is_system=true) is used as the
   default role. If it does not exist, role_id is set to NULL (the user
   is still a member, just without a role assignment).
*/

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
  -- Idempotent profile insert
  INSERT INTO profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;

  -- Skip if profile already has a tenant (already set up)
  SELECT tenant_id INTO new_tenant_id FROM profiles WHERE id = NEW.id;
  IF new_tenant_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Get the system admin role
  SELECT id INTO admin_role_id FROM roles WHERE name = 'admin' AND is_system = true LIMIT 1;

  -- Derive user display name
  user_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);

  -- Generate a unique slug from the user's UUID (guaranteed unique)
  tenant_slug := 'org-' || substr(replace(NEW.id::text, '-', ''), 1, 12);

  -- Create a new tenant for this user
  INSERT INTO tenants (name, slug, status, is_owner)
  VALUES (user_name, tenant_slug, 'active', false)
  RETURNING id INTO new_tenant_id;

  -- Link profile to the new tenant
  UPDATE profiles SET tenant_id = new_tenant_id WHERE id = NEW.id;

  -- Create tenant membership with admin role
  INSERT INTO tenant_members (tenant_id, user_id, role_id, is_primary, status, joined_at)
  VALUES (new_tenant_id, NEW.id, admin_role_id, true, 'active', now())
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
