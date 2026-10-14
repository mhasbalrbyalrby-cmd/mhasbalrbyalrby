/*
# Migration 017: Revoke EXECUTE from public role on trigger/helper functions

## What this migration does

### Problem
Migration 016 revoked EXECUTE from `anon` and `authenticated`, but the `public` role
(which both `anon` and `authenticated` inherit from) still has implicit EXECUTE grants
on all functions in the `public` schema. This means the revokes had no effect.

### Fix
- REVOKE EXECUTE on the three trigger/helper functions from the `public` role.
- GRANT EXECUTE back to `authenticated` only on `log_audit_event` (needed by app code).
- `audit_trigger_fn` and `update_updated_at` are trigger-only; no role needs direct EXECUTE.

### Important Notes
- Triggers still work: trigger functions execute in SECURITY DEFINER context, not the caller's.
- No data is deleted or modified.
- Idempotent: REVOKE/GRANT are safe to re-run.
*/

REVOKE EXECUTE ON FUNCTION public.audit_trigger_fn() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_audit_event(
  uuid, uuid, text, text, uuid, text, jsonb, jsonb
) FROM PUBLIC;

-- Re-grant to authenticated only for log_audit_event (app-side audit logging)
GRANT EXECUTE ON FUNCTION public.log_audit_event(
  uuid, uuid, text, text, uuid, text, jsonb, jsonb
) TO authenticated;
