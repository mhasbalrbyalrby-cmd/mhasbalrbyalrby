-- Product prices may be unknown when an item is first registered.
-- Existing numeric values (including legacy zeroes) are preserved.
ALTER TABLE public.products
  ALTER COLUMN cost_price DROP NOT NULL,
  ALTER COLUMN cost_price DROP DEFAULT,
  ALTER COLUMN sale_price DROP NOT NULL,
  ALTER COLUMN sale_price DROP DEFAULT;

COMMENT ON COLUMN public.products.cost_price IS
  'Optional known purchase/cost price; NULL means not specified.';
COMMENT ON COLUMN public.products.sale_price IS
  'Optional known sale price; NULL means not specified.';
