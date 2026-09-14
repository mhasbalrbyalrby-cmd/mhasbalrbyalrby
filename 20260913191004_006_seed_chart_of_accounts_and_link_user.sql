/*
# Seed Chart of Accounts and Link User to Tenant

## Overview
This migration does two things:
1. Links the existing auth user to the system owner tenant with the owner role
2. Creates a standard chart of accounts for the tenant so posting RPCs can function

## Changes
### 1. Link profile to tenant
- Updates the existing profile (tenant_id IS NULL) to point to the system owner tenant
- Creates a tenant_members record linking the user with the owner role

### 2. Seed Chart of Accounts
- Creates standard accounting accounts for the tenant:
  - Assets: Cash, Bank, Accounts Receivable, Inventory
  - Liabilities: Accounts Payable, Tax Payable
  - Equity: Owner's Equity, Retained Earnings
  - Revenue: Sales Revenue, Service Revenue
  - Expenses: COGS, Rent Expense, Salaries Expense, Utilities Expense
- Each account has a code, name, name_ar, type, and sub_type

## Security
- No RLS changes
- No schema changes
- Only data seeding

## Important Notes
1. This is idempotent — uses WHERE NOT EXISTS checks
2. The chart of accounts follows standard accounting structure
3. Accounts are postable (is_postable = true) so journal entries can reference them
*/

-- ============================================================
-- 1. Link profile to tenant
-- ============================================================
DO $$
DECLARE
  v_tenant_id uuid;
  v_profile_id uuid;
  v_owner_role_id uuid;
BEGIN
  -- Get the system owner tenant
  SELECT id INTO v_tenant_id FROM tenants WHERE is_owner = true LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE NOTICE 'No owner tenant found';
    RETURN;
  END IF;

  -- Get profiles with null tenant_id
  SELECT id INTO v_profile_id FROM profiles WHERE tenant_id IS NULL LIMIT 1;
  IF v_profile_id IS NULL THEN
    RAISE NOTICE 'No unlinked profile found';
    RETURN;
  END IF;

  -- Link profile to tenant
  UPDATE profiles SET tenant_id = v_tenant_id, updated_at = now()
  WHERE id = v_profile_id AND tenant_id IS NULL;

  -- Get owner role (system roles have tenant_id = NULL)
  SELECT id INTO v_owner_role_id FROM roles WHERE name = 'owner' AND is_system = true LIMIT 1;

  -- Create tenant member if not exists
  IF v_owner_role_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM tenant_members WHERE user_id = v_profile_id AND tenant_id = v_tenant_id
  ) THEN
    INSERT INTO tenant_members (tenant_id, user_id, role_id, is_primary, status, joined_at)
    VALUES (v_tenant_id, v_profile_id, v_owner_role_id, true, 'active', now());
  END IF;

  RAISE NOTICE 'Linked profile % to tenant %', v_profile_id, v_tenant_id;
END $$;

-- ============================================================
-- 2. Seed Chart of Accounts
-- ============================================================
DO $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE is_owner = true LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE NOTICE 'No tenant found for chart of accounts';
    RETURN;
  END IF;

  -- Only seed if no accounts exist
  IF EXISTS (SELECT 1 FROM chart_of_accounts WHERE tenant_id = v_tenant_id) THEN
    RAISE NOTICE 'Chart of accounts already exists for this tenant';
    RETURN;
  END IF;

  -- ASSETS
  INSERT INTO chart_of_accounts (tenant_id, code, name, name_ar, type, sub_type, is_postable, opening_balance, opening_balance_type) VALUES
    (v_tenant_id, '1000', 'Current Assets', 'الأصول المتداولة', 'asset', 'current_asset', false, 0, 'debit'),
    (v_tenant_id, '1010', 'Cash', 'النقدية', 'asset', 'current_asset', true, 0, 'debit'),
    (v_tenant_id, '1020', 'Bank', 'البنك', 'asset', 'current_asset', true, 0, 'debit'),
    (v_tenant_id, '1030', 'Accounts Receivable', 'الذمم المدينة', 'asset', 'accounts_receivable', true, 0, 'debit'),
    (v_tenant_id, '1040', 'Inventory', 'المخزون', 'asset', 'inventory', true, 0, 'debit');

  -- LIABILITIES
  INSERT INTO chart_of_accounts (tenant_id, code, name, name_ar, type, sub_type, is_postable, opening_balance, opening_balance_type) VALUES
    (v_tenant_id, '2000', 'Current Liabilities', 'الخصوم المتداولة', 'liability', 'current_liability', false, 0, 'credit'),
    (v_tenant_id, '2010', 'Accounts Payable', 'الذمم الدائنة', 'liability', 'accounts_payable', true, 0, 'credit'),
    (v_tenant_id, '2020', 'Tax Payable', 'الضريبة المستحقة', 'liability', 'tax', true, 0, 'credit');

  -- EQUITY
  INSERT INTO chart_of_accounts (tenant_id, code, name, name_ar, type, sub_type, is_postable, opening_balance, opening_balance_type) VALUES
    (v_tenant_id, '3000', 'Owners Equity', 'حقوق الملكية', 'equity', 'owners_equity', true, 0, 'credit'),
    (v_tenant_id, '3100', 'Retained Earnings', 'الأرباح المرحلة', 'equity', 'retained_earnings', true, 0, 'credit');

  -- REVENUE
  INSERT INTO chart_of_accounts (tenant_id, code, name, name_ar, type, sub_type, is_postable, opening_balance, opening_balance_type) VALUES
    (v_tenant_id, '4000', 'Sales Revenue', 'إيرادات المبيعات', 'revenue', 'sales_revenue', true, 0, 'credit'),
    (v_tenant_id, '4100', 'Service Revenue', 'إيرادات الخدمات', 'revenue', 'service_revenue', true, 0, 'credit');

  -- EXPENSES
  INSERT INTO chart_of_accounts (tenant_id, code, name, name_ar, type, sub_type, is_postable, opening_balance, opening_balance_type) VALUES
    (v_tenant_id, '5000', 'Cost of Goods Sold', 'تكلفة البضاعة المباعة', 'expense', 'cogs', true, 0, 'debit'),
    (v_tenant_id, '6000', 'Rent Expense', 'مصروف الإيجار', 'expense', 'rent', true, 0, 'debit'),
    (v_tenant_id, '6100', 'Salaries Expense', 'مصروف الرواتب', 'expense', 'salaries', true, 0, 'debit'),
    (v_tenant_id, '6200', 'Utilities Expense', 'مصروف المرافق', 'expense', 'utilities', true, 0, 'debit');

  RAISE NOTICE 'Chart of accounts seeded for tenant %', v_tenant_id;
END $$;

-- ============================================================
-- 3. Seed default currencies for the tenant
-- ============================================================
DO $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE is_owner = true LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (SELECT 1 FROM currencies WHERE tenant_id = v_tenant_id) THEN
    INSERT INTO currencies (tenant_id, code, name, name_ar, symbol, is_base, decimals, is_active) VALUES
      (v_tenant_id, 'SAR', 'Saudi Riyal', 'ريال سعودي', 'SAR', true, 2, true),
      (v_tenant_id, 'YER', 'Yemeni Rial', 'ريال يمني', 'YER', false, 2, true),
      (v_tenant_id, 'USD', 'US Dollar', 'دولار أمريكي', '$', false, 2, true),
      (v_tenant_id, 'AED', 'UAE Dirham', 'درهم إماراتي', 'AED', false, 2, true),
      (v_tenant_id, 'EGP', 'Egyptian Pound', 'جنيه مصري', 'EGP', false, 2, true);
  END IF;
END $$;

-- ============================================================
-- 4. Seed default units of measure
-- ============================================================
DO $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE is_owner = true LIMIT 1;
  IF v_tenant_id IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (SELECT 1 FROM units_of_measure WHERE tenant_id = v_tenant_id) THEN
    INSERT INTO units_of_measure (tenant_id, name, name_ar, is_base) VALUES
      (v_tenant_id, 'Piece', 'حبة', true),
      (v_tenant_id, 'Box', 'علبة', false),
      (v_tenant_id, 'Carton', 'كرتون', false),
      (v_tenant_id, 'Strip', 'شريط', false),
      (v_tenant_id, 'Pack', 'باكت', false),
      (v_tenant_id, 'Kg', 'كيلو', false),
      (v_tenant_id, 'Liter', 'لتر', false),
      (v_tenant_id, 'Meter', 'متر', false);
  END IF;
END $$;
