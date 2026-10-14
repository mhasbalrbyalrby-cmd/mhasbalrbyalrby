/*
# Add columns for warehouse transfers, exchange rate on transfers, and receipt_date on receipts

## Purpose
1. stock_movements: add `to_warehouse_id` for transfer movements (source → destination)
2. exchange_transfers: add `exchange_rate`, `amount_base`, `cash_currency`, `commission_type`, `commission_bearer` for multi-currency support
3. receipts: add `actual_receipt_date` to separate receipt date from invoice date (post-midnight handling)
4. tenants settings: add `allow_post_midnight_shift` and `hijri_offset` defaults

## Security
- No RLS changes needed — existing policies cover new columns
- No data loss — all columns are nullable additions
*/

-- 1. stock_movements: add to_warehouse_id for transfers
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS to_warehouse_id uuid REFERENCES warehouses(id);

-- 2. exchange_transfers: multi-currency fields
ALTER TABLE exchange_transfers ADD COLUMN IF NOT EXISTS exchange_rate numeric DEFAULT 1;
ALTER TABLE exchange_transfers ADD COLUMN IF NOT EXISTS amount_base numeric DEFAULT 0;
ALTER TABLE exchange_transfers ADD COLUMN IF NOT EXISTS cash_currency text;
ALTER TABLE exchange_transfers ADD COLUMN IF NOT EXISTS commission_type text DEFAULT 'fixed';
ALTER TABLE exchange_transfers ADD COLUMN IF NOT EXISTS commission_bearer text DEFAULT 'sender';
ALTER TABLE exchange_transfers ADD COLUMN IF NOT EXISTS direction text DEFAULT 'outgoing';

-- 3. receipts: actual receipt date for post-midnight handling
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS actual_receipt_date date;

-- 4. Add zakat_records table for Zakat module
CREATE TABLE IF NOT EXISTS zakat_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  hijri_year text NOT NULL,
  nisab_date date,
  nisab_hijri text,
  haul_start date,
  haul_end date,
  cash_amount numeric DEFAULT 0,
  receivables_amount numeric DEFAULT 0,
  inventory_amount numeric DEFAULT 0,
  other_amount numeric DEFAULT 0,
  total_zakat_base numeric DEFAULT 0,
  zakat_rate numeric DEFAULT 0.025,
  zakat_due numeric DEFAULT 0,
  zakat_paid numeric DEFAULT 0,
  payment_date date,
  payment_method text,
  payment_reference text,
  notes text,
  status text DEFAULT 'calculated',
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE zakat_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_zakat" ON zakat_records;
CREATE POLICY "select_own_zakat" ON zakat_records FOR SELECT
  TO authenticated USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() AND status = 'active'));

DROP POLICY IF EXISTS "insert_own_zakat" ON zakat_records;
CREATE POLICY "insert_own_zakat" ON zakat_records FOR INSERT
  TO authenticated WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() AND status = 'active'));

DROP POLICY IF EXISTS "update_own_zakat" ON zakat_records;
CREATE POLICY "update_own_zakat" ON zakat_records FOR UPDATE
  TO authenticated USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() AND status = 'active'))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() AND status = 'active'));

DROP POLICY IF EXISTS "delete_own_zakat" ON zakat_records;
CREATE POLICY "delete_own_zakat" ON zakat_records FOR DELETE
  TO authenticated USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() AND status = 'active'));
