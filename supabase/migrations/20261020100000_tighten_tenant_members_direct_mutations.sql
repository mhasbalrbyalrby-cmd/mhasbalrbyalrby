-- Phase 3 security hardening (branch-only; do not apply to production without isolated RLS tests).
--
-- The original manage_tenant_members FOR ALL policy allowed any active tenant
-- member to update/delete membership rows, including role_id, status, and
-- is_primary. That creates a privilege-escalation path: a normal member could
-- potentially promote themselves or disable another member.
--
-- Keep same-tenant SELECT and the explicit System Owner management policy.
-- Membership creation/acceptance should use the existing narrowly-scoped
-- SECURITY DEFINER invite/accept RPCs; do not grant general direct writes.
DROP POLICY IF EXISTS "manage_tenant_members" ON public.tenant_members;

COMMENT ON TABLE public.tenant_members IS
  'Tenant memberships. Direct member mutations are restricted; use authorized invite/accept RPCs and owner-only management. Validate with isolated RLS tests before deployment.';
