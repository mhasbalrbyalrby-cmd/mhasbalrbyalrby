-- Phase 3 security hardening. Branch-only until tested against an isolated Supabase project.
-- Never apply this migration to the live database as part of this task.

CREATE OR REPLACE FUNCTION public.invite_user_to_tenant(
  p_tenant_id uuid,
  p_email text,
  p_role_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_profile_id uuid;
  v_membership_id uuid;
  v_caller_authorized boolean := false;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    JOIN public.roles r ON r.id = tm.role_id
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id = v_caller_id
      AND tm.status = 'active'
      AND lower(trim(coalesce(r.name, ''))) IN ('owner', 'admin', 'administrator', 'مالك', 'مدير')
  ) INTO v_caller_authorized;

  IF NOT v_caller_authorized AND NOT public.is_owner_user() THEN
    RAISE EXCEPTION 'Not authorized to invite users to this tenant';
  END IF;

  -- Do not allow assignment of a global/system role or a role belonging to another tenant.
  IF p_role_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.roles r
    WHERE r.id = p_role_id
      AND r.tenant_id = p_tenant_id
      AND r.is_system = false
  ) THEN
    RAISE EXCEPTION 'Role must belong to the target tenant';
  END IF;

  SELECT p.id INTO v_profile_id
  FROM public.profiles p
  WHERE lower(trim(p.email)) = lower(trim(p_email))
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'User not found. They must register first.';
  END IF;

  SELECT tm.id INTO v_membership_id
  FROM public.tenant_members tm
  WHERE tm.tenant_id = p_tenant_id AND tm.user_id = v_profile_id;

  IF v_membership_id IS NOT NULL THEN
    RAISE EXCEPTION 'User is already a member or has a pending invitation';
  END IF;

  INSERT INTO public.tenant_members
    (tenant_id, user_id, role_id, is_primary, status, invited_by, invited_at)
  VALUES
    (p_tenant_id, v_profile_id, p_role_id, false, 'invited', v_caller_id, now())
  RETURNING id INTO v_membership_id;

  RETURN v_membership_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invite_user_to_tenant(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_user_to_tenant(uuid, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_tenant_invitation(p_membership_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_profile_tenant_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT tm.tenant_id INTO v_tenant_id
  FROM public.tenant_members tm
  WHERE tm.id = p_membership_id
    AND tm.user_id = v_user_id
    AND tm.status = 'invited'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending invitation found for the current user';
  END IF;

  SELECT p.tenant_id INTO v_profile_tenant_id
  FROM public.profiles p
  WHERE p.id = v_user_id
  FOR UPDATE;

  -- This app currently resolves one primary tenant from profiles. Do not silently
  -- switch an already-linked account to another tenant by accepting an invitation.
  IF v_profile_tenant_id IS NOT NULL AND v_profile_tenant_id <> v_tenant_id THEN
    RAISE EXCEPTION 'Account is already linked to another tenant';
  END IF;

  UPDATE public.tenant_members
  SET status = 'active', joined_at = now()
  WHERE id = p_membership_id
    AND user_id = v_user_id
    AND status = 'invited';

  UPDATE public.profiles
  SET tenant_id = v_tenant_id
  WHERE id = v_user_id AND tenant_id IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_tenant_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invitation(uuid) TO authenticated;
