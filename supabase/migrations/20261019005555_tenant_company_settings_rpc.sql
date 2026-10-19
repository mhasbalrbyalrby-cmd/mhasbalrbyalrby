-- Allow a tenant's authorized primary/admin member to update only company-facing fields.
-- Keep subscription, ownership, status, slug, limits, and other tenant metadata owner-controlled.
CREATE OR REPLACE FUNCTION public.update_current_tenant_company_settings(
  p_tenant_id uuid,
  p_name text,
  p_name_ar text,
  p_phone text,
  p_address text,
  p_base_currency text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_saved public.tenants%ROWTYPE;
  v_currency text := upper(trim(coalesce(p_base_currency, '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_tenant_id IS NULL OR nullif(trim(coalesce(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Tenant and company name are required' USING ERRCODE = '22023';
  END IF;

  IF v_currency NOT IN ('SAR', 'YER', 'USD', 'AED', 'EGP') THEN
    RAISE EXCEPTION 'Unsupported base currency' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    JOIN public.tenants t ON t.id = tm.tenant_id
    LEFT JOIN public.roles r ON r.id = tm.role_id
    WHERE tm.user_id = auth.uid()
      AND tm.tenant_id = p_tenant_id
      AND tm.status = 'active'
      AND t.is_owner = false
      AND (
        tm.is_primary = true
        OR lower(coalesce(r.name, '')) IN ('owner', 'admin')
      )
  ) THEN
    RAISE EXCEPTION 'You are not authorized to update this tenant company profile' USING ERRCODE = '42501';
  END IF;

  UPDATE public.tenants t
  SET name = trim(p_name),
      name_ar = nullif(trim(coalesce(p_name_ar, '')), ''),
      settings = coalesce(t.settings, '{}'::jsonb) || jsonb_build_object(
        'phone', coalesce(p_phone, ''),
        'address', coalesce(p_address, ''),
        'base_currency', v_currency
      ),
      updated_at = now()
  WHERE t.id = p_tenant_id
    AND t.is_owner = false
  RETURNING t.* INTO v_saved;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant company profile was not saved' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'id', v_saved.id,
    'name', v_saved.name,
    'name_ar', v_saved.name_ar,
    'settings', v_saved.settings,
    'updated_at', v_saved.updated_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_current_tenant_company_settings(uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_current_tenant_company_settings(uuid, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_current_tenant_company_settings(uuid, text, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.update_current_tenant_company_settings(uuid, text, text, text, text, text)
IS 'Updates only company name and operational contact/currency settings for an authorized active member of a non-owner tenant.';
