/*
# Foundation Part 2: Audit Logs, Prepaid Cards, Settings, Knowledge Base

## Overview
This migration adds the supporting infrastructure for the ERP system:
- Audit logging for all sensitive operations
- Prepaid card system for subscription payments
- Tenant and system settings architecture
- Knowledge & specifications center for project documentation

## New Tables

### 1. audit_logs
- `id` (uuid, PK)
- `tenant_id` (uuid, FK) — tenant context
- `user_id` (uuid) — who performed the action
- `action` (text) — e.g. "invoice.create", "user.login"
- `entity_type` (text) — e.g. "invoice", "journal", "user"
- `entity_id` (uuid) — ID of the affected entity
- `entity_name` (text) — human-readable entity name
- `old_values` (jsonb) — state before change
- `new_values` (jsonb) — state after change
- `reason` (text) — reason for the action
- `ip_address` (text) — request IP if available
- `user_agent` (text) — browser/client info
- `created_at` (timestamptz)

### 2. prepaid_cards
- `id` (uuid, PK)
- `code` (text, unique) — the prepaid code
- `code_hash` (text) — hashed version for secure lookup
- `plan_id` (uuid, FK) — which subscription plan
- `duration_type` (text) — monthly | yearly | custom
- `duration_days` (int) — subscription duration in days
- `value` (numeric) — card monetary value
- `currency` (text)
- `status` (text) — active | used | cancelled | expired
- `batch_id` (uuid) — bulk generation batch
- `created_by` (uuid) — who generated the card
- `used_by_tenant_id` (uuid) — tenant that used the card
- `used_at` (timestamptz)
- `expires_at` (timestamptz) — card validity
- `notes` (text)
- `created_at` / `updated_at`

### 3. prepaid_card_batches
- `id` (uuid, PK)
- `name` (text) — batch name
- `plan_id` (uuid, FK)
- `quantity` (int) — how many cards
- `duration_type` (text)
- `duration_days` (int)
- `value` (numeric)
- `currency` (text)
- `created_by` (uuid)
- `notes` (text)
- `created_at`

### 4. tenant_settings
- `tenant_id` (uuid, PK, FK)
- `settings` (jsonb) — flexible settings JSON
- `updated_by` (uuid)
- `updated_at` (timestamptz)

### 5. system_settings
- `id` (uuid, PK)
- `key` (text, unique) — setting key
- `value` (jsonb) — setting value
- `description` (text)
- `is_public` (boolean) — visible to non-owner users
- `updated_by` (uuid)
- `updated_at` (timestamptz)

### 6. knowledge_articles
- `id` (uuid, PK)
- `tenant_id` (uuid, FK) — null for system-wide articles
- `category` (text) — requirements, features, decisions, rules, errors, tests, changelog
- `title` (text)
- `title_ar` (text)
- `content` (text)
- `content_ar` (text)
- `status` (text) — planned | in_progress | completed | tested | needs_review
- `tags` (text[])
- `sort_order` (int)
- `created_by` (uuid)
- `updated_by` (uuid)
- `created_at` / `updated_at`

## Security
- Audit logs: visible to tenant members and owner
- Prepaid cards: owner-only management; tenants can only redeem
- Settings: tenant settings visible to members; system settings owner-only (except public ones)
- Knowledge articles: visible to tenant members; system articles visible to all authenticated
*/

-- ============================================================
-- 1. AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  entity_name text,
  old_values jsonb,
  new_values jsonb,
  reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. PREPAID CARD BATCHES
-- ============================================================
CREATE TABLE IF NOT EXISTS prepaid_card_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  plan_id uuid REFERENCES subscription_plans(id) ON DELETE SET NULL,
  quantity int NOT NULL DEFAULT 1,
  duration_type text NOT NULL DEFAULT 'monthly' CHECK (duration_type IN ('monthly', 'yearly', 'custom')),
  duration_days int NOT NULL DEFAULT 30,
  value numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE prepaid_card_batches ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. PREPAID CARDS
-- ============================================================
CREATE TABLE IF NOT EXISTS prepaid_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  code_hash text NOT NULL,
  plan_id uuid REFERENCES subscription_plans(id) ON DELETE SET NULL,
  duration_type text NOT NULL DEFAULT 'monthly' CHECK (duration_type IN ('monthly', 'yearly', 'custom')),
  duration_days int NOT NULL DEFAULT 30,
  value numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'cancelled', 'expired')),
  batch_id uuid REFERENCES prepaid_card_batches(id) ON DELETE SET NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  used_by_tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  used_at timestamptz,
  expires_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE prepaid_cards ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. TENANT SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. SYSTEM SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  is_public boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. KNOWLEDGE ARTICLES
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('requirements', 'features', 'decisions', 'rules', 'errors', 'tests', 'changelog', 'guide')),
  title text NOT NULL,
  title_ar text,
  content text,
  content_ar text,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'tested', 'needs_review')),
  tags text[] NOT NULL DEFAULT '{}',
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE knowledge_articles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- Audit logs: visible to tenant members and owner
DROP POLICY IF EXISTS "select_audit_logs" ON audit_logs;
CREATE POLICY "select_audit_logs" ON audit_logs FOR SELECT
  TO authenticated USING (
    is_owner_user() OR (tenant_id IS NOT NULL AND is_tenant_member(tenant_id))
  );

-- Owner can manage all audit logs
DROP POLICY IF EXISTS "owner_manage_audit_logs" ON audit_logs;
CREATE POLICY "owner_manage_audit_logs" ON audit_logs FOR ALL
  TO authenticated USING (is_owner_user()) WITH CHECK (is_owner_user());

-- Tenant members can insert audit logs for their tenant
DROP POLICY IF EXISTS "insert_tenant_audit_logs" ON audit_logs;
CREATE POLICY "insert_tenant_audit_logs" ON audit_logs FOR INSERT
  TO authenticated WITH CHECK (
    is_owner_user() OR (tenant_id IS NOT NULL AND is_tenant_member(tenant_id))
  );

-- Prepaid card batches: owner only
DROP POLICY IF EXISTS "owner_manage_card_batches" ON prepaid_card_batches;
CREATE POLICY "owner_manage_card_batches" ON prepaid_card_batches FOR ALL
  TO authenticated USING (is_owner_user()) WITH CHECK (is_owner_user());

-- Prepaid cards: owner can see/manage all; tenants can only check/redeem their own
DROP POLICY IF EXISTS "owner_manage_prepaid_cards" ON prepaid_cards;
CREATE POLICY "owner_manage_prepaid_cards" ON prepaid_cards FOR ALL
  TO authenticated USING (is_owner_user()) WITH CHECK (is_owner_user());

DROP POLICY IF EXISTS "select_used_prepaid_cards" ON prepaid_cards;
CREATE POLICY "select_used_prepaid_cards" ON prepaid_cards FOR SELECT
  TO authenticated USING (
    used_by_tenant_id IS NOT NULL AND is_tenant_member(used_by_tenant_id)
  );

-- Tenant settings: visible to members; editable by members
DROP POLICY IF EXISTS "select_tenant_settings" ON tenant_settings;
CREATE POLICY "select_tenant_settings" ON tenant_settings FOR SELECT
  TO authenticated USING (
    is_owner_user() OR is_tenant_member(tenant_id)
  );

DROP POLICY IF EXISTS "manage_tenant_settings" ON tenant_settings;
CREATE POLICY "manage_tenant_settings" ON tenant_settings FOR ALL
  TO authenticated USING (
    is_owner_user() OR is_tenant_member(tenant_id)
  ) WITH CHECK (
    is_owner_user() OR is_tenant_member(tenant_id)
  );

-- System settings: public ones readable by all; private ones owner-only
DROP POLICY IF EXISTS "select_public_system_settings" ON system_settings;
CREATE POLICY "select_public_system_settings" ON system_settings FOR SELECT
  TO authenticated USING (is_public = true);

DROP POLICY IF EXISTS "owner_manage_system_settings" ON system_settings;
CREATE POLICY "owner_manage_system_settings" ON system_settings FOR ALL
  TO authenticated USING (is_owner_user()) WITH CHECK (is_owner_user());

-- Knowledge articles: system articles (tenant_id IS NULL) visible to all; tenant articles to members
DROP POLICY IF EXISTS "select_system_knowledge" ON knowledge_articles;
CREATE POLICY "select_system_knowledge" ON knowledge_articles FOR SELECT
  TO authenticated USING (
    tenant_id IS NULL OR is_owner_user() OR is_tenant_member(tenant_id)
  );

DROP POLICY IF EXISTS "owner_manage_knowledge" ON knowledge_articles;
CREATE POLICY "owner_manage_knowledge" ON knowledge_articles FOR ALL
  TO authenticated USING (is_owner_user()) WITH CHECK (is_owner_user());

DROP POLICY IF EXISTS "manage_tenant_knowledge" ON knowledge_articles;
CREATE POLICY "manage_tenant_knowledge" ON knowledge_articles FOR ALL
  TO authenticated USING (
    tenant_id IS NOT NULL AND is_tenant_member(tenant_id)
  ) WITH CHECK (
    tenant_id IS NOT NULL AND is_tenant_member(tenant_id)
  );

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prepaid_cards_status ON prepaid_cards(status);
CREATE INDEX IF NOT EXISTS idx_prepaid_cards_batch_id ON prepaid_cards(batch_id);
CREATE INDEX IF NOT EXISTS idx_prepaid_cards_code_hash ON prepaid_cards(code_hash);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_category ON knowledge_articles(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_tenant_id ON knowledge_articles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_status ON knowledge_articles(status);

-- ============================================================
-- TRIGGERS
-- ============================================================
DROP TRIGGER IF EXISTS trg_prepaid_cards_updated ON prepaid_cards;
CREATE TRIGGER trg_prepaid_cards_updated BEFORE UPDATE ON prepaid_cards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_system_settings_updated ON system_settings;
CREATE TRIGGER trg_system_settings_updated BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_knowledge_articles_updated ON knowledge_articles;
CREATE TRIGGER trg_knowledge_articles_updated BEFORE UPDATE ON knowledge_articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SEED: System settings defaults
-- ============================================================
INSERT INTO system_settings (key, value, description, is_public)
SELECT 'default_trial_days', '14'::jsonb, 'Default trial duration in days', false
WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key = 'default_trial_days');

INSERT INTO system_settings (key, value, description, is_public)
SELECT 'default_currency', '"SAR"'::jsonb, 'Default system currency', true
WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key = 'default_currency');

INSERT INTO system_settings (key, value, description, is_public)
SELECT 'default_language', '"ar"'::jsonb, 'Default system language', true
WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key = 'default_language');

INSERT INTO system_settings (key, value, description, is_public)
SELECT 'app_name', '"محاسب الربيع العربي"'::jsonb, 'Application name', true
WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key = 'app_name');

INSERT INTO system_settings (key, value, description, is_public)
SELECT 'app_name_en', '"Arab Spring Accountant"'::jsonb, 'Application name (English)', true
WHERE NOT EXISTS (SELECT 1 FROM system_settings WHERE key = 'app_name_en');

-- ============================================================
-- SEED: Knowledge base — project requirements
-- ============================================================
INSERT INTO knowledge_articles (tenant_id, category, title, title_ar, content, content_ar, status, tags, sort_order)
SELECT NULL, 'requirements', 'Multi-Tenant Isolation', 'عزل المستأجرين',
  'All tenant data must be isolated using Supabase RLS. No tenant can access another tenant data even through direct API calls.',
  'يجب عزل جميع بيانات المستأجرين باستخدام RLS. لا يمكن لأي مستأجر الوصول لبيانات مستأجر آخر حتى عبر API مباشر.',
  'completed', ARRAY['security', 'rls', 'tenant'], 1
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Multi-Tenant Isolation');

INSERT INTO knowledge_articles (tenant_id, category, title, title_ar, content, content_ar, status, tags, sort_order)
SELECT NULL, 'requirements', 'RBAC System', 'نظام الصلاحيات',
  'Role-based access control with granular permissions per module. System roles: owner, admin, accountant, manager, sales, purchasing, warehouse, cashier, exchange_agent, auditor, employee.',
  'نظام صلاحيات قائم على الأدوار مع صلاحيات دقيقة لكل وحدة. الأدوار النظامية: مالك، مدير، محاسب، مدير، مبيعات، مشتريات، مخزون، كاشير، وكيل صرافة، مراجع، موظف.',
  'completed', ARRAY['security', 'rbac', 'permissions'], 2
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'RBAC System');

INSERT INTO knowledge_articles (tenant_id, category, title, title_ar, content, content_ar, status, tags, sort_order)
SELECT NULL, 'requirements', 'Owner Control Center', 'لوحة المالك',
  'Separate owner panel for managing tenants, users, plans, trials, subscriptions, prepaid cards, modules, permissions, system settings, templates, alerts, automation, audit logs, usage monitoring.',
  'لوحة منفصلة للمالك لإدارة المستأجرين والمستخدمين والخطط والتجارب والاشتراكات والكروت والوحدات والصلاحيات وإعدادات النظام والقوالب والتنبيهات والأتمتة والسجلات ومراقبة الاستخدام.',
  'in_progress', ARRAY['owner', 'management'], 3
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Owner Control Center');

INSERT INTO knowledge_articles (tenant_id, category, title, title_ar, content, content_ar, status, tags, sort_order)
SELECT NULL, 'requirements', 'Balanced Journal Entries', 'القيود المتوازنة',
  'Every journal entry must have Total Debit = Total Credit. Do not rely on is_balanced boolean alone. Enforce at database level.',
  'كل قيد يجب أن يكون مجموع المدين = مجموع الدائن. لا تعتمد على is_balanced وحدها. يجب فرض ذلك على مستوى قاعدة البيانات.',
  'planned', ARRAY['accounting', 'integrity'], 4
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Balanced Journal Entries');

INSERT INTO knowledge_articles (tenant_id, category, title, title_ar, content, content_ar, status, tags, sort_order)
SELECT NULL, 'requirements', 'Multi-Currency Support', 'دعم العملات',
  'Every amount must be stored with its currency. Reports convert using correct exchange rate by date. Never mix currencies.',
  'كل مبلغ يجب حفظه مع عملته. التقارير تحول باستخدام سعر الصرف الصحيح حسب التاريخ. لا تخلط العملات.',
  'planned', ARRAY['currency', 'accounting'], 5
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Multi-Currency Support');

INSERT INTO knowledge_articles (tenant_id, category, title, title_ar, content, content_ar, status, tags, sort_order)
SELECT NULL, 'requirements', 'Audit Trail', 'سجل التدقيق',
  'All sensitive operations must be logged: user, tenant, action, timestamp, entity, before/after values, reason. Never log secrets or passwords.',
  'جميع العمليات الحساسة يجب تسجيلها: المستخدم، المستأجر، العملية، الوقت، الكيان، قبل/بعد، السبب. لا تسجل الأسرار أو كلمات المرور.',
  'completed', ARRAY['audit', 'security'], 6
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Audit Trail');

INSERT INTO knowledge_articles (tenant_id, category, title, title_ar, content, content_ar, status, tags, sort_order)
SELECT NULL, 'requirements', 'Prepaid Cards System', 'نظام الكروت مسبقة الدفع',
  'Generate unique secure codes with value, duration, status, usage tracking. Support bulk generation, cancellation, and usage history.',
  'توليد أكواد فريدة وآمنة مع قيمة ومدة وحالة وتتبع استخدام. يدعم التوليد الجماعي والإلغاء وسجل الاستخدام.',
  'planned', ARRAY['prepaid', 'subscription'], 7
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Prepaid Cards System');

INSERT INTO knowledge_articles (tenant_id, category, title, title_ar, content, content_ar, status, tags, sort_order)
SELECT NULL, 'requirements', 'Master Contact Model', 'نموذج جهة الاتصال الرئيسي',
  'A person should not be created twice due to different roles. Muhammad Ali can be customer, supplier, employee — but same master contact.',
  'لا ينشأ الشخص مرتين بسبب اختلاف دوره. محمد علي يمكن أن يكون عميل ومورد وموظف لكن نفس جهة الاتصال الرئيسي.',
  'planned', ARRAY['contacts', 'architecture'], 8
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Master Contact Model');

INSERT INTO knowledge_articles (tenant_id, category, title, title_ar, content, content_ar, status, tags, sort_order)
SELECT NULL, 'requirements', 'Shift Management', 'إدارة الورديات',
  'Distinguish between invoice date, operation time, receipt date, shift ID, and posted at. Invoice date does not change when receipt is on a different day.',
  'التفريق بين تاريخ الفاتورة ووقت العملية وتاريخ القبض ومعرف الوردية ووقت الترحيل. لا يتغير تاريخ الفاتورة عند القبض في يوم آخر.',
  'planned', ARRAY['shifts', 'operations'], 9
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Shift Management');

INSERT INTO knowledge_articles (tenant_id, category, title, title_ar, content, content_ar, status, tags, sort_order)
SELECT NULL, 'requirements', 'No Fake Functionality', 'لا وظائف وهمية',
  'Every feature must be connected to the database. No mock data, fake buttons, fake reports, or fake save operations. If not implemented, do not show it as working.',
  'كل وظيفة يجب أن تكون متصلة بقاعدة البيانات. ممنوع البيانات الوهمية والأزرار الوهمية والتقارير الوهمية. إذا لم تنفذ لا تظهرها كأنها تعمل.',
  'completed', ARRAY['integrity', 'quality'], 10
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'No Fake Functionality');
