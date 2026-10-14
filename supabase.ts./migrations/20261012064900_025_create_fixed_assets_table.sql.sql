/*
# Create fixed_assets table for asset tracking and depreciation

1. New Tables
- `fixed_assets` — tracks individual fixed assets with purchase info, depreciation method, and current value
  - id (uuid PK)
  - tenant_id (uuid FK to tenants)
  - asset_name (text, not null)
  - asset_name_ar (text, nullable — Arabic name)
  - asset_code (text — internal code like ASSET-001)
  - category (text — e.g. buildings, vehicles, equipment, furniture, computers)
  - purchase_date (date)
  - purchase_cost (numeric, default 0)
  - salvage_value (numeric, default 0 — residual value at end of life)
  - useful_life_years (integer — years of useful life)
  - depreciation_method (text — 'straight_line' or 'declining_balance')
  - annual_depreciation (numeric — computed annual depreciation amount)
  - accumulated_depreciation (numeric, default 0)
  - current_value (numeric — purchase_cost - accumulated_depreciation)
  - status (text — 'active', 'disposed', 'fully_depreciated')
  - notes (text, nullable)
  - created_by (uuid FK to auth.users)
  - created_at (timestamptz default now())
  - updated_at (timestamptz default now())

2. Security
- Enable RLS on fixed_assets
- 4 separate policies (SELECT/INSERT/UPDATE/DELETE) scoped to authenticated users who are active members of the same tenant

3. Index
- Index on tenant_id for efficient tenant-scoped queries
*/

CREATE TABLE IF NOT EXISTS fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_name text NOT NULL,
  asset_name_ar text,
  asset_code text,
  category text DEFAULT 'equipment',
  purchase_date date,
  purchase_cost numeric(14,2) DEFAULT 0,
  salvage_value numeric(14,2) DEFAULT 0,
  useful_life_years integer DEFAULT 5,
  depreciation_method text DEFAULT 'straight_line',
  annual_depreciation numeric(14,2) DEFAULT 0,
  accumulated_depreciation numeric(14,2) DEFAULT 0,
  current_value numeric(14,2) DEFAULT 0,
  status text DEFAULT 'active',
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_fixed_assets_tenant ON fixed_assets(tenant_id);

DROP POLICY IF EXISTS "select_own_fixed_assets" ON fixed_assets;
CREATE POLICY "select_own_fixed_assets" ON fixed_assets FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.tenant_id = fixed_assets.tenant_id AND tm.user_id = auth.uid() AND tm.status = 'active')
  );

DROP POLICY IF EXISTS "insert_own_fixed_assets" ON fixed_assets;
CREATE POLICY "insert_own_fixed_assets" ON fixed_assets FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.tenant_id = fixed_assets.tenant_id AND tm.user_id = auth.uid() AND tm.status = 'active')
  );

DROP POLICY IF EXISTS "update_own_fixed_assets" ON fixed_assets;
CREATE POLICY "update_own_fixed_assets" ON fixed_assets FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.tenant_id = fixed_assets.tenant_id AND tm.user_id = auth.uid() AND tm.status = 'active')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.tenant_id = fixed_assets.tenant_id AND tm.user_id = auth.uid() AND tm.status = 'active')
  );

DROP POLICY IF EXISTS "delete_own_fixed_assets" ON fixed_assets;
CREATE POLICY "delete_own_fixed_assets" ON fixed_assets FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.tenant_id = fixed_assets.tenant_id AND tm.user_id = auth.uid() AND tm.status = 'active')
  );
