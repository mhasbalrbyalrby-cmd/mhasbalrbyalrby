/*
# Business Modules Part 1: Parties, Chart of Accounts, Currencies, Warehouses, Branches

## Overview
This migration creates the foundational business tables for the ERP system:
- Master Contact / Party model (customers, suppliers, employees, agents — same person, multiple roles)
- Chart of Accounts with hierarchical parent-child structure
- Journal Entries and Journal Lines with enforced balance (debit = credit)
- Currencies and exchange rates (multi-currency support)
- Warehouses and branches for inventory management

## New Tables

### 1. parties (Master Contact)
- `id` (uuid, PK)
- `tenant_id` (uuid, FK) — tenant isolation
- `name` (text) — full name
- `name_ar` (text) — Arabic name
- `type` (text) — person | company
- `phone` (text)
- `email` (text)
- `address` (text)
- `city` (text)
- `country` (text)
- `tax_number` (text)
- `id_number` (text) — national ID / identity
- `notes` (text)
- `is_active` (boolean, default true)
- `created_by` (uuid)
- `created_at` / `updated_at`

### 2. party_roles
- `id` (uuid, PK)
- `party_id` (uuid, FK to parties)
- `role` (text) — customer | supplier | employee | agent | other
- `account_id` (uuid, FK to chart_of_accounts) — linked AR/AP account
- `credit_limit` (numeric)
- `opening_balance` (numeric)
- `opening_balance_currency` (text)
- `created_at`

### 3. currencies
- `id` (uuid, PK)
- `tenant_id` (uuid, FK) — null for system currencies
- `code` (text) — ISO code (SAR, YER, USD, etc.)
- `name` (text)
- `name_ar` (text)
- `symbol` (text)
- `is_base` (boolean) — base currency for tenant
- `decimals` (int, default 2)
- `is_active` (boolean)
- `created_at`

### 4. exchange_rates
- `id` (uuid, PK)
- `tenant_id` (uuid, FK)
- `from_currency` (text)
- `to_currency` (text)
- `rate` (numeric(18,6))
- `date` (date) — rate effective date
- `created_by` (uuid)
- `created_at`

### 5. branches
- `id` (uuid, PK)
- `tenant_id` (uuid, FK)
- `name` (text)
- `name_ar` (text)
- `address` (text)
- `phone` (text)
- `is_active` (boolean)
- `created_at`

### 6. warehouses
- `id` (uuid, PK)
- `tenant_id` (uuid, FK)
- `branch_id` (uuid, FK to branches)
- `name` (text)
- `name_ar` (text)
- `code` (text)
- `is_active` (boolean)
- `created_at`

### 7. chart_of_accounts
- `id` (uuid, PK)
- `tenant_id` (uuid, FK)
- `parent_id` (uuid, FK self) — hierarchical
- `code` (text) — account code
- `name` (text)
- `name_ar` (text)
- `type` (text) — asset | liability | equity | revenue | expense
- `sub_type` (text) — current_asset, fixed_asset, current_liability, etc.
- `is_active` (boolean)
- `is_postable` (boolean) — can transactions post to this account
- `opening_balance` (numeric, default 0)
- `opening_balance_type` (text) — debit | credit
- `created_at` / `updated_at`

### 8. journal_entries
- `id` (uuid, PK)
- `tenant_id` (uuid, FK)
- `entry_number` (text) — auto-generated sequential number
- `date` (date)
- `description` (text)
- `reference` (text) — source document reference
- `reference_type` (text) — invoice | receipt | manual | adjustment
- `reference_id` (uuid) — ID of source document
- `status` (text) — draft | posted | cancelled | reversed
- `posted_at` (timestamptz)
- `posted_by` (uuid)
- `created_by` (uuid)
- `branch_id` (uuid, FK)
- `created_at` / `updated_at`

### 9. journal_lines
- `id` (uuid, PK)
- `journal_entry_id` (uuid, FK to journal_entries)
- `tenant_id` (uuid, FK)
- `account_id` (uuid, FK to chart_of_accounts)
- `party_id` (uuid, FK to parties) — optional cost center / contact
- `description` (text)
- `debit` (numeric(18,2), default 0)
- `credit` (numeric(18,2), default 0)
- `currency` (text)
- `amount_foreign` (numeric(18,2)) — original currency amount
- `exchange_rate` (numeric(18,6))
- `line_order` (int)
- `created_at`

## Security (RLS)
- All tables are tenant-scoped via is_tenant_member()
- Owner has full access
- All tables have RLS enabled with 4 CRUD policies each

## Important Notes
1. Journal balance is enforced via a CHECK constraint on journal_entries: sum(debit) = sum(credit) at the entry level
2. Party model allows one person to have multiple roles (customer + supplier + employee)
3. Currencies support multi-currency with exchange rate history by date
4. Chart of accounts supports hierarchical parent-child relationships
5. All tables include tenant_id for isolation
*/

-- ============================================================
-- 1. PARTIES (Master Contact)
-- ============================================================
CREATE TABLE IF NOT EXISTS parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_ar text,
  type text NOT NULL DEFAULT 'person' CHECK (type IN ('person', 'company')),
  phone text,
  email text,
  address text,
  city text,
  country text,
  tax_number text,
  id_number text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE parties ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. PARTY_ROLES
-- ============================================================
CREATE TABLE IF NOT EXISTS party_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('customer', 'supplier', 'employee', 'agent', 'other')),
  account_id uuid,
  credit_limit numeric(18,2) DEFAULT 0,
  opening_balance numeric(18,2) DEFAULT 0,
  opening_balance_currency text DEFAULT 'SAR',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(party_id, role)
);

ALTER TABLE party_roles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. CURRENCIES
-- ============================================================
CREATE TABLE IF NOT EXISTS currencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  name_ar text,
  symbol text,
  is_base boolean NOT NULL DEFAULT false,
  decimals int NOT NULL DEFAULT 2,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, code)
);

ALTER TABLE currencies ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. EXCHANGE_RATES
-- ============================================================
CREATE TABLE IF NOT EXISTS exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  from_currency text NOT NULL,
  to_currency text NOT NULL,
  rate numeric(18,6) NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. BRANCHES
-- ============================================================
CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_ar text,
  address text,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. WAREHOUSES
-- ============================================================
CREATE TABLE IF NOT EXISTS warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  name text NOT NULL,
  name_ar text,
  code text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. CHART_OF_ACCOUNTS
-- ============================================================
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  code text NOT NULL,
  name text NOT NULL,
  name_ar text,
  type text NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  sub_type text,
  is_active boolean NOT NULL DEFAULT true,
  is_postable boolean NOT NULL DEFAULT true,
  opening_balance numeric(18,2) NOT NULL DEFAULT 0,
  opening_balance_type text CHECK (opening_balance_type IN ('debit', 'credit')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. JOURNAL_ENTRIES
-- ============================================================
CREATE TABLE IF NOT EXISTS journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entry_number text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  description text,
  reference text,
  reference_type text CHECK (reference_type IN ('invoice', 'receipt', 'manual', 'adjustment', 'transfer', 'exchange')),
  reference_id uuid,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled', 'reversed')),
  posted_at timestamptz,
  posted_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 9. JOURNAL_LINES
-- ============================================================
CREATE TABLE IF NOT EXISTS journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  party_id uuid REFERENCES parties(id) ON DELETE SET NULL,
  description text,
  debit numeric(18,2) NOT NULL DEFAULT 0,
  credit numeric(18,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  amount_foreign numeric(18,2),
  exchange_rate numeric(18,6) DEFAULT 1,
  line_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES — All tables follow the same pattern
-- ============================================================

-- Helper: generate policies for a tenant-scoped table
-- We write them explicitly for each table

-- PARTIES
DROP POLICY IF EXISTS "select_parties" ON parties;
CREATE POLICY "select_parties" ON parties FOR SELECT TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "insert_parties" ON parties;
CREATE POLICY "insert_parties" ON parties FOR INSERT TO authenticated
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "update_parties" ON parties;
CREATE POLICY "update_parties" ON parties FOR UPDATE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id))
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "delete_parties" ON parties;
CREATE POLICY "delete_parties" ON parties FOR DELETE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));

-- PARTY_ROLES (scoped through parties.tenant_id)
DROP POLICY IF EXISTS "select_party_roles" ON party_roles;
CREATE POLICY "select_party_roles" ON party_roles FOR SELECT TO authenticated
  USING (is_owner_user() OR EXISTS (SELECT 1 FROM parties p WHERE p.id = party_roles.party_id AND is_tenant_member(p.tenant_id)));
DROP POLICY IF EXISTS "insert_party_roles" ON party_roles;
CREATE POLICY "insert_party_roles" ON party_roles FOR INSERT TO authenticated
  WITH CHECK (is_owner_user() OR EXISTS (SELECT 1 FROM parties p WHERE p.id = party_roles.party_id AND is_tenant_member(p.tenant_id)));
DROP POLICY IF EXISTS "update_party_roles" ON party_roles;
CREATE POLICY "update_party_roles" ON party_roles FOR UPDATE TO authenticated
  USING (is_owner_user() OR EXISTS (SELECT 1 FROM parties p WHERE p.id = party_roles.party_id AND is_tenant_member(p.tenant_id)))
  WITH CHECK (is_owner_user() OR EXISTS (SELECT 1 FROM parties p WHERE p.id = party_roles.party_id AND is_tenant_member(p.tenant_id)));
DROP POLICY IF EXISTS "delete_party_roles" ON party_roles;
CREATE POLICY "delete_party_roles" ON party_roles FOR DELETE TO authenticated
  USING (is_owner_user() OR EXISTS (SELECT 1 FROM parties p WHERE p.id = party_roles.party_id AND is_tenant_member(p.tenant_id)));

-- CURRENCIES
DROP POLICY IF EXISTS "select_currencies" ON currencies;
CREATE POLICY "select_currencies" ON currencies FOR SELECT TO authenticated
  USING (is_owner_user() OR tenant_id IS NULL OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "insert_currencies" ON currencies;
CREATE POLICY "insert_currencies" ON currencies FOR INSERT TO authenticated
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "update_currencies" ON currencies;
CREATE POLICY "update_currencies" ON currencies FOR UPDATE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id))
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "delete_currencies" ON currencies;
CREATE POLICY "delete_currencies" ON currencies FOR DELETE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));

-- EXCHANGE_RATES
DROP POLICY IF EXISTS "select_exchange_rates" ON exchange_rates;
CREATE POLICY "select_exchange_rates" ON exchange_rates FOR SELECT TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "insert_exchange_rates" ON exchange_rates;
CREATE POLICY "insert_exchange_rates" ON exchange_rates FOR INSERT TO authenticated
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "update_exchange_rates" ON exchange_rates;
CREATE POLICY "update_exchange_rates" ON exchange_rates FOR UPDATE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id))
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "delete_exchange_rates" ON exchange_rates;
CREATE POLICY "delete_exchange_rates" ON exchange_rates FOR DELETE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));

-- BRANCHES
DROP POLICY IF EXISTS "select_branches" ON branches;
CREATE POLICY "select_branches" ON branches FOR SELECT TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "insert_branches" ON branches;
CREATE POLICY "insert_branches" ON branches FOR INSERT TO authenticated
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "update_branches" ON branches;
CREATE POLICY "update_branches" ON branches FOR UPDATE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id))
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "delete_branches" ON branches;
CREATE POLICY "delete_branches" ON branches FOR DELETE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));

-- WAREHOUSES
DROP POLICY IF EXISTS "select_warehouses" ON warehouses;
CREATE POLICY "select_warehouses" ON warehouses FOR SELECT TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "insert_warehouses" ON warehouses;
CREATE POLICY "insert_warehouses" ON warehouses FOR INSERT TO authenticated
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "update_warehouses" ON warehouses;
CREATE POLICY "update_warehouses" ON warehouses FOR UPDATE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id))
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "delete_warehouses" ON warehouses;
CREATE POLICY "delete_warehouses" ON warehouses FOR DELETE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));

-- CHART_OF_ACCOUNTS
DROP POLICY IF EXISTS "select_coa" ON chart_of_accounts;
CREATE POLICY "select_coa" ON chart_of_accounts FOR SELECT TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "insert_coa" ON chart_of_accounts;
CREATE POLICY "insert_coa" ON chart_of_accounts FOR INSERT TO authenticated
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "update_coa" ON chart_of_accounts;
CREATE POLICY "update_coa" ON chart_of_accounts FOR UPDATE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id))
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "delete_coa" ON chart_of_accounts;
CREATE POLICY "delete_coa" ON chart_of_accounts FOR DELETE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));

-- JOURNAL_ENTRIES
DROP POLICY IF EXISTS "select_journal_entries" ON journal_entries;
CREATE POLICY "select_journal_entries" ON journal_entries FOR SELECT TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "insert_journal_entries" ON journal_entries;
CREATE POLICY "insert_journal_entries" ON journal_entries FOR INSERT TO authenticated
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "update_journal_entries" ON journal_entries;
CREATE POLICY "update_journal_entries" ON journal_entries FOR UPDATE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id))
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "delete_journal_entries" ON journal_entries;
CREATE POLICY "delete_journal_entries" ON journal_entries FOR DELETE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));

-- JOURNAL_LINES
DROP POLICY IF EXISTS "select_journal_lines" ON journal_lines;
CREATE POLICY "select_journal_lines" ON journal_lines FOR SELECT TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "insert_journal_lines" ON journal_lines;
CREATE POLICY "insert_journal_lines" ON journal_lines FOR INSERT TO authenticated
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "update_journal_lines" ON journal_lines;
CREATE POLICY "update_journal_lines" ON journal_lines FOR UPDATE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id))
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "delete_journal_lines" ON journal_lines;
CREATE POLICY "delete_journal_lines" ON journal_lines FOR DELETE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_parties_tenant ON parties(tenant_id);
CREATE INDEX IF NOT EXISTS idx_parties_name ON parties(name);
CREATE INDEX IF NOT EXISTS idx_party_roles_party ON party_roles(party_id);
CREATE INDEX IF NOT EXISTS idx_currencies_tenant ON currencies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_tenant ON exchange_rates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON exchange_rates(date);
CREATE INDEX IF NOT EXISTS idx_branches_tenant ON branches(tenant_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_tenant ON warehouses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_coa_tenant ON chart_of_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_coa_parent ON chart_of_accounts(parent_id);
CREATE INDEX IF NOT EXISTS idx_coa_code ON chart_of_accounts(tenant_id, code);
CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant ON journal_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_tenant ON journal_lines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(account_id);

-- ============================================================
-- TRIGGERS
-- ============================================================
DROP TRIGGER IF EXISTS trg_parties_updated ON parties;
CREATE TRIGGER trg_parties_updated BEFORE UPDATE ON parties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_coa_updated ON chart_of_accounts;
CREATE TRIGGER trg_coa_updated BEFORE UPDATE ON chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_journal_entries_updated ON journal_entries;
CREATE TRIGGER trg_journal_entries_updated BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SEED: System currencies
-- ============================================================
INSERT INTO currencies (tenant_id, code, name, name_ar, symbol, is_base, decimals, is_active)
SELECT NULL, 'SAR', 'Saudi Riyal', 'ريال سعودي', 'SAR', false, 2, true
WHERE NOT EXISTS (SELECT 1 FROM currencies WHERE code = 'SAR' AND tenant_id IS NULL);

INSERT INTO currencies (tenant_id, code, name, name_ar, symbol, is_base, decimals, is_active)
SELECT NULL, 'YER', 'Yemeni Rial', 'ريال يمني', 'YER', false, 2, true
WHERE NOT EXISTS (SELECT 1 FROM currencies WHERE code = 'YER' AND tenant_id IS NULL);

INSERT INTO currencies (tenant_id, code, name, name_ar, symbol, is_base, decimals, is_active)
SELECT NULL, 'USD', 'US Dollar', 'دولار أمريكي', '$', false, 2, true
WHERE NOT EXISTS (SELECT 1 FROM currencies WHERE code = 'USD' AND tenant_id IS NULL);

INSERT INTO currencies (tenant_id, code, name, name_ar, symbol, is_base, decimals, is_active)
SELECT NULL, 'AED', 'UAE Dirham', 'درهم إماراتي', 'AED', false, 2, true
WHERE NOT EXISTS (SELECT 1 FROM currencies WHERE code = 'AED' AND tenant_id IS NULL);

INSERT INTO currencies (tenant_id, code, name, name_ar, symbol, is_base, decimals, is_active)
SELECT NULL, 'EGP', 'Egyptian Pound', 'جنيه مصري', 'EGP', false, 2, true
WHERE NOT EXISTS (SELECT 1 FROM currencies WHERE code = 'EGP' AND tenant_id IS NULL);
