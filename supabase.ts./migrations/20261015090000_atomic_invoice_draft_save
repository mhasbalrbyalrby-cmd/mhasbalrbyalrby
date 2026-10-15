
-- محاسب الربيع العربي
-- Atomic invoice draft creation: invoice header + all lines in one transaction.
-- This migration is prepared for review only; it has NOT been applied.

CREATE OR REPLACE FUNCTION public.create_invoice_draft_atomic(
  p_invoice jsonb,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_profile_active boolean;
  v_invoice_id uuid;
  v_invoice_number text;
  v_invoice_type text;
  v_party_id uuid;
  v_warehouse_id uuid;
  v_shift_id uuid;
  v_invoice_date date;
  v_due_date date;
  v_currency text;
  v_notes text;
  v_invoice_discount numeric := 0;
  v_subtotal numeric := 0;
  v_after_discount numeric := 0;
  v_tax_amount numeric := 0;
  v_total numeric := 0;
  v_quantity numeric;
  v_unit_price numeric;
  v_line_discount numeric;
  v_line_total numeric;
  v_line_count integer := 0;
  v_item record;
  v_line jsonb;
  v_product_id uuid;
  v_description text;
BEGIN
  -- Authentication and active profile
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT p.tenant_id, p.is_active
    INTO v_tenant_id, v_profile_active
  FROM public.profiles AS p
  WHERE p.id = v_user_id;

  IF v_tenant_id IS NULL OR v_profile_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'active_tenant_profile_required';
  END IF;

  IF NOT public.is_tenant_member(v_tenant_id) THEN
    RAISE EXCEPTION 'active_tenant_membership_required';
  END IF;

  IF p_invoice IS NULL OR jsonb_typeof(p_invoice) <> 'object' THEN
    RAISE EXCEPTION 'invalid_invoice_payload';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'invoice_lines_must_be_an_array';
  END IF;

  v_line_count := jsonb_array_length(p_lines);
  IF v_line_count < 1 OR v_line_count > 500 THEN
    RAISE EXCEPTION 'invoice_must_have_between_1_and_500_lines';
  END IF;

  v_invoice_number := nullif(trim(p_invoice->>'invoice_number'), '');
  v_invoice_type := p_invoice->>'type';
  v_party_id := nullif(p_invoice->>'party_id', '')::uuid;
  v_warehouse_id := nullif(p_invoice->>'warehouse_id', '')::uuid;
  v_shift_id := nullif(p_invoice->>'shift_id', '')::uuid;
  v_invoice_date := coalesce(nullif(p_invoice->>'date', '')::date, CURRENT_DATE);
  v_due_date := nullif(p_invoice->>'due_date', '')::date;
  v_currency := coalesce(nullif(trim(p_invoice->>'currency'), ''), 'SAR');
  v_notes := nullif(trim(coalesce(p_invoice->>'notes', '')), '');
  v_invoice_discount := round(
    coalesce(nullif(p_invoice->>'discount_amount', '')::numeric, 0), 2
  );

  IF v_invoice_number IS NULL THEN
    RAISE EXCEPTION 'invoice_number_required';
  END IF;

  IF v_invoice_type NOT IN ('sale', 'purchase', 'return_sale', 'return_purchase') THEN
    RAISE EXCEPTION 'invalid_invoice_type';
  END IF;

  IF v_party_id IS NULL THEN
    RAISE EXCEPTION 'party_required';
  END IF;

  IF v_invoice_discount < 0 THEN
    RAISE EXCEPTION 'invoice_discount_cannot_be_negative';
  END IF;

  -- The contact must belong to the caller's tenant.
  IF NOT EXISTS (
    SELECT 1
    FROM public.parties AS p
    WHERE p.id = v_party_id
      AND p.tenant_id = v_tenant_id
      AND p.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'party_not_found_or_inactive_in_tenant';
  END IF;

  IF v_warehouse_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.warehouses AS w
    WHERE w.id = v_warehouse_id
      AND w.tenant_id = v_tenant_id
      AND w.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'warehouse_not_found_or_inactive_in_tenant';
  END IF;

  IF v_shift_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.shifts AS s
    WHERE s.id = v_shift_id
      AND s.tenant_id = v_tenant_id
      AND s.status = 'open'
  ) THEN
    RAISE EXCEPTION 'shift_not_found_or_not_open_in_tenant';
  END IF;

  -- Validate and calculate every line before inserting anything.
  FOR v_item IN
    SELECT value, ordinality
    FROM jsonb_array_elements(p_lines) WITH ORDINALITY
  LOOP
    v_line := v_item.value;

    IF jsonb_typeof(v_line) <> 'object' THEN
      RAISE EXCEPTION 'each_invoice_line_must_be_an_object';
    END IF;

    v_product_id := nullif(v_line->>'product_id', '')::uuid;
    v_description := nullif(trim(coalesce(v_line->>'description', '')), '');

    v_quantity := coalesce(nullif(v_line->>'quantity', '')::numeric, 1);
    v_unit_price := coalesce(nullif(v_line->>'unit_price', '')::numeric, 0);
    v_line_discount := round(
      coalesce(nullif(v_line->>'discount_amount', '')::numeric, 0), 2
    );

    IF v_quantity <= 0 OR v_unit_price < 0 OR v_line_discount < 0 THEN
      RAISE EXCEPTION 'invalid_quantity_price_or_line_discount';
    END IF;

    IF v_product_id IS NULL AND v_description IS NULL THEN
      RAISE EXCEPTION 'each_line_needs_a_product_or_description';
    END IF;

    IF v_product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.products AS p
      WHERE p.id = v_product_id
        AND p.tenant_id = v_tenant_id
        AND p.is_active IS TRUE
    ) THEN
      RAISE EXCEPTION 'product_not_found_or_inactive_in_tenant';
    END IF;

    IF v_line_discount > round(v_quantity * v_unit_price, 2) THEN
      RAISE EXCEPTION 'line_discount_exceeds_line_amount';
    END IF;

    v_line_total := round(v_quantity * v_unit_price - v_line_discount, 2);
    v_subtotal := v_subtotal + v_line_total;
  END LOOP;

  v_subtotal := round(v_subtotal, 2);

  IF v_invoice_discount > v_subtotal THEN
    RAISE EXCEPTION 'invoice_discount_exceeds_subtotal';
  END IF;

  v_after_discount := round(v_subtotal - v_invoice_discount, 2);

  -- Preserves the current page's tax behavior.
  IF v_invoice_type IN ('sale', 'return_sale') THEN
    v_tax_amount := round(v_after_discount * 0.15, 2);
  ELSE
    v_tax_amount := 0;
  END IF;

  v_total := round(v_after_discount + v_tax_amount, 2);

  -- Header and lines are in the same database transaction.
  INSERT INTO public.invoices (
    tenant_id, invoice_number, type, party_id, date, due_date,
    currency, subtotal, discount_amount, tax_amount, total,
    status, notes, warehouse_id, shift_id, created_by
  )
  VALUES (
    v_tenant_id, v_invoice_number, v_invoice_type, v_party_id,
    v_invoice_date, v_due_date, v_currency, v_subtotal,
    v_invoice_discount, v_tax_amount, v_total,
    'draft', v_notes, v_warehouse_id, v_shift_id, v_user_id
  )
  RETURNING id INTO v_invoice_id;

  FOR v_item IN
    SELECT value, ordinality
    FROM jsonb_array_elements(p_lines) WITH ORDINALITY
  LOOP
    v_line := v_item.value;
    v_product_id := nullif(v_line->>'product_id', '')::uuid;
    v_description := nullif(trim(coalesce(v_line->>'description', '')), '');
    v_quantity := coalesce(nullif(v_line->>'quantity', '')::numeric, 1);
    v_unit_price := coalesce(nullif(v_line->>'unit_price', '')::numeric, 0);
    v_line_discount := round(
      coalesce(nullif(v_line->>'discount_amount', '')::numeric, 0), 2
    );
    v_line_total := round(v_quantity * v_unit_price - v_line_discount, 2);

    INSERT INTO public.invoice_lines (
      invoice_id, tenant_id, product_id, description,
      quantity, unit_price, discount_amount, discount_percentage,
      line_total, line_order
    )
    VALUES (
      v_invoice_id, v_tenant_id, v_product_id, v_description,
      v_quantity, v_unit_price, v_line_discount, 0,
      v_line_total, (v_item.ordinality - 1)::integer
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'subtotal', v_subtotal,
    'discount_amount', v_invoice_discount,
    'tax_amount', v_tax_amount,
    'total', v_total,
    'line_count', v_line_count
  );
END;
$function$;

-- Restrict who can call this RPC.
REVOKE ALL ON FUNCTION public.create_invoice_draft_atomic(jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_invoice_draft_atomic(jsonb, jsonb)
  TO authenticated;
