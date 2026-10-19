-- Protect the primary System Owner tenant, membership, and role.
-- This migration is committed to the repair branch only; it is not applied to production by this commit.

CREATE OR REPLACE FUNCTION public.is_owner_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    JOIN public.tenants t
      ON t.id = tm.tenant_id
     AND t.is_owner IS TRUE
    JOIN public.roles r
      ON r.id = tm.role_id
     AND r.name = 'owner'
     AND r.is_system IS TRUE
    WHERE tm.user_id = auth.uid()
      AND tm.is_primary IS TRUE
      AND tm.status = 'active'
  );
$function$;

REVOKE ALL ON FUNCTION public.is_owner_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_owner_user() TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_system_owner_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  -- Once the primary owner tenant exists, no ordinary update may promote
  -- another tenant into a second System Owner tenant.
  IF OLD.is_owner IS NOT TRUE AND TG_OP = 'UPDATE' AND NEW.is_owner IS TRUE THEN
    RAISE EXCEPTION 'A second System Owner tenant cannot be created by updating a tenant.'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.is_owner IS TRUE THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'The primary System Owner tenant cannot be deleted.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.is_owner IS DISTINCT FROM TRUE
       OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'The primary System Owner tenant identity and status are protected.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_system_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_is_owner_tenant boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = NEW.tenant_id AND t.is_owner IS TRUE
    ) INTO v_is_owner_tenant;

    IF v_is_owner_tenant AND NEW.is_primary IS TRUE THEN
      RAISE EXCEPTION 'A second primary membership cannot be assigned to the protected System Owner tenant.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = OLD.tenant_id AND t.is_owner IS TRUE
  ) AND OLD.is_primary IS TRUE
  INTO v_is_owner_tenant;

  -- Prevent promoting another membership into a second primary owner membership.
  IF TG_OP = 'UPDATE' AND NEW.is_primary IS TRUE THEN
    IF EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = NEW.tenant_id AND t.is_owner IS TRUE
    ) AND NOT v_is_owner_tenant THEN
      RAISE EXCEPTION 'A second primary membership cannot be assigned to the System Owner tenant.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_is_owner_tenant THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'The primary System Owner membership cannot be deleted.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.role_id IS DISTINCT FROM OLD.role_id
       OR NEW.is_primary IS DISTINCT FROM TRUE
       OR NEW.status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'The primary System Owner membership and role are protected.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_system_owner_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_is_protected_role boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    JOIN public.tenants t ON t.id = tm.tenant_id AND t.is_owner IS TRUE
    WHERE tm.role_id = OLD.id
      AND tm.is_primary IS TRUE
      AND tm.status = 'active'
  ) INTO v_is_protected_role;

  IF v_is_protected_role THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'The role assigned to the primary System Owner cannot be deleted.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.name IS DISTINCT FROM 'owner'
       OR NEW.is_system IS DISTINCT FROM TRUE
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
      RAISE EXCEPTION 'The role assigned to the primary System Owner is protected.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_system_owner_tenant ON public.tenants;
CREATE TRIGGER trg_guard_system_owner_tenant
BEFORE UPDATE OR DELETE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.guard_system_owner_tenant();

DROP TRIGGER IF EXISTS trg_guard_system_owner_membership ON public.tenant_members;
CREATE TRIGGER trg_guard_system_owner_membership
BEFORE INSERT OR UPDATE OR DELETE ON public.tenant_members
FOR EACH ROW EXECUTE FUNCTION public.guard_system_owner_membership();

DROP TRIGGER IF EXISTS trg_guard_system_owner_role ON public.roles;
CREATE TRIGGER trg_guard_system_owner_role
BEFORE UPDATE OR DELETE ON public.roles
FOR EACH ROW EXECUTE FUNCTION public.guard_system_owner_role();

REVOKE ALL ON FUNCTION public.guard_system_owner_tenant() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_system_owner_membership() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_system_owner_role() FROM PUBLIC;

-- Protect the profile linked to the active primary membership of the System Owner.
-- Display/contact fields remain editable; identity, tenant association, active state,
-- and deletion are not available through ordinary profile operations.
CREATE OR REPLACE FUNCTION public.guard_system_owner_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_is_primary_system_owner boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    JOIN public.tenants t ON t.id = tm.tenant_id
    WHERE tm.user_id = OLD.id
      AND tm.is_primary IS TRUE
      AND tm.status = 'active'
      AND t.is_owner IS TRUE
  ) INTO v_is_primary_system_owner;

  IF v_is_primary_system_owner THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'The primary System Owner profile cannot be deleted.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'The primary System Owner profile identity, tenant, and active status are protected.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_system_owner_profile ON public.profiles;
CREATE TRIGGER trg_guard_system_owner_profile
BEFORE UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_system_owner_profile();

REVOKE ALL ON FUNCTION public.guard_system_owner_profile() FROM PUBLIC;

-- Keep the primary System Owner role's permission grants from being removed or
-- reassigned through ordinary API operations.
CREATE OR REPLACE FUNCTION public.guard_system_owner_role_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    JOIN public.tenants t ON t.id = tm.tenant_id AND t.is_owner IS TRUE
    WHERE tm.role_id = OLD.role_id
      AND tm.is_primary IS TRUE
      AND tm.status = 'active'
  ) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Permissions assigned to the primary System Owner role cannot be removed.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.role_id IS DISTINCT FROM OLD.role_id
       OR NEW.permission_id IS DISTINCT FROM OLD.permission_id THEN
      RAISE EXCEPTION 'Permissions assigned to the primary System Owner role cannot be reassigned.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_system_owner_role_permissions ON public.role_permissions;
CREATE TRIGGER trg_guard_system_owner_role_permissions
BEFORE UPDATE OR DELETE ON public.role_permissions
FOR EACH ROW EXECUTE FUNCTION public.guard_system_owner_role_permissions();

REVOKE ALL ON FUNCTION public.guard_system_owner_role_permissions() FROM PUBLIC;
