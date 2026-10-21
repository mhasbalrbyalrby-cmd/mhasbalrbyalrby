import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessModule, canAccessModuleWithEntitlements, normalizeRoleName, roleModules } from '../src/lib/module-access.ts';

test('normalizes English and Arabic role labels consistently', () => {
  assert.equal(normalizeRoleName('admin', null, false), 'admin');
  assert.equal(normalizeRoleName(null, 'مدير', false), 'admin');
  assert.equal(normalizeRoleName('exchange_agent', 'صراف', false), 'exchange_agent');
  assert.equal(normalizeRoleName(null, 'موظف', false), 'employee');
});

test('system-owner modules require the verified owner flag', () => {
  assert.equal(canAccessModule('owner', 'admin', false), false);
  assert.equal(canAccessModule('memory', 'owner', false), false);
  assert.equal(canAccessModule('owner', 'owner', true), true);
  assert.equal(canAccessModule('memory', 'owner', true), true);
});

test('role matrix keeps ordinary employee access restricted', () => {
  const employeeModules = roleModules.employee;
  assert.deepEqual(employeeModules, ['dashboard', 'help']);
  assert.equal(canAccessModule('accounting', 'employee', false), false);
  assert.equal(canAccessModule('dashboard', 'employee', false), true);
});

test('App guard and navigation consume the same exported matrix', () => {
  assert.ok(roleModules.admin.includes('accounting'));
  assert.ok(roleModules.cashier.includes('receipts'));
  assert.ok(!roleModules.cashier.includes('owner'));
});


test('optional modules require both role permission and an enabled entitlement', () => {
  const enabled = new Set(['zakat']);
  assert.equal(canAccessModuleWithEntitlements('zakat', 'accountant', false, enabled, true), true);
  assert.equal(canAccessModuleWithEntitlements('zakat', 'accountant', false, new Set(), true), false);
  assert.equal(canAccessModuleWithEntitlements('zakat', 'accountant', false, enabled, false), false);
  assert.equal(canAccessModuleWithEntitlements('zakat', 'employee', false, enabled, true), false);
});

test('owner bypasses tenant add-on entitlement but tenant role does not', () => {
  assert.equal(canAccessModuleWithEntitlements('fuel', 'owner', true, new Set(), true), true);
  assert.equal(canAccessModuleWithEntitlements('fuel', 'manager', false, new Set(), true), false);
});

test('owner-only modules remain denied to tenants even if an addon code is present', () => {
  const enabled = new Set(['owner', 'memory', 'zakat']);
  assert.equal(canAccessModuleWithEntitlements('owner', 'admin', false, enabled, true), false);
  assert.equal(canAccessModuleWithEntitlements('memory', 'admin', false, enabled, true), false);
});
