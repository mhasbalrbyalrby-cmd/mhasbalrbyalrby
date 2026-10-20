import test from 'node:test';
import assert from 'node:assert/strict';
import { exportToCSV, parseCSV } from '../src/lib/csv.ts';

test('parses UTF-8 BOM, Arabic headers, and normal rows', () => {
  const rows = parseCSV('\uFEFFالاسم,الهاتف\r\nعلي,777123456', ['الاسم', 'الهاتف']);
  assert.deepEqual(rows, [{ الاسم: 'علي', الهاتف: '777123456' }]);
});

test('parses quoted commas, escaped quotes, and embedded newlines', () => {
  const rows = parseCSV('name,note\r\nعلي,"قال ""مرحباً"",\nثم تابع"', ['name', 'note']);
  assert.deepEqual(rows, [{ name: 'علي', note: 'قال "مرحباً",\nثم تابع' }]);
});

test('maps expected headers case-insensitively and skips blank rows', () => {
  const rows = parseCSV('Name,Phone\nAli,123\n,  \n', ['name', 'phone']);
  assert.deepEqual(rows, [{ name: 'Ali', phone: '123' }]);
});

test('rejects an unclosed quoted field', () => {
  assert.throws(() => parseCSV('name,note\nAli,"unfinished', ['name', 'note']), /unclosed quoted field/i);
});

test('exports Arabic as UTF-8 and neutralizes spreadsheet formulas', async () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const originalDocument = globalThis.document;
  let capturedBlob;
  let clicked = false;

  URL.createObjectURL = (blob) => {
    capturedBlob = blob;
    return 'blob:csv-test';
  };
  URL.revokeObjectURL = () => {};
  globalThis.document = {
    createElement: () => ({
      href: '',
      download: '',
      click() { clicked = true; },
    }),
  };

  try {
    exportToCSV('contacts', ['الاسم', 'ملاحظة'], [['علي', '=1+1'], ['سارة', '  @SUM(A1:A2)']]);
    assert.equal(clicked, true);
    const exportedBytes = new Uint8Array(await capturedBlob.arrayBuffer());
    assert.deepEqual(Array.from(exportedBytes.slice(0, 3)), [0xef, 0xbb, 0xbf]);
    const exported = new TextDecoder('utf-8').decode(exportedBytes.slice(3));
    assert.match(exported, /علي,'=1\+1/);
    assert.match(exported, /سارة,'  @SUM\(A1:A2\)/);
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
