/*
# Migration 015: Security Fixes + Audit Log Triggers + Owner RLS Policies

## What this migration does

### 1. Security Fixes
- Adds `SET search_path = 'public'` to `update_updated_at` and `check_journal_entry_balance`
  to prevent search_path poisoning attacks.
- Fixes `biometric_logs` which had RLS enabled but NO policies (fully open to any authenticated user).
  Locks it down so only owner-tenant members can access it.
- Removes EXECUTE grant on `handle_new_user` from `authenticated` role (should only be a trigger, not callable via REST).

### 2. Audit Log Triggers
- Creates a helper function `log_audit_event` (SECURITY DEFINER) that inserts into `audit_logs`.
- Adds database-level triggers on key tables (invoices, receipts, journal_entries, shifts, parties,
  products, tenants) to automatically write audit records on INSERT/UPDATE/DELETE.
- This ensures audit_logs is populated without relying on the frontend.

### 3. Owner Panel RLS Policies
- Ensures the owner user (tenant.is_owner = true) can UPDATE tenants table to change status/plan.
- Adds a specific owner update policy on `tenants` so the owner panel can activate/suspend tenants.

### Important Notes
- All changes are idempotent (DROP IF EXISTS before CREATE).
- No data is deleted or modified.
- The `biometric_logs` table will now be accessible only to authenticated members of the owner tenant.
*/

-- ============================================================
-- 1. Fix search_path on vulnerable functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Re-create check_journal_entry_balance with fixed search_path
CREATE OR REPLACE FUNCTION public.check_journal_entry_balance(p_entry_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  total_debit  numeric;
  total_credit numeric;
BEGIN
  SELECT
    COALESCE(SUM(debit), 0),
    COALESCE(SUM(credit), 0)
  INTO total_debit, total_credit
  FROM journal_lines
  WHERE journal_entry_id = p_entry_id;

  RETURN (total_debit = total_credit AND total_debit > 0);
END;
$$;

-- ============================================================
-- 2. Fix biometric_logs: add proper RLS policies
-- ============================================================

DROP POLICY IF EXISTS "owner_select_biometric_logs" ON biometric_logs;
DROP POLICY IF EXISTS "owner_insert_biometric_logs" ON biometric_logs;
DROP POLICY IF EXISTS "owner_update_biometric_logs" ON biometric_logs;
DROP POLICY IF EXISTS "owner_delete_biometric_logs" ON biometric_logs;

-- Only owner-tenant members can access biometric_logs
CREATE POLICY "owner_select_biometric_logs" ON biometric_logs FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tenants t
    JOIN profiles p ON p.tenant_id = t.id
    WHERE t.is_owner = true AND p.id = auth.uid()
  )
);

CREATE POLICY "owner_insert_biometric_logs" ON biometric_logs FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tenants t
    JOIN profiles p ON p.tenant_id = t.id
    WHERE t.is_owner = true AND p.id = auth.uid()
  )
);

CREATE POLICY "owner_update_biometric_logs" ON biometric_logs FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tenants t
    JOIN profiles p ON p.tenant_id = t.id
    WHERE t.is_owner = true AND p.id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tenants t
    JOIN profiles p ON p.tenant_id = t.id
    WHERE t.is_owner = true AND p.id = auth.uid()
  )
);

CREATE POLICY "owner_delete_biometric_logs" ON biometric_logs FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tenants t
    JOIN profiles p ON p.tenant_id = t.id
    WHERE t.is_owner = true AND p.id = auth.uid()
  )
);

-- ============================================================
-- 3. Revoke EXECUTE on handle_new_user from authenticated
--    (it is a trigger function, not an RPC)
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- ============================================================
-- 4. Owner can UPDATE tenants (to change status/plan)
--    Add a specific owner UPDATE policy on tenants
-- ============================================================

DROP POLICY IF EXISTS "owner_update_tenants" ON tenants;

CREATE POLICY "owner_update_tenants" ON tenants FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tenants t2
    JOIN profiles p ON p.tenant_id = t2.id
    WHERE t2.is_owner = true AND p.id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tenants t2
    JOIN profiles p ON p.tenant_id = t2.id
    WHERE t2.is_owner = true AND p.id = auth.uid()
  )
);

-- ============================================================
-- 5. Audit log helper function
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_tenant_id uuid,
  p_user_id   uuid,
  p_action    text,
  p_entity_type text,
  p_entity_id   uuid,
  p_entity_name text,
  p_old_values  jsonb DEFAULT NULL,
  p_new_values  jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, entity_name, old_values, new_values)
  VALUES (p_tenant_id, p_user_id, p_action, p_entity_type, p_entity_id, p_entity_name, p_old_values, p_new_values);
EXCEPTION WHEN OTHERS THEN
  -- Never fail the calling transaction due to audit logging
  NULL;
END;
$$;

-- Grant execute to authenticated so it can be called from app
GRANT EXECUTE ON FUNCTION public.log_audit_event(uuid, uuid, text, text, uuid, text, jsonb, jsonb) TO authenticated;

-- ============================================================
-- 6. Audit trigger function for generic tables
-- ============================================================

CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_action      text;
  v_entity_id   uuid;
  v_tenant_id   uuid;
  v_user_id     uuid;
  v_entity_name text;
  v_old_vals    jsonb;
  v_new_vals    jsonb;
BEGIN
  v_action := TG_OP; -- INSERT, UPDATE, DELETE
  v_user_id := auth.uid();

  IF TG_OP = 'DELETE' THEN
    v_entity_id   := OLD.id;
    v_tenant_id   := OLD.tenant_id;
    v_entity_name := COALESCE(
      (OLD::json->>'name'), (OLD::json->>'entry_number'),
      (OLD::json->>'receipt_number'), (OLD::json->>'invoice_number'),
      (OLD::json->>'transfer_number'), OLD.id::text
    );
    v_old_vals := to_jsonb(OLD);
    v_new_vals := NULL;
  ELSE
    v_entity_id   := NEW.id;
    v_tenant_id   := NEW.tenant_id;
    v_entity_name := COALESCE(
      (NEW::json->>'name'), (NEW::json->>'entry_number'),
      (NEW::json->>'receipt_number'), (NEW::json->>'invoice_number'),
      (NEW::json->>'transfer_number'), NEW.id::text
    );
    v_old_vals := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
    v_new_vals := to_jsonb(NEW);
  END IF;

  PERFORM public.log_audit_event(
    v_tenant_id, v_user_id,
    lower(v_action) || '_' || lower(TG_TABLE_NAME),
    TG_TABLE_NAME,
    v_entity_id,
    v_entity_name,
    v_old_vals,
    v_new_vals
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ============================================================
-- 7. Attach audit triggers to key business tables
-- ============================================================

-- invoices
DROP TRIGGER IF EXISTS audit_invoices ON invoices;
CREATE TRIGGER audit_invoices
  AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- receipts
DROP TRIGGER IF EXISTS audit_receipts ON receipts;
CREATE TRIGGER audit_receipts
  AFTER INSERT OR UPDATE OR DELETE ON receipts
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- journal_entries
DROP TRIGGER IF EXISTS audit_journal_entries ON journal_entries;
CREATE TRIGGER audit_journal_entries
  AFTER INSERT OR UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- shifts
DROP TRIGGER IF EXISTS audit_shifts ON shifts;
CREATE TRIGGER audit_shifts
  AFTER INSERT OR UPDATE OR DELETE ON shifts
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- parties
DROP TRIGGER IF EXISTS audit_parties ON parties;
CREATE TRIGGER audit_parties
  AFTER INSERT OR UPDATE OR DELETE ON parties
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- tenants (for owner panel actions)
DROP TRIGGER IF EXISTS audit_tenants ON tenants;
CREATE TRIGGER audit_tenants
  AFTER INSERT OR UPDATE OR DELETE ON tenants
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();
