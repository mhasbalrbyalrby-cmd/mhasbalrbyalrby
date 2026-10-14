/*
# Invite user to tenant function

## Purpose
Allows a tenant owner/admin to invite a user (by email) to join their tenant
with a specified role. Creates an invited membership (status='invited').

## Changes
1. New function: `invite_user_to_tenant` (SECURITY DEFINER)
   - Looks up the profile by email
   - Checks the caller is a member of the tenant
   - Creates an invited tenant_members row (status='invited')
   - Does NOT link the profile's tenant_id — that happens when the user accepts
   - Returns the membership ID

2. New function: `accept_tenant_invitation` (SECURITY DEFINER)
   - Activates an invited membership for the calling user
   - Links their profile.tenant_id to the tenant

## Security
- Both functions are SECURITY DEFINER
- Only authenticated users can call them
- invite_user_to_tenant verifies the caller is an active member of the tenant
*/

CREATE OR REPLACE FUNCTION public.invite_user_to_tenant(
  p_tenant_id uuid,
  p_email TEXT,
  p_role_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_profile_id uuid;
  v_existing uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify caller is an active member of this tenant
  IF NOT EXISTS (
    SELECT 1 FROM tenant_members
    WHERE tenant_id = p_tenant_id AND user_id = v_caller_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not authorized to invite to this tenant';
  END IF;

  -- Find the user by email
  SELECT id INTO v_profile_id FROM profiles WHERE email = p_email;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'User not found. They must register first.';
  END IF;

  -- Check if already a member
  SELECT id INTO v_existing FROM tenant_members
  WHERE tenant_id = p_tenant_id AND user_id = v_profile_id;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'User is already a member or has a pending invitation';
  END IF;

  -- Create invited membership
  INSERT INTO tenant_members (tenant_id, user_id, role_id, is_primary, status, invited_by, invited_at)
  VALUES (p_tenant_id, v_profile_id, p_role_id, false, 'invited', v_caller_id, now())
  RETURNING id INTO v_existing;

  RETURN v_existing;
END;
$$;

REVOKE ALL ON FUNCTION invite_user_to_tenant(uuid, TEXT, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION invite_user_to_tenant(uuid, TEXT, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_tenant_invitation(
  p_membership_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify this invitation belongs to the calling user and is pending
  SELECT tenant_id INTO v_tenant_id FROM tenant_members
  WHERE id = p_membership_id AND user_id = v_user_id AND status = 'invited';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending invitation found';
  END IF;

  -- Activate the membership
  UPDATE tenant_members SET status = 'active', joined_at = now() WHERE id = p_membership_id;

  -- Link the profile to the tenant
  UPDATE profiles SET tenant_id = v_tenant_id WHERE id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION accept_tenant_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION accept_tenant_invitation(uuid) TO authenticated;
