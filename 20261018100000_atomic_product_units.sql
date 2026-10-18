-- Atomic product + packaging-unit save. Additive function only; no RLS policy changes.
CREATE OR REPLACE FUNCTION public.save_product_with_units(
  p_product_id uuid,
  p_product jsonb,
  p_units jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $atomic_product_units$
DECLARE
  v_tenant_id uuid;
  v_product_id uuid;
  v_type text;
  v_unit record;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.profiles
  WHERE id = auth.uid();

  IF auth.uid() IS NULL OR v_tenant_id IS NULL
     OR NOT public.is_tenant_member(v_tenant_id) THEN
    RAISE EXCEPTION 'active tenant membership required';
  END IF;

  IF p_product IS NULL OR NULLIF(trim(p_product->>'name'), '') IS NULL THEN
    RAISE EXCEPTION 'product name is required';
  END IF;

  v_type := COALESCE(p_product->>'type', 'product');
  IF v_type NOT IN ('product', 'service') THEN
    RAISE EXCEPTION 'invalid product type';
  END IF;

  IF p_product_id IS NULL THEN
    INSERT INTO public.products (
      tenant_id, code, name, name_ar, type, barcode, cost_price, sale_price,
      min_stock, unit_id, category, is_active, created_by
    ) VALUES (
      v_tenant_id,
      NULLIF(p_product->>'code', ''),
      trim(p_product->>'name'),
      NULLIF(trim(p_product->>'name_ar'), ''),
      v_type,
      NULLIF(p_product->>'barcode', ''),
      COALESCE(NULLIF(p_product->>'cost_price', '')::numeric, 0),
      COALESCE(NULLIF(p_product->>'sale_price', '')::numeric, 0),
      COALESCE(NULLIF(p_product->>'min_stock', '')::numeric, 0),
      NULLIF(p_product->>'unit_id', '')::uuid,
      NULLIF(trim(p_product->>'category'), ''),
      COALESCE((p_product->>'is_active')::boolean, true),
      auth.uid()
    )
    RETURNING id INTO v_product_id;
  ELSE
    UPDATE public.products
    SET code = NULLIF(p_product->>'code', ''),
        name = trim(p_product->>'name'),
        name_ar = NULLIF(trim(p_product->>'name_ar'), ''),
        type = v_type,
        barcode = NULLIF(p_product->>'barcode', ''),
        cost_price = COALESCE(NULLIF(p_product->>'cost_price', '')::numeric, 0),
        sale_price = COALESCE(NULLIF(p_product->>'sale_price', '')::numeric, 0),
        min_stock = COALESCE(NULLIF(p_product->>'min_stock', '')::numeric, 0),
        unit_id = NULLIF(p_product->>'unit_id', '')::uuid,
        category = NULLIF(trim(p_product->>'category'), ''),
        is_active = COALESCE((p_product->>'is_active')::boolean, true),
        updated_at = now()
    WHERE id = p_product_id AND tenant_id = v_tenant_id
    RETURNING id INTO v_product_id;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'product not found or not permitted';
    END IF;
  END IF;

  IF v_type = 'product' THEN
    IF p_units IS NULL OR jsonb_typeof(p_units) <> 'array' THEN
      RAISE EXCEPTION 'units must be a JSON array';
    END IF;

    -- Refuse cross-product/cross-tenant unit IDs before any delete or upsert.
    FOR v_unit IN
      SELECT x.id
      FROM jsonb_to_recordset(p_units) AS x(id uuid)
      WHERE x.id IS NOT NULL
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.product_units pu
        WHERE pu.id = v_unit.id
          AND pu.product_id = v_product_id
          AND pu.tenant_id = v_tenant_id
      ) THEN
        RAISE EXCEPTION 'unit does not belong to this product';
      END IF;
    END LOOP;

    DELETE FROM public.product_units pu
    WHERE pu.product_id = v_product_id
      AND pu.tenant_id = v_tenant_id
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_units) AS x(id uuid)
        WHERE x.id = pu.id
      );

    FOR v_unit IN
      SELECT *
      FROM jsonb_to_recordset(p_units) AS x(
        id uuid, name text, name_ar text, factor numeric, barcode text,
        cost_price numeric, sale_price numeric, is_purchase_unit boolean,
        is_sale_unit boolean, allow_fraction boolean
      )
    LOOP
      IF NULLIF(trim(v_unit.name), '') IS NULL OR v_unit.factor IS NULL OR v_unit.factor <= 1 THEN
        RAISE EXCEPTION 'unit name and conversion factor greater than 1 are required';
      END IF;
      IF COALESCE(v_unit.cost_price, 0) < 0 OR COALESCE(v_unit.sale_price, 0) < 0 THEN
        RAISE EXCEPTION 'unit prices cannot be negative';
      END IF;

      IF v_unit.id IS NULL THEN
        INSERT INTO public.product_units (
          tenant_id, product_id, name, name_ar, factor, barcode, cost_price, sale_price,
          is_base, is_purchase_unit, is_sale_unit, allow_fraction
        ) VALUES (
          v_tenant_id, v_product_id, trim(v_unit.name), NULLIF(trim(v_unit.name_ar), ''),
          v_unit.factor, NULLIF(trim(v_unit.barcode), ''),
          COALESCE(v_unit.cost_price, 0), COALESCE(v_unit.sale_price, 0),
          false, COALESCE(v_unit.is_purchase_unit, true),
          COALESCE(v_unit.is_sale_unit, true), COALESCE(v_unit.allow_fraction, false)
        );
      ELSE
        UPDATE public.product_units
        SET name = trim(v_unit.name),
            name_ar = NULLIF(trim(v_unit.name_ar), ''),
            factor = v_unit.factor,
            barcode = NULLIF(trim(v_unit.barcode), ''),
            cost_price = COALESCE(v_unit.cost_price, 0),
            sale_price = COALESCE(v_unit.sale_price, 0),
            is_purchase_unit = COALESCE(v_unit.is_purchase_unit, true),
            is_sale_unit = COALESCE(v_unit.is_sale_unit, true),
            allow_fraction = COALESCE(v_unit.allow_fraction, false)
        WHERE id = v_unit.id
          AND product_id = v_product_id
          AND tenant_id = v_tenant_id;
      END IF;
    END LOOP;
  END IF;

  RETURN v_product_id;
END;
$atomic_product_units$;

REVOKE ALL ON FUNCTION public.save_product_with_units(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_product_with_units(uuid, jsonb, jsonb) TO authenticated;
