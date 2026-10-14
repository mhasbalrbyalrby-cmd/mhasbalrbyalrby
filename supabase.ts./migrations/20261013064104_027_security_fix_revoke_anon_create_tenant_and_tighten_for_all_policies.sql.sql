/*
# Security Fix: Revoke anon EXECUTE on create_tenant_with_owner + Tighten FOR ALL policies to authenticated

## Problem 1: create_tenant_with_owner callable by anon
The SECURITY DEFINER function `create_tenant_with_owner` was executable by the `anon` role.
This function creates tenants and assigns owner memberships — it must only be callable by
authenticated users. All other SECURITY DEFINER functions in this project already revoke anon.

## Fix 1
REVOKE EXECUTE ON FUNCTION create_tenant_with_owner FROM anon, public.

## Problem 2: Seven tables use FOR ALL policies scoped to {public} instead of {authenticated}
Tables: accounts, ai_automation_logs, estates, heirs, journal_entry_lines, organizations, transfers.
The `FOR ALL` policies on these tables are assigned to the `public` role, which includes `anon`.
While the `auth.uid()` predicate in each policy prevents anon from actually matching any rows,
the correct practice is to scope these policies to `authenticated` only, matching the rest of
the schema (which uses `TO authenticated` on all other tables).

## Fix 2
For each of the 7 tables, drop the existing FOR ALL policy and recreate it as 4 separate
policies (SELECT, INSERT, UPDATE, DELETE) scoped TO authenticated, preserving the same
tenant isolation predicate. This also satisfies the "no FOR ALL" best practice.

## Security changes
- Revoked anon/public EXECUTE on create_tenant_with_owner
- Replaced 7 FOR ALL / public policies with 28 authenticated-only CRUD policies
- No data changes, no schema changes, no column changes
*/

-- Fix 1: Revoke anon access to create_tenant_with_owner
REVOKE EXECUTE ON FUNCTION public.create_tenant_with_owner(text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_tenant_with_owner(text, text, text, text) FROM public;

-- Fix 2: Replace FOR ALL / public policies with per-verb authenticated policies

-- accounts
DROP POLICY IF EXISTS "Tenant isolation for accounts" ON public.accounts;
CREATE POLICY "select_own_accounts" ON public.accounts FOR SELECT
  TO authenticated USING (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "insert_own_accounts" ON public.accounts FOR INSERT
  TO authenticated WITH CHECK (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "update_own_accounts" ON public.accounts FOR UPDATE
  TO authenticated USING (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "delete_own_accounts" ON public.accounts FOR DELETE
  TO authenticated USING (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));

-- ai_automation_logs
DROP POLICY IF EXISTS "Tenant isolation for ai_automation_logs" ON public.ai_automation_logs;
CREATE POLICY "select_own_ai_automation_logs" ON public.ai_automation_logs FOR SELECT
  TO authenticated USING (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "insert_own_ai_automation_logs" ON public.ai_automation_logs FOR INSERT
  TO authenticated WITH CHECK (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "update_own_ai_automation_logs" ON public.ai_automation_logs FOR UPDATE
  TO authenticated USING (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "delete_own_ai_automation_logs" ON public.ai_automation_logs FOR DELETE
  TO authenticated USING (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));

-- estates
DROP POLICY IF EXISTS "Tenant isolation for estates" ON public.estates;
CREATE POLICY "select_own_estates" ON public.estates FOR SELECT
  TO authenticated USING (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "insert_own_estates" ON public.estates FOR INSERT
  TO authenticated WITH CHECK (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "update_own_estates" ON public.estates FOR UPDATE
  TO authenticated USING (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "delete_own_estates" ON public.estates FOR DELETE
  TO authenticated USING (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));

-- heirs
DROP POLICY IF EXISTS "Tenant isolation for heirs" ON public.heirs;
CREATE POLICY "select_own_heirs" ON public.heirs FOR SELECT
  TO authenticated USING (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "insert_own_heirs" ON public.heirs FOR INSERT
  TO authenticated WITH CHECK (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "update_own_heirs" ON public.heirs FOR UPDATE
  TO authenticated USING (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "delete_own_heirs" ON public.heirs FOR DELETE
  TO authenticated USING (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));

-- journal_entry_lines
DROP POLICY IF EXISTS "Tenant isolation for journal_entry_lines" ON public.journal_entry_lines;
CREATE POLICY "select_own_journal_entry_lines" ON public.journal_entry_lines FOR SELECT
  TO authenticated USING (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "insert_own_journal_entry_lines" ON public.journal_entry_lines FOR INSERT
  TO authenticated WITH CHECK (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "update_own_journal_entry_lines" ON public.journal_entry_lines FOR UPDATE
  TO authenticated USING (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "delete_own_journal_entry_lines" ON public.journal_entry_lines FOR DELETE
  TO authenticated USING (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));

-- organizations
DROP POLICY IF EXISTS "Users can access their own organization" ON public.organizations;
CREATE POLICY "select_own_organizations" ON public.organizations FOR SELECT
  TO authenticated USING (id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "insert_own_organizations" ON public.organizations FOR INSERT
  TO authenticated WITH CHECK (id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "update_own_organizations" ON public.organizations FOR UPDATE
  TO authenticated USING (id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "delete_own_organizations" ON public.organizations FOR DELETE
  TO authenticated USING (id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));

-- transfers
DROP POLICY IF EXISTS "Tenant isolation for transfers" ON public.transfers;
CREATE POLICY "select_own_transfers" ON public.transfers FOR SELECT
  TO authenticated USING (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "insert_own_transfers" ON public.transfers FOR INSERT
  TO authenticated WITH CHECK (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "update_own_transfers" ON public.transfers FOR UPDATE
  TO authenticated USING (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "delete_own_transfers" ON public.transfers FOR DELETE
  TO authenticated USING (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));
