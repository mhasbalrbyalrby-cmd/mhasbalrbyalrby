/*
# Migration 016: Revoke EXECUTE from anon on trigger/helper functions

## What this migration does

### Security Fix
Three SECURITY DEFINER functions were callable by the `anon` role via REST API (`/rest/v1/rpc/`):
- `audit_trigger_fn()` — trigger function, should never be called directly
- `log_audit_event(...)` — audit logging helper, should only be called by triggers or authenticated app code
- `update_updated_at()` — trigger function, should never be called directly

This allows an unauthenticated user to insert fake audit log entries or invoke trigger
functions outside their intended context.

### Change
- REVOKE EXECUTE on these three functions from `anon`.
- Keep EXECUTE for `authenticated` on `log_audit_event` (app code calls it via RPC).
- `audit_trigger_fn` and `update_updated_at` are trigger-only functions; revoking from
  both `anon` and `authenticated` is safe (triggers run with the function's privileges,
  not the caller's).

### Important Notes
- No data is deleted or modified.
- Existing triggers continue to work (trigger functions execute with SECURITY DEFINER context).
- `log_audit_event` remains callable by authenticated users for legitimate app-side audit logging.
- Idempotent: REVOKE is safe to re-run.
*/

REVOKE EXECUTE ON FUNCTION public.audit_trigger_fn() FROM anon;
REVOKE EXECUTE ON FUNCTION public.audit_trigger_fn() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.log_audit_event(
  uuid, uuid, text, text, uuid, text, jsonb, jsonb
) FROM anon;
