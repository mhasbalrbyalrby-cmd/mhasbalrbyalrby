/*
# Security Fix: Revoke EXECUTE from anon, Fix get_product_stock tenant isolation, Fix update_updated_at search_path

## Summary

This migration addresses three security issues identified in the SECURITY DEFINER audit:

1. **REVOKE EXECUTE from anon**: All 11 SECURITY DEFINER (and trigger) functions
   currently grant EXECUTE to PUBLIC, which includes the unauthenticated `anon`
   role. This violates the principle of least privilege. We revoke EXECUTE from
   `anon` on all 11 functions while keeping EXECUTE for `authenticated`.

2. **Fix get_product_stock tenant isolation**: The function accepts `p_tenant_id`
   as a parameter but never verifies that the calling user actually belongs to
   that tenant. Any authenticated user could read any other tenant's stock by
   passing a different `p_tenant_id`. We add a check against `profiles` (same
   pattern used by `record_stock_movement`) to ensure `auth.uid()` belongs to
   the requested tenant. If not, the EXISTS clause fails and SUM returns 0.

3. **Fix update_updated_at search_path**: The trigger function had no fixed
   `search_path`, leaving it vulnerable to search-path poisoning. We set
   `search_path TO 'public'`.

## Functions affected

- public.get_current_tenant_id()
- public.get_product_stock(p_tenant_id uuid, p_product_id uuid, p_warehouse_id uuid)
- public.handle_new_user()
- public.is_owner_user()
- public.is_tenant_member(check_tenant_id uuid)
- public.post_invoice(p_invoice_id uuid)
- public.post_journal_entry(p_entry_id uuid)
- public.post_receipt(p_receipt_id uuid)
- public.record_stock_movement(uuid, uuid, uuid, text, numeric, numeric, text, uuid, text)
- public.reverse_journal_entry(p_entry_id uuid, p_reason text)
- public.update_updated_at()

## Security changes

- REVOKE EXECUTE on all above functions FROM anon.
- get_product_stock now verifies auth.uid() belongs to p_tenant_id before returning data.
- update_updated_at now has SET search_path TO 'public'.

## Important notes

- No data is deleted or modified.
- No tables, columns, or RLS policies are changed.
- No users, tenants, or memberships are changed.
- No Auth settings are changed.
- authenticated role retains EXECUTE on all functions.
- handle_new_user is a trigger function — revoking direct EXECUTE does not affect
  trigger behavior (triggers run with definer privileges regardless).
- get_product_stock uses a direct profiles check (not is_tenant_member) to avoid
  circular SECURITY DEFINER dependency.
*/

-- ============================================================
-- 1. REVOKE EXECUTE from anon on all 11 functions
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.get_current_tenant_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_product_stock(uuid, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_owner_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.post_invoice(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.post_journal_entry(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.post_receipt(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_stock_movement(uuid, uuid, uuid, text, numeric, numeric, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reverse_journal_entry(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM anon;

-- ============================================================
-- 2. Fix get_product_stock: add tenant isolation check
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_product_stock(
  p_tenant_id uuid,
  p_product_id uuid,
  p_warehouse_id uuid DEFAULT NULL::uuid
)
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
SELECT COALESCE(SUM(
  CASE
    WHEN movement_type IN ('in', 'return_out', 'adjustment_in') THEN quantity
    WHEN movement_type IN ('out', 'return_in', 'adjustment_out') THEN -quantity
    WHEN movement_type = 'transfer_in' THEN quantity
    WHEN movement_type = 'transfer_out' THEN -quantity
    ELSE 0
  END
), 0)
FROM stock_movements
WHERE tenant_id = p_tenant_id
  AND product_id = p_product_id
  AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
  -- Tenant isolation: only return data if the caller belongs to this tenant
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND tenant_id = p_tenant_id
  );
$function$;

-- ============================================================
-- 3. Fix update_updated_at: set search_path to public
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
