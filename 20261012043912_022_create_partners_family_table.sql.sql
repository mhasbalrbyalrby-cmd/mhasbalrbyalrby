/*
# Create partners_family table for pre-death registry

1. New Table: partners_family
- Stores partners and family members before death for estate planning
- Links to estates after death via linked_estate_id

2. Security
- RLS enabled with tenant isolation
- 4 separate policies: SELECT, INSERT, UPDATE, DELETE
*/

CREATE TABLE IF NOT EXISTS partners_family (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  person_name text NOT NULL,
  person_name_ar text,
  relationship text,
  gender text CHECK (gender IN ('male', 'female') OR gender IS NULL),
  birth_date date,
  national_id text,
  phone text,
  notes text,
  is_deceased boolean NOT NULL DEFAULT false,
  date_of_death date,
  linked_estate_id uuid REFERENCES estates(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE partners_family ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_partners_family" ON partners_family;
CREATE POLICY "select_own_partners_family" ON partners_family
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_partners_family" ON partners_family;
CREATE POLICY "insert_own_partners_family" ON partners_family
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));

DROP POLICY IF EXISTS "update_own_partners_family" ON partners_family;
CREATE POLICY "update_own_partners_family" ON partners_family
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_partners_family" ON partners_family;
CREATE POLICY "delete_own_partners_family" ON partners_family
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()));
