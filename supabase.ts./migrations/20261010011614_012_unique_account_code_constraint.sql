-- Add unique constraint on chart_of_accounts (tenant_id, code)
-- to prevent duplicate account codes at the database level.

-- Remove any existing duplicate codes within a tenant (guard against edge case)
DELETE FROM chart_of_accounts
WHERE id NOT IN (
  SELECT DISTINCT ON (tenant_id, code) id
  FROM chart_of_accounts
  ORDER BY tenant_id, code, created_at ASC
);

-- Add the unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS chart_of_accounts_tenant_code_unique
  ON chart_of_accounts (tenant_id, code);
