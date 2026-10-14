-- Fix infinite recursion in tenant_members RLS policies.
--
-- Root cause: select_tenant_members policy uses is_tenant_member() which
-- queries tenant_members, whose RLS re-invokes is_tenant_member() → infinite loop.
-- Same applies to is_owner_user() which also reads tenant_members.
--
-- Fix: rewrite both SECURITY DEFINER functions to read from `profiles`
-- (which has a non-recursive select_own_profile policy: id = auth.uid())
-- instead of tenant_members. This breaks the cycle while preserving:
--   - tenant isolation (user must belong to the same tenant)
--   - owner detection (user is an active member of an owner tenant)
--
-- No tables, data, users, or memberships are changed.

-- ============================================================
-- 1. Rewrite is_tenant_member: check profiles instead of tenant_members
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_tenant_member(check_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND tenant_id = check_tenant_id
  );
$function$;

-- ============================================================
-- 2. Rewrite is_owner_user: check profiles + tenants join
--    (avoids reading tenant_members which triggers recursion)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_owner_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    JOIN tenants t ON t.id = p.tenant_id
    WHERE p.id = auth.uid()
      AND p.tenant_id IS NOT NULL
      AND t.is_owner = true
  );
$function$;

-- Revoke EXECUTE from anon (preserved from migration 007)
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_owner_user() FROM anon;
