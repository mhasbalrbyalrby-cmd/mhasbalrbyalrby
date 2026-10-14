-- Fix the second Anwar (abwahmdalhdashy706@gmail.com) who also has no tenant
DO $$
DECLARE
  v_user_id uuid := '42f4fabb-72b2-4ba0-9da9-cb4a5c0bd53d';
  new_tenant_id uuid;
  admin_role_id uuid;
  tenant_slug text;
  user_name text;
BEGIN
  SELECT tenant_id INTO new_tenant_id FROM profiles WHERE id = v_user_id;
  IF new_tenant_id IS NOT NULL THEN
    RAISE NOTICE 'User already has tenant_id = %, skipping', new_tenant_id;
    RETURN;
  END IF;

  SELECT id INTO admin_role_id FROM roles WHERE name = 'admin' AND is_system = true LIMIT 1;
  SELECT COALESCE(full_name, email) INTO user_name FROM profiles WHERE id = v_user_id;

  tenant_slug := 'org-' || substr(replace(v_user_id::text, '-', ''), 1, 12);
  INSERT INTO tenants (name, slug, status, is_owner)
  VALUES (user_name, tenant_slug, 'active', false)
  RETURNING id INTO new_tenant_id;

  UPDATE profiles SET tenant_id = new_tenant_id WHERE id = v_user_id;

  INSERT INTO tenant_members (tenant_id, user_id, role_id, is_primary, status, joined_at)
  VALUES (new_tenant_id, v_user_id, admin_role_id, true, 'active', now())
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  RAISE NOTICE 'Fixed user %: tenant_id = %, role = admin', v_user_id, new_tenant_id;
END $$;
