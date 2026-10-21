import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20261021100000_harden_tenant_invitation_rpcs.sql', import.meta.url), 'utf8');

test('tenant invitation RPC restricts inviters to tenant owner/admin roles', () => {
  assert.match(migration, /v_caller_authorized/);
  assert.match(migration, /'owner', 'admin', 'administrator', 'مالك', 'مدير'/);
  assert.match(migration, /Not authorized to invite users to this tenant/);
});

test('tenant invitation RPC rejects cross-tenant and system-role assignment', () => {
  assert.match(migration, /r\.tenant_id = p_tenant_id/);
  assert.match(migration, /r\.is_system = false/);
  assert.match(migration, /Role must belong to the target tenant/);
});

test('invitation acceptance is bound to the authenticated invitee and pending status', () => {
  assert.match(migration, /tm\.user_id = v_user_id/);
  assert.match(migration, /tm\.status = 'invited'/);
  assert.match(migration, /Account is already linked to another tenant/);
});

test('privileged RPC execution is revoked from PUBLIC and anon', () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.invite_user_to_tenant\(uuid, text, uuid\) FROM PUBLIC, anon/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.accept_tenant_invitation\(uuid\) FROM PUBLIC, anon/);
});
