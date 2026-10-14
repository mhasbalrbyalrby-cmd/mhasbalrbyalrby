/*
# Business Modules Part 2: Invoices, Products, Receipts, Shifts, Exchange Transfers

## Overview
This migration creates the transactional tables for the ERP:
- Invoices and invoice lines (sales, purchase, returns)
- Products/services with units of measure
- Receipts and payment vouchers
- Shift management
- Exchange/money transfers

## New Tables

### 1. products
- `id`, `tenant_id`, `code`, `name`, `name_ar`, `type` (product|service),
- `barcode`, `description`, `cost_price`, `sale_price`, `min_stock`,
- `unit_id` (FK), `category`, `image_url`, `is_active`, `created_by`, timestamps

### 2. product_units
- `id`, `tenant_id`, `product_id` (FK), `name`, `name_ar`, `factor` (conversion to base),
- `barcode`, `is_base`, `is_purchase_unit`, `is_sale_unit`, `allow_fraction`

### 3. units_of_measure
- `id`, `tenant_id`, `name`, `name_ar`, `is_base`, `created_at`

### 4. stock_movements
- `id`, `tenant_id`, `product_id`, `warehouse_id`, `movement_type` (in|out|transfer|adjustment),
- `quantity`, `unit_cost`, `reference_type`, `reference_id`, `created_by`, `created_at`

### 5. invoices
- `id`, `tenant_id`, `invoice_number`, `type` (sale|purchase|return_sale|return_purchase),
- `party_id` (FK), `date`, `due_date`, `currency`, `subtotal`, `discount_amount`,
- `discount_type` (percentage|amount), `tax_amount`, `total`, `status` (draft|posted|cancelled|paid|partial),
- `notes`, `branch_id`, `warehouse_id`, `shift_id`, `created_by`, `posted_at`, `posted_by`, timestamps

### 6. invoice_lines
- `id`, `invoice_id` (FK), `tenant_id`, `product_id`, `description`, `quantity`,
- `unit_price`, `discount_amount`, `discount_percentage`, `line_total`, `line_order`

### 7. receipts
- `id`, `tenant_id`, `receipt_number`, `type` (receipt|payment|transfer),
- `party_id` (FK), `date`, `amount`, `currency`, `exchange_rate`, `amount_base`,
- `account_id` (FK), `method` (cash|bank|card|transfer|cheque), `reference`,
- `invoice_id` (FK, optional), `status` (draft|posted|cancelled), `notes`,
- `shift_id`, `created_by`, `posted_at`, `posted_by`, timestamps

### 8. shifts
- `id`, `tenant_id`, `user_id` (FK), `branch_id`, `start_time`, `end_time`,
- `opening_amount`, `closing_amount`, `status` (open|closed|cancelled),
- `notes`, `closed_by`, timestamps

### 9. exchange_transfers
- `id`, `tenant_id`, `transfer_number`, `sender_name`, `sender_phone`,
- `beneficiary_name`, `beneficiary_phone`, `amount`, `currency`,
- `commission`, `commission_currency`, `agent_id` (FK to parties),
- `date`, `status` (pending|sent|delivered|cancelled|reversed), `delivery_date`,
- `notes`, `shift_id`, `created_by`, timestamps

## Security
- All tables tenant-scoped with RLS via is_tenant_member()
- Owner has full access
*/

-- ============================================================
-- 1. UNITS_OF_MEASURE
-- ============================================================
CREATE TABLE IF NOT EXISTS units_of_measure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_ar text,
  is_base boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE units_of_measure ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code text,
  name text NOT NULL,
  name_ar text,
  type text NOT NULL DEFAULT 'product' CHECK (type IN ('product', 'service')),
  barcode text,
  description text,
  cost_price numeric(18,2) NOT NULL DEFAULT 0,
  sale_price numeric(18,2) NOT NULL DEFAULT 0,
  min_stock numeric(18,2) NOT NULL DEFAULT 0,
  unit_id uuid REFERENCES units_of_measure(id) ON DELETE SET NULL,
  category text,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. PRODUCT_UNITS
-- ============================================================
CREATE TABLE IF NOT EXISTS product_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_ar text,
  factor numeric(18,6) NOT NULL DEFAULT 1,
  barcode text,
  is_base boolean NOT NULL DEFAULT false,
  is_purchase_unit boolean NOT NULL DEFAULT false,
  is_sale_unit boolean NOT NULL DEFAULT false,
  allow_fraction boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE product_units ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. STOCK_MOVEMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('in', 'out', 'transfer', 'adjustment', 'return_in', 'return_out')),
  quantity numeric(18,2) NOT NULL,
  unit_cost numeric(18,2) DEFAULT 0,
  reference_type text,
  reference_id uuid,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. INVOICES
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  type text NOT NULL CHECK (type IN ('sale', 'purchase', 'return_sale', 'return_purchase')),
  party_id uuid REFERENCES parties(id) ON DELETE SET NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  currency text NOT NULL DEFAULT 'SAR',
  subtotal numeric(18,2) NOT NULL DEFAULT 0,
  discount_amount numeric(18,2) NOT NULL DEFAULT 0,
  discount_type text CHECK (discount_type IN ('percentage', 'amount')),
  tax_amount numeric(18,2) NOT NULL DEFAULT 0,
  total numeric(18,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled', 'paid', 'partial')),
  notes text,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL,
  shift_id uuid,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  posted_at timestamptz,
  posted_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. INVOICE_LINES
-- ============================================================
CREATE TABLE IF NOT EXISTS invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  description text,
  quantity numeric(18,2) NOT NULL DEFAULT 1,
  unit_price numeric(18,2) NOT NULL DEFAULT 0,
  discount_amount numeric(18,2) NOT NULL DEFAULT 0,
  discount_percentage numeric(5,2) NOT NULL DEFAULT 0,
  line_total numeric(18,2) NOT NULL DEFAULT 0,
  line_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. RECEIPTS
-- ============================================================
CREATE TABLE IF NOT EXISTS receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  receipt_number text NOT NULL,
  type text NOT NULL CHECK (type IN ('receipt', 'payment', 'transfer')),
  party_id uuid REFERENCES parties(id) ON DELETE SET NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  exchange_rate numeric(18,6) NOT NULL DEFAULT 1,
  amount_base numeric(18,2) NOT NULL DEFAULT 0,
  account_id uuid REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  method text NOT NULL DEFAULT 'cash' CHECK (method IN ('cash', 'bank', 'card', 'transfer', 'cheque')),
  reference text,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
  notes text,
  shift_id uuid,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  posted_at timestamptz,
  posted_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. SHIFTS
-- ============================================================
CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  start_time timestamptz NOT NULL DEFAULT now(),
  end_time timestamptz,
  opening_amount numeric(18,2) NOT NULL DEFAULT 0,
  closing_amount numeric(18,2),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  notes text,
  closed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 9. EXCHANGE_TRANSFERS
-- ============================================================
CREATE TABLE IF NOT EXISTS exchange_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  transfer_number text NOT NULL,
  sender_name text NOT NULL,
  sender_phone text,
  beneficiary_name text NOT NULL,
  beneficiary_phone text,
  amount numeric(18,2) NOT NULL,
  currency text NOT NULL DEFAULT 'SAR',
  commission numeric(18,2) NOT NULL DEFAULT 0,
  commission_currency text NOT NULL DEFAULT 'SAR',
  agent_id uuid REFERENCES parties(id) ON DELETE SET NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'cancelled', 'reversed')),
  delivery_date date,
  notes text,
  shift_id uuid,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE exchange_transfers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- UNITS_OF_MEASURE
DROP POLICY IF EXISTS "select_uom" ON units_of_measure;
CREATE POLICY "select_uom" ON units_of_measure FOR SELECT TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "insert_uom" ON units_of_measure;
CREATE POLICY "insert_uom" ON units_of_measure FOR INSERT TO authenticated
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "update_uom" ON units_of_measure;
CREATE POLICY "update_uom" ON units_of_measure FOR UPDATE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id))
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "delete_uom" ON units_of_measure;
CREATE POLICY "delete_uom" ON units_of_measure FOR DELETE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));

-- PRODUCTS
DROP POLICY IF EXISTS "select_products" ON products;
CREATE POLICY "select_products" ON products FOR SELECT TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "insert_products" ON products;
CREATE POLICY "insert_products" ON products FOR INSERT TO authenticated
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "update_products" ON products;
CREATE POLICY "update_products" ON products FOR UPDATE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id))
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "delete_products" ON products;
CREATE POLICY "delete_products" ON products FOR DELETE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));

-- PRODUCT_UNITS
DROP POLICY IF EXISTS "select_product_units" ON product_units;
CREATE POLICY "select_product_units" ON product_units FOR SELECT TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "insert_product_units" ON product_units;
CREATE POLICY "insert_product_units" ON product_units FOR INSERT TO authenticated
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "update_product_units" ON product_units;
CREATE POLICY "update_product_units" ON product_units FOR UPDATE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id))
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "delete_product_units" ON product_units;
CREATE POLICY "delete_product_units" ON product_units FOR DELETE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));

-- STOCK_MOVEMENTS
DROP POLICY IF EXISTS "select_stock_movements" ON stock_movements;
CREATE POLICY "select_stock_movements" ON stock_movements FOR SELECT TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "insert_stock_movements" ON stock_movements;
CREATE POLICY "insert_stock_movements" ON stock_movements FOR INSERT TO authenticated
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "update_stock_movements" ON stock_movements;
CREATE POLICY "update_stock_movements" ON stock_movements FOR UPDATE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id))
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "delete_stock_movements" ON stock_movements;
CREATE POLICY "delete_stock_movements" ON stock_movements FOR DELETE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));

-- INVOICES
DROP POLICY IF EXISTS "select_invoices" ON invoices;
CREATE POLICY "select_invoices" ON invoices FOR SELECT TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "insert_invoices" ON invoices;
CREATE POLICY "insert_invoices" ON invoices FOR INSERT TO authenticated
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "update_invoices" ON invoices;
CREATE POLICY "update_invoices" ON invoices FOR UPDATE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id))
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "delete_invoices" ON invoices;
CREATE POLICY "delete_invoices" ON invoices FOR DELETE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));

-- INVOICE_LINES
DROP POLICY IF EXISTS "select_invoice_lines" ON invoice_lines;
CREATE POLICY "select_invoice_lines" ON invoice_lines FOR SELECT TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "insert_invoice_lines" ON invoice_lines;
CREATE POLICY "insert_invoice_lines" ON invoice_lines FOR INSERT TO authenticated
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "update_invoice_lines" ON invoice_lines;
CREATE POLICY "update_invoice_lines" ON invoice_lines FOR UPDATE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id))
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "delete_invoice_lines" ON invoice_lines;
CREATE POLICY "delete_invoice_lines" ON invoice_lines FOR DELETE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));

-- RECEIPTS
DROP POLICY IF EXISTS "select_receipts" ON receipts;
CREATE POLICY "select_receipts" ON receipts FOR SELECT TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "insert_receipts" ON receipts;
CREATE POLICY "insert_receipts" ON receipts FOR INSERT TO authenticated
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "update_receipts" ON receipts;
CREATE POLICY "update_receipts" ON receipts FOR UPDATE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id))
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "delete_receipts" ON receipts;
CREATE POLICY "delete_receipts" ON receipts FOR DELETE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));

-- SHIFTS
DROP POLICY IF EXISTS "select_shifts" ON shifts;
CREATE POLICY "select_shifts" ON shifts FOR SELECT TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "insert_shifts" ON shifts;
CREATE POLICY "insert_shifts" ON shifts FOR INSERT TO authenticated
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "update_shifts" ON shifts;
CREATE POLICY "update_shifts" ON shifts FOR UPDATE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id))
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "delete_shifts" ON shifts;
CREATE POLICY "delete_shifts" ON shifts FOR DELETE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));

-- EXCHANGE_TRANSFERS
DROP POLICY IF EXISTS "select_exchange_transfers" ON exchange_transfers;
CREATE POLICY "select_exchange_transfers" ON exchange_transfers FOR SELECT TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "insert_exchange_transfers" ON exchange_transfers;
CREATE POLICY "insert_exchange_transfers" ON exchange_transfers FOR INSERT TO authenticated
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "update_exchange_transfers" ON exchange_transfers;
CREATE POLICY "update_exchange_transfers" ON exchange_transfers FOR UPDATE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id))
  WITH CHECK (is_owner_user() OR is_tenant_member(tenant_id));
DROP POLICY IF EXISTS "delete_exchange_transfers" ON exchange_transfers;
CREATE POLICY "delete_exchange_transfers" ON exchange_transfers FOR DELETE TO authenticated
  USING (is_owner_user() OR is_tenant_member(tenant_id));

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_code ON products(tenant_id, code);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_product_units_product ON product_units(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_tenant ON stock_movements(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_party ON invoices(party_id);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_receipts_tenant ON receipts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(date);
CREATE INDEX IF NOT EXISTS idx_receipts_status ON receipts(status);
CREATE INDEX IF NOT EXISTS idx_shifts_tenant ON shifts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shifts_user ON shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_exchange_transfers_tenant ON exchange_transfers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_exchange_transfers_status ON exchange_transfers(status);
CREATE INDEX IF NOT EXISTS idx_exchange_transfers_date ON exchange_transfers(date);

-- ============================================================
-- TRIGGERS
-- ============================================================
DROP TRIGGER IF EXISTS trg_products_updated ON products;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_invoices_updated ON invoices;
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_receipts_updated ON receipts;
CREATE TRIGGER trg_receipts_updated BEFORE UPDATE ON receipts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_shifts_updated ON shifts;
CREATE TRIGGER trg_shifts_updated BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_exchange_transfers_updated ON exchange_transfers;
CREATE TRIGGER trg_exchange_transfers_updated BEFORE UPDATE ON exchange_transfers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
