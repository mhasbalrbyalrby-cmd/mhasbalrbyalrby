/*
# Fix fuel/fleet merge direction: keep fuel (used in nav), deactivate fleet

# The navigation uses 'fuel' as the route code, so fuel must stay active.
# Fleet was the older duplicate. Deactivate fleet instead.
*/

-- Reactivate fuel module with consolidated name
UPDATE modules SET
  is_active = true,
  category = 'addon',
  is_optional = true,
  name = 'Fleet & Fuel',
  name_ar = 'الأسطول والوقود',
  description = 'Vehicles, fuel transactions, maintenance and fleet management'
WHERE code = 'fuel';

-- Deactivate fleet (the duplicate)
UPDATE modules SET
  is_active = false,
  name = 'Fleet (merged into Fuel)',
  name_ar = 'الأسطول (مدمج في الوقود)'
WHERE code = 'fleet';

-- Update sort orders for clean ordering
UPDATE modules SET sort_order = 11 WHERE code = 'fuel';
