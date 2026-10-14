-- Fix: infinite recursion on profiles RLS
--
-- The policy "Users can access profiles in their tenant" is FOR ALL (applies
-- to SELECT), targets PUBLIC, and its USING expression subqueries profiles
-- itself: tenant_id = (SELECT profiles_1.tenant_id FROM profiles profiles_1 ...)
-- This causes "infinite recursion detected in policy for relation profiles".
--
-- This policy is fully redundant. The remaining policies already cover every case:
--   SELECT: select_own_profile (id = auth.uid())
--           select_tenant_profiles (tenant_id IS NOT NULL AND is_tenant_member(tenant_id))
--   INSERT: insert_tenant_profiles
--   UPDATE: update_own_profile, owner_manage_profiles
--   DELETE: owner_manage_profiles
--
-- No data, tables, or other policies are changed.

DROP POLICY IF EXISTS "Users can access profiles in their tenant" ON profiles;
