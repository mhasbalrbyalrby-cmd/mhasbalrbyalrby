/*
# Add specialized modules: Zakat, Inheritance, Fuel, Restaurant, AI

1. New Data
- Adds rows to `modules` table for: zakat, inheritance, fuel, restaurant, ai_assistant
- Each module has Arabic and English names, descriptions, and icons
- All set to is_active=true, sort_order 12-16

2. Security
- No table structure changes
- No RLS changes
- Only INSERT into existing modules table
*/

INSERT INTO modules (code, name, name_ar, description, icon, sort_order, is_active)
VALUES
  ('zakat', 'Zakat', 'الزكاة', 'Zakat calculation and tracking', 'HandCoins', 12, true),
  ('inheritance', 'Inheritance', 'المواريث والتركات', 'Estate and inheritance distribution', 'ScrollText', 13, true),
  ('fuel', 'Fuel & Fleet', 'الوقود والأسطول', 'Fuel transactions and vehicle management', 'Fuel', 14, true),
  ('restaurant', 'Restaurant', 'المطاعم', 'Restaurant operations and menu management', 'UtensilsCrossed', 15, true),
  ('ai_assistant', 'AI Assistant', 'المساعد الذكي', 'AI-powered accounting assistant and automation', 'Sparkles', 16, true)
ON CONFLICT (code) DO NOTHING;
