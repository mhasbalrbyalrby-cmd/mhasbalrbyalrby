-- Seed a standard chart of accounts for every newly-created tenant and allow
-- an authenticated tenant member to repair an empty chart from the UI.
-- This file is a migration artifact only; it is NOT applied to any database here.

CREATE OR REPLACE FUNCTION public.seed_chart_of_accounts_for_tenant(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant ID is required';
  END IF;

  INSERT INTO public.chart_of_accounts
    (tenant_id, code, name, name_ar, type, sub_type, is_postable, opening_balance, opening_balance_type)
  VALUES
    (p_tenant_id, '1000', 'Current Assets', 'الأصول المتداولة', 'asset', 'current_asset', false, 0, 'debit'),
    (p_tenant_id, '1010', 'Cash', 'النقدية', 'asset', 'current_asset', true, 0, 'debit'),
    (p_tenant_id, '1020', 'Bank', 'البنك', 'asset', 'current_asset', true, 0, 'debit'),
    (p_tenant_id, '1030', 'Accounts Receivable', 'الذمم المدينة', 'asset', 'accounts_receivable', true, 0, 'debit'),
    (p_tenant_id, '1040', 'Inventory', 'المخزون', 'asset', 'inventory', true, 0, 'debit'),
    (p_tenant_id, '2000', 'Current Liabilities', 'الخصوم المتداولة', 'liability', 'current_liability', false, 0, 'credit'),
    (p_tenant_id, '2010', 'Accounts Payable', 'الذمم الدائنة', 'liability', 'accounts_payable', true, 0, 'credit'),
    (p_tenant_id, '2020', 'Tax Payable', 'الضريبة المستحقة', 'liability', 'tax', true, 0, 'credit'),
    (p_tenant_id, '3000', 'Owners Equity', 'حقوق الملكية', 'equity', 'owners_equity', true, 0, 'credit'),
    (p_tenant_id, '3100', 'Retained Earnings', 'الأرباح المرحلة', 'equity', 'retained_earnings', true, 0, 'credit'),
    (p_tenant_id, '4000', 'Sales Revenue', 'إيرادات المبيعات', 'revenue', 'sales_revenue', true, 0, 'credit'),
    (p_tenant_id, '4100', 'Service Revenue', 'إيرادات الخدمات', 'revenue', 'service_revenue', true, 0, 'credit'),
    (p_tenant_id, '5000', 'Cost of Goods Sold', 'تكلفة البضاعة المباعة', 'expense', 'cogs', true, 0, 'debit'),
    (p_tenant_id, '6000', 'Rent Expense', 'مصروف الإيجار', 'expense', 'rent', true, 0, 'debit'),
    (p_tenant_id, '6100', 'Salaries Expense', 'مصروف الرواتب', 'expense', 'salaries', true, 0, 'debit'),
    (p_tenant_id, '6200', 'Utilities Expense', 'مصروف المرافق', 'expense', 'utilities', true, 0, 'debit')
  ON CONFLICT (tenant_id, code) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- Only the internal trigger should call the tenant-id-taking helper.
REVOKE ALL ON FUNCTION public.seed_chart_of_accounts_for_tenant(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ensure_default_chart_of_accounts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_inserted integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT tm.tenant_id
    INTO v_tenant_id
  FROM public.tenant_members tm
  WHERE tm.user_id = auth.uid()
    AND tm.status = 'active'
    AND tm.is_primary = true
  ORDER BY tm.joined_at DESC NULLS LAST
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    SELECT p.tenant_id INTO v_tenant_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.tenant_id IS NOT NULL;
  END IF;

  IF v_tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
      AND tm.tenant_id = v_tenant_id
      AND tm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'No active tenant membership found';
  END IF;

  v_inserted := public.seed_chart_of_accounts_for_tenant(v_tenant_id);
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_default_chart_of_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_default_chart_of_accounts() TO authenticated;

CREATE OR REPLACE FUNCTION public.seed_chart_of_accounts_after_tenant_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The system-owner tenant is maintained separately; seed business tenants only.
  IF COALESCE(NEW.is_owner, false) = false THEN
    PERFORM public.seed_chart_of_accounts_for_tenant(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_chart_of_accounts_after_tenant_insert ON public.tenants;
CREATE TRIGGER seed_chart_of_accounts_after_tenant_insert
AFTER INSERT ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.seed_chart_of_accounts_after_tenant_insert();

REVOKE ALL ON FUNCTION public.seed_chart_of_accounts_after_tenant_insert() FROM PUBLIC, anon, authenticated;
