import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const guardedModules = [
  ['ContactsPage.tsx', 'CONTACTS_WRITES_ENABLED'],
  ['InventoryPage.tsx', 'INVENTORY_WRITES_ENABLED'],
  ['AccountingPage.tsx', 'ACCOUNTING_WRITES_ENABLED'],
  ['InvoicesPage.tsx', 'ACCOUNTING_WRITES_ENABLED'],
  ['ReceiptsPage.tsx', 'ACCOUNTING_WRITES_ENABLED'],
  ['StockMovementsPage.tsx', 'STOCK_WRITES_ENABLED'],
  ['ZakatPage.tsx', 'ZAKAT_WRITES_ENABLED'],
  ['InheritancePage.tsx', 'INHERITANCE_WRITES_ENABLED'],
  ['FixedAssetsPage.tsx', 'FIXED_ASSET_WRITES_ENABLED'],
  ['ExchangePage.tsx', 'EXCHANGE_WRITES_ENABLED'],
  ['ShiftsPage.tsx', 'SHIFT_WRITES_ENABLED'],
  ['FuelPage.tsx', 'FUEL_WRITES_ENABLED'],
];

for (const [filename, flag] of guardedModules) {
  test(`${filename} keeps financial/master-data writes disabled until isolated tests pass`, () => {
    const source = readFileSync(new URL(`../src/pages/${filename}`, import.meta.url), 'utf8');
    assert.match(source, new RegExp(`const\\s+${flag}\\s*=\\s*false\\b`), 'write safety flag must remain false');
    assert.match(source, new RegExp(`if\\s*\\(!${flag}\\)`), 'write handlers must enforce the safety flag');
  });
}
