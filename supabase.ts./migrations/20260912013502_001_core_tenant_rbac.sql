/*
# Core Foundation: Tenants, Users, RBAC, and Multi-Tenant Isolation

## Overview
This migration creates the foundational architecture for "محاسب الربيع العربي" (Arab Spring Accountant) —
a multi-tenant SaaS ERP system. It establishes tenant isolation, user management, role-based access control (RBAC),
and the owner control center infrastructure.

## New Tables
1. tenants — tenant/business entities with subscription status
2. subscription_plans — available subscription tiers
3. profiles — user profiles linked to Supabase auth
4. roles — system and tenant-customized roles
5. permissions — granular permission codes per module
6. role_permissions — many-to-many role/permission mapping
7. tenant_members — user membership in tenants with roles
8. modules — ERP modules (accounting, inventory, exchange, etc.)
9. tenant_modules — which modules are enabled per tenant

## Security (RLS)
- All tables have RLS enabled
- Tenant isolation via is_tenant_member() helper function
- Owner tenant access via is_owner_user() helper function
- All tenant-scoped tables filter by tenant_id through membership checks

## Helper Functions
- get_current_tenant_id() — reads tenant_id from JWT custom claim
- is_tenant_member(uuid) — checks if current user belongs to a tenant
- is_owner_user() — checks if current user is in the owner tenant
*/

-- ============================================================
-- 1. TENANTS
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_ar text,
  slug text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'trial', 'active', 'suspended', 'expired', 'cancelled')),
  trial_ends_at timestamptz,
  subscription_ends_at timestamptz,
  plan_id uuid,
  is_owner boolean NOT NULL DEFAULT false,
  max_users int NOT NULL DEFAULT 10,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. SUBSCRIPTION PLANS
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_ar text,
  code text UNIQUE NOT NULL,
  price_monthly numeric(12,2) NOT NULL DEFAULT 0,
  price_yearly numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  trial_days int NOT NULL DEFAULT 14,
  max_users int NOT NULL DEFAULT 10,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  full_name text,
  full_name_ar text,
  email text,
  phone text,
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. ROLES
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_ar text,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. PERMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  name_ar text,
  module text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. ROLE_PERMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. TENANT_MEMBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id uuid REFERENCES roles(id) ON DELETE SET NULL,
  is_primary boolean NOT NULL DEFAULT false,
  invited_by uuid REFERENCES profiles(id),
  invited_at timestamptz,
  joined_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended', 'left')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. MODULES
-- ============================================================
CREATE TABLE IF NOT EXISTS modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  name_ar text,
  description text,
  icon text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE modules ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 9. TENANT_MODULES
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_modules (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  enabled_at timestamptz,
  enabled_by uuid REFERENCES profiles(id),
  PRIMARY KEY (tenant_id, module_id)
);

ALTER TABLE tenant_modules ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION get_current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (auth.jwt() -> 'tenant_id')::text::uuid;
$$;

CREATE OR REPLACE FUNCTION is_tenant_member(check_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_members tm
    WHERE tm.tenant_id = check_tenant_id
    AND tm.user_id = auth.uid()
    AND tm.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION is_owner_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_members tm
    JOIN tenants t ON t.id = tm.tenant_id
    WHERE tm.user_id = auth.uid()
    AND tm.status = 'active'
    AND t.is_owner = true
  );
$$;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- Tenants: users can see tenants they belong to; owner users can see all
DROP POLICY IF EXISTS "select_tenants_as_member" ON tenants;
CREATE POLICY "select_tenants_as_member" ON tenants FOR SELECT
  TO authenticated USING (
    is_owner_user() OR is_tenant_member(tenants.id)
  );

DROP POLICY IF EXISTS "owner_manage_tenants" ON tenants;
CREATE POLICY "owner_manage_tenants" ON tenants FOR ALL
  TO authenticated USING (is_owner_user()) WITH CHECK (is_owner_user());

-- Subscription plans: readable by all authenticated users
DROP POLICY IF EXISTS "select_subscription_plans" ON subscription_plans;
CREATE POLICY "select_subscription_plans" ON subscription_plans FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "owner_manage_plans" ON subscription_plans;
CREATE POLICY "owner_manage_plans" ON subscription_plans FOR ALL
  TO authenticated USING (is_owner_user()) WITH CHECK (is_owner_user());

-- Profiles: users can see their own profile + profiles in their tenants
DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS "select_tenant_profiles" ON profiles;
CREATE POLICY "select_tenant_profiles" ON profiles FOR SELECT
  TO authenticated USING (
    tenant_id IS NOT NULL AND is_tenant_member(tenant_id)
  );

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "owner_manage_profiles" ON profiles;
CREATE POLICY "owner_manage_profiles" ON profiles FOR ALL
  TO authenticated USING (is_owner_user()) WITH CHECK (is_owner_user());

DROP POLICY IF EXISTS "insert_tenant_profiles" ON profiles;
CREATE POLICY "insert_tenant_profiles" ON profiles FOR INSERT
  TO authenticated WITH CHECK (
    is_owner_user() OR (tenant_id IS NOT NULL AND is_tenant_member(tenant_id))
  );

-- Roles: system roles visible to all; tenant roles visible within tenant
DROP POLICY IF EXISTS "select_system_roles" ON roles;
CREATE POLICY "select_system_roles" ON roles FOR SELECT
  TO authenticated USING (is_system = true);

DROP POLICY IF EXISTS "select_tenant_roles" ON roles;
CREATE POLICY "select_tenant_roles" ON roles FOR SELECT
  TO authenticated USING (
    tenant_id IS NOT NULL AND is_tenant_member(tenant_id)
  );

DROP POLICY IF EXISTS "owner_manage_roles" ON roles;
CREATE POLICY "owner_manage_roles" ON roles FOR ALL
  TO authenticated USING (is_owner_user()) WITH CHECK (is_owner_user());

DROP POLICY IF EXISTS "manage_tenant_roles" ON roles;
CREATE POLICY "manage_tenant_roles" ON roles FOR ALL
  TO authenticated USING (
    tenant_id IS NOT NULL AND is_tenant_member(tenant_id)
  ) WITH CHECK (
    tenant_id IS NOT NULL AND is_tenant_member(tenant_id)
  );

-- Permissions: readable by all authenticated users
DROP POLICY IF EXISTS "select_permissions" ON permissions;
CREATE POLICY "select_permissions" ON permissions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "owner_manage_permissions" ON permissions;
CREATE POLICY "owner_manage_permissions" ON permissions FOR ALL
  TO authenticated USING (is_owner_user()) WITH CHECK (is_owner_user());

-- Role permissions: readable by authenticated users
DROP POLICY IF EXISTS "select_role_permissions" ON role_permissions;
CREATE POLICY "select_role_permissions" ON role_permissions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "owner_manage_role_permissions" ON role_permissions;
CREATE POLICY "owner_manage_role_permissions" ON role_permissions FOR ALL
  TO authenticated USING (is_owner_user()) WITH CHECK (is_owner_user());

-- Tenant members: visible to members of the same tenant
DROP POLICY IF EXISTS "select_tenant_members" ON tenant_members;
CREATE POLICY "select_tenant_members" ON tenant_members FOR SELECT
  TO authenticated USING (
    is_owner_user() OR is_tenant_member(tenant_id)
  );

DROP POLICY IF EXISTS "owner_manage_tenant_members" ON tenant_members;
CREATE POLICY "owner_manage_tenant_members" ON tenant_members FOR ALL
  TO authenticated USING (is_owner_user()) WITH CHECK (is_owner_user());

DROP POLICY IF EXISTS "manage_tenant_members" ON tenant_members;
CREATE POLICY "manage_tenant_members" ON tenant_members FOR ALL
  TO authenticated USING (
    is_tenant_member(tenant_id)
  ) WITH CHECK (
    is_tenant_member(tenant_id)
  );

-- Modules: readable by all authenticated users
DROP POLICY IF EXISTS "select_modules" ON modules;
CREATE POLICY "select_modules" ON modules FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "owner_manage_modules" ON modules;
CREATE POLICY "owner_manage_modules" ON modules FOR ALL
  TO authenticated USING (is_owner_user()) WITH CHECK (is_owner_user());

-- Tenant modules: visible to tenant members
DROP POLICY IF EXISTS "select_tenant_modules" ON tenant_modules;
CREATE POLICY "select_tenant_modules" ON tenant_modules FOR SELECT
  TO authenticated USING (
    is_owner_user() OR is_tenant_member(tenant_id)
  );

DROP POLICY IF EXISTS "owner_manage_tenant_modules" ON tenant_modules;
CREATE POLICY "owner_manage_tenant_modules" ON tenant_modules FOR ALL
  TO authenticated USING (is_owner_user()) WITH CHECK (is_owner_user());

DROP POLICY IF EXISTS "manage_tenant_modules" ON tenant_modules;
CREATE POLICY "manage_tenant_modules" ON tenant_modules FOR ALL
  TO authenticated USING (
    is_tenant_member(tenant_id)
  ) WITH CHECK (
    is_tenant_member(tenant_id)
  );

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_is_owner ON tenants(is_owner) WHERE is_owner = true;
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id ON profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_roles_tenant_id ON roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_id ON tenant_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user_id ON tenant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_modules_tenant_id ON tenant_modules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module);

-- ============================================================
-- SEED DATA
-- ============================================================

-- Owner tenant
INSERT INTO tenants (name, name_ar, slug, status, is_owner, max_users, settings)
SELECT 'System Owner', 'مالك النظام', 'system-owner', 'active', true, 5, '{}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE is_owner = true);

-- Subscription plans
INSERT INTO subscription_plans (name, name_ar, code, price_monthly, price_yearly, currency, trial_days, max_users, features, is_active, sort_order)
SELECT 'Starter', 'الباقة المبتدئة', 'starter', 99, 990, 'SAR', 14, 5, '{"modules": ["accounting", "invoices", "contacts"]}'::jsonb, true, 1
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE code = 'starter');

INSERT INTO subscription_plans (name, name_ar, code, price_monthly, price_yearly, currency, trial_days, max_users, features, is_active, sort_order)
SELECT 'Professional', 'الباقة الاحترافية', 'professional', 299, 2990, 'SAR', 14, 20, '{"modules": ["accounting", "invoices", "contacts", "inventory", "reports", "exchange"]}'::jsonb, true, 2
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE code = 'professional');

INSERT INTO subscription_plans (name, name_ar, code, price_monthly, price_yearly, currency, trial_days, max_users, features, is_active, sort_order)
SELECT 'Enterprise', 'الباقة المؤسسية', 'enterprise', 599, 5990, 'SAR', 14, 100, '{"modules": ["all"]}'::jsonb, true, 3
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE code = 'enterprise');

-- System roles
INSERT INTO roles (tenant_id, name, name_ar, description, is_system, sort_order)
SELECT NULL, 'owner', 'مالك', 'System owner with full access', true, 1
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'owner' AND is_system = true);

INSERT INTO roles (tenant_id, name, name_ar, description, is_system, sort_order)
SELECT NULL, 'admin', 'مدير', 'Tenant administrator', true, 2
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'admin' AND is_system = true);

INSERT INTO roles (tenant_id, name, name_ar, description, is_system, sort_order)
SELECT NULL, 'accountant', 'محاسب', 'Accountant role', true, 3
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'accountant' AND is_system = true);

INSERT INTO roles (tenant_id, name, name_ar, description, is_system, sort_order)
SELECT NULL, 'manager', 'مدير', 'Manager role', true, 4
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'manager' AND is_system = true);

INSERT INTO roles (tenant_id, name, name_ar, description, is_system, sort_order)
SELECT NULL, 'sales', 'مبيعات', 'Sales role', true, 5
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'sales' AND is_system = true);

INSERT INTO roles (tenant_id, name, name_ar, description, is_system, sort_order)
SELECT NULL, 'purchasing', 'مشتريات', 'Purchasing role', true, 6
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'purchasing' AND is_system = true);

INSERT INTO roles (tenant_id, name, name_ar, description, is_system, sort_order)
SELECT NULL, 'warehouse', 'مخزون', 'Warehouse role', true, 7
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'warehouse' AND is_system = true);

INSERT INTO roles (tenant_id, name, name_ar, description, is_system, sort_order)
SELECT NULL, 'cashier', 'كاشير', 'Cashier role', true, 8
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'cashier' AND is_system = true);

INSERT INTO roles (tenant_id, name, name_ar, description, is_system, sort_order)
SELECT NULL, 'exchange_agent', 'وكيل صرافة', 'Exchange agent role', true, 9
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'exchange_agent' AND is_system = true);

INSERT INTO roles (tenant_id, name, name_ar, description, is_system, sort_order)
SELECT NULL, 'auditor', 'مراجع', 'Auditor role', true, 10
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'auditor' AND is_system = true);

INSERT INTO roles (tenant_id, name, name_ar, description, is_system, sort_order)
SELECT NULL, 'employee', 'موظف', 'Employee role', true, 11
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'employee' AND is_system = true);

-- Permissions
INSERT INTO permissions (code, name, name_ar, module, description)
SELECT * FROM (VALUES
  ('dashboard.view', 'View Dashboard', 'عرض لوحة التحكم', 'dashboard', 'Access to dashboard'),
  ('contacts.view', 'View Contacts', 'عرض جهات الاتصال', 'contacts', 'View customers, suppliers, employees'),
  ('contacts.create', 'Create Contact', 'إنشاء جهة اتصال', 'contacts', 'Create new contact'),
  ('contacts.edit', 'Edit Contact', 'تعديل جهة اتصال', 'contacts', 'Edit existing contact'),
  ('contacts.delete', 'Delete Contact', 'حذف جهة اتصال', 'contacts', 'Delete contact'),
  ('invoices.view', 'View Invoices', 'عرض الفواتير', 'invoices', 'View invoices'),
  ('invoices.create', 'Create Invoice', 'إنشاء فاتورة', 'invoices', 'Create new invoice'),
  ('invoices.edit', 'Edit Invoice', 'تعديل فاتورة', 'invoices', 'Edit unposted invoice'),
  ('invoices.delete', 'Delete Invoice', 'حذف فاتورة', 'invoices', 'Delete invoice'),
  ('invoices.post', 'Post Invoice', 'ترحيل فاتورة', 'invoices', 'Post invoice to accounting'),
  ('invoices.cancel', 'Cancel Invoice', 'إلغاء فاتورة', 'invoices', 'Cancel posted invoice'),
  ('receipts.view', 'View Receipts', 'عرض السندات', 'receipts', 'View receipts and payments'),
  ('receipts.create', 'Create Receipt', 'إنشاء سند', 'receipts', 'Create receipt or payment'),
  ('receipts.edit', 'Edit Receipt', 'تعديل سند', 'receipts', 'Edit unposted receipt'),
  ('receipts.delete', 'Delete Receipt', 'حذف سند', 'receipts', 'Delete receipt'),
  ('receipts.post', 'Post Receipt', 'ترحيل سند', 'receipts', 'Post receipt to accounting'),
  ('accounting.view', 'View Accounting', 'عرض المحاسبة', 'accounting', 'View chart of accounts and journals'),
  ('accounting.create', 'Create Journal', 'إنشاء قيد', 'accounting', 'Create journal entries'),
  ('accounting.edit', 'Edit Journal', 'تعديل قيد', 'accounting', 'Edit unposted journal'),
  ('accounting.delete', 'Delete Journal', 'حذف قيد', 'accounting', 'Delete journal entry'),
  ('accounting.post', 'Post Journal', 'ترحيل قيد', 'accounting', 'Post journal entry'),
  ('accounting.approve', 'Approve Journal', 'اعتماد قيد', 'accounting', 'Approve journal entry'),
  ('inventory.view', 'View Inventory', 'عرض المخزون', 'inventory', 'View products and stock'),
  ('inventory.create', 'Create Item', 'إنشاء صنف', 'inventory', 'Create product/item'),
  ('inventory.edit', 'Edit Item', 'تعديل صنف', 'inventory', 'Edit product/item'),
  ('inventory.delete', 'Delete Item', 'حذف صنف', 'inventory', 'Delete product/item'),
  ('inventory.adjust', 'Adjust Stock', 'تسوية مخزون', 'inventory', 'Stock adjustments'),
  ('inventory.transfer', 'Transfer Stock', 'تحويل مخزون', 'inventory', 'Transfer between warehouses'),
  ('reports.view', 'View Reports', 'عرض التقارير', 'reports', 'View financial reports'),
  ('reports.export', 'Export Reports', 'تصدير التقارير', 'reports', 'Export to Excel/PDF'),
  ('settings.view', 'View Settings', 'عرض الإعدادات', 'settings', 'View tenant settings'),
  ('settings.edit', 'Edit Settings', 'تعديل الإعدادات', 'settings', 'Edit tenant settings'),
  ('users.view', 'View Users', 'عرض المستخدمين', 'users', 'View tenant users'),
  ('users.create', 'Create User', 'إنشاء مستخدم', 'users', 'Invite new user'),
  ('users.edit', 'Edit User', 'تعديل مستخدم', 'users', 'Edit user role/status'),
  ('users.delete', 'Delete User', 'حذف مستخدم', 'users', 'Remove user from tenant'),
  ('permissions.manage', 'Manage Permissions', 'إدارة الصلاحيات', 'users', 'Manage roles and permissions'),
  ('exchange.view', 'View Transfers', 'عرض الحوالات', 'exchange', 'View money transfers'),
  ('exchange.create', 'Create Transfer', 'إنشاء حوالة', 'exchange', 'Create new transfer'),
  ('exchange.edit', 'Edit Transfer', 'تعديل حوالة', 'exchange', 'Edit transfer'),
  ('exchange.cancel', 'Cancel Transfer', 'إلغاء حوالة', 'exchange', 'Cancel transfer'),
  ('shifts.view', 'View Shifts', 'عرض الورديات', 'shifts', 'View work shifts'),
  ('shifts.manage', 'Manage Shifts', 'إدارة الورديات', 'shifts', 'Open/close shifts'),
  ('audit.view', 'View Audit Log', 'عرض سجل التدقيق', 'audit', 'View audit trail'),
  ('owner.panel', 'Owner Panel Access', 'لوحة المالك', 'owner', 'Access to owner control center')
) AS t(code, name, name_ar, module, description)
WHERE NOT EXISTS (SELECT 1 FROM permissions);

-- Modules
INSERT INTO modules (code, name, name_ar, description, icon, sort_order, is_active)
SELECT 'dashboard', 'Dashboard', 'لوحة التحكم', 'Main dashboard', 'LayoutDashboard', 1, true
WHERE NOT EXISTS (SELECT 1 FROM modules WHERE code = 'dashboard');

INSERT INTO modules (code, name, name_ar, description, icon, sort_order, is_active)
SELECT 'contacts', 'Contacts', 'جهات الاتصال', 'Customers, suppliers, employees', 'Users', 2, true
WHERE NOT EXISTS (SELECT 1 FROM modules WHERE code = 'contacts');

INSERT INTO modules (code, name, name_ar, description, icon, sort_order, is_active)
SELECT 'invoices', 'Invoices', 'الفواتير', 'Sales and purchase invoices', 'FileText', 3, true
WHERE NOT EXISTS (SELECT 1 FROM modules WHERE code = 'invoices');

INSERT INTO modules (code, name, name_ar, description, icon, sort_order, is_active)
SELECT 'receipts', 'Receipts & Payments', 'السندات', 'Receipts and payment vouchers', 'Receipt', 4, true
WHERE NOT EXISTS (SELECT 1 FROM modules WHERE code = 'receipts');

INSERT INTO modules (code, name, name_ar, description, icon, sort_order, is_active)
SELECT 'accounting', 'Accounting', 'المحاسبة', 'Chart of accounts and journal entries', 'Calculator', 5, true
WHERE NOT EXISTS (SELECT 1 FROM modules WHERE code = 'accounting');

INSERT INTO modules (code, name, name_ar, description, icon, sort_order, is_active)
SELECT 'inventory', 'Inventory', 'المخزون', 'Products, warehouses, stock', 'Package', 6, true
WHERE NOT EXISTS (SELECT 1 FROM modules WHERE code = 'inventory');

INSERT INTO modules (code, name, name_ar, description, icon, sort_order, is_active)
SELECT 'exchange', 'Exchange & Transfers', 'الصرافة والحوالات', 'Money transfers and exchange', 'ArrowLeftRight', 7, true
WHERE NOT EXISTS (SELECT 1 FROM modules WHERE code = 'exchange');

INSERT INTO modules (code, name, name_ar, description, icon, sort_order, is_active)
SELECT 'reports', 'Reports', 'التقارير', 'Financial and business reports', 'BarChart3', 8, true
WHERE NOT EXISTS (SELECT 1 FROM modules WHERE code = 'reports');

INSERT INTO modules (code, name, name_ar, description, icon, sort_order, is_active)
SELECT 'shifts', 'Shifts', 'الورديات', 'Work shift management', 'Clock', 9, true
WHERE NOT EXISTS (SELECT 1 FROM modules WHERE code = 'shifts');

INSERT INTO modules (code, name, name_ar, description, icon, sort_order, is_active)
SELECT 'settings', 'Settings', 'الإعدادات', 'System and tenant settings', 'Settings', 10, true
WHERE NOT EXISTS (SELECT 1 FROM modules WHERE code = 'settings');

-- ============================================================
-- TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_updated ON tenants;
CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated ON profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_roles_updated ON roles;
CREATE TRIGGER trg_roles_updated BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_tenant_members_updated ON tenant_members;
CREATE TRIGGER trg_tenant_members_updated BEFORE UPDATE ON tenant_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_subscription_plans_updated ON subscription_plans;
CREATE TRIGGER trg_subscription_plans_updated BEFORE UPDATE ON subscription_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on auth user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
