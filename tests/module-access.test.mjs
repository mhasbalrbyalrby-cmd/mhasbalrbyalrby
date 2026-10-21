import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessModule, normalizeRoleName, roleModules } from '../src/lib/module-access.ts';

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
