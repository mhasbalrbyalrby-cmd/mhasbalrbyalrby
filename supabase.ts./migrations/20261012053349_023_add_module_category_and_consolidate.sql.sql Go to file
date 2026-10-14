/*
# Add category column to modules, merge fuel into fleet, add missing modules

1. Schema Change
- Add `category` text column to modules: 'core' or 'addon'
- Add `is_optional` boolean column: true for add-ons, false for core

2. Data Updates
- Set core modules: dashboard, contacts, invoices, receipts, accounting, inventory, exchange, reports, shifts, settings
- Set addon modules: fleet, zakat, inheritance, restaurant, ai_assistant
- Merge fuel module into fleet (update fleet description to cover fuel)
- Deactivate and rename fuel module to avoid confusion
- Add missing modules: fixed_assets (core), automation (addon)

3. Security
- No RLS changes, no table creation
- Only ALTER TABLE ADD COLUMN and UPDATE/INSERT
*/

ALTER TABLE modules ADD COLUMN IF NOT EXISTS category text DEFAULT 'core';
ALTER TABLE modules ADD COLUMN IF NOT EXISTS is_optional boolean DEFAULT false;

-- Core modules (always enabled, not toggleable)
UPDATE modules SET category = 'core', is_optional = false
WHERE code IN ('dashboard', 'contacts', 'invoices', 'receipts', 'accounting', 'inventory', 'exchange', 'reports', 'shifts', 'settings');

-- Addon modules (optional, toggleable per tenant)
UPDATE modules SET category = 'addon', is_optional = true
WHERE code IN ('fleet', 'zakat', 'inheritance', 'restaurant', 'ai_assistant');

-- Merge fuel into fleet: update fleet to cover fuel comprehensively
UPDATE modules SET
  name = 'Fleet & Fuel',
  name_ar = 'الأسطول والوقود',
  description = 'Vehicles, fuel, maintenance and fleet management'
WHERE code = 'fleet';

-- Deactivate the duplicate fuel module (don't delete - preserve any tenant_modules references)
UPDATE modules SET
  is_active = false,
  name = 'Fuel (merged into Fleet)',
  name_ar = 'الوقود (مدمج في الأسطول)'
WHERE code = 'fuel';

-- Add fixed_assets module (core)
INSERT INTO modules (code, name, name_ar, description, icon, sort_order, is_active, category, is_optional)
VALUES ('fixed_assets', 'Fixed Assets', 'الأصول الثابتة', 'Fixed asset tracking and depreciation', 'Building', 17, true, 'core', false)
ON CONFLICT (code) DO NOTHING;

-- Add automation module (addon)
INSERT INTO modules (code, name, name_ar, description, icon, sort_order, is_active, category, is_optional)
VALUES ('automation', 'Automation', 'الأتمتة', 'Workflow automation and task scheduling', 'Zap', 18, true, 'addon', true)
ON CONFLICT (code) DO NOTHING;
