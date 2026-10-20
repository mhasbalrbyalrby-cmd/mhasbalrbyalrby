/**
 * CSV export and import utilities.
 *
 * The parser handles quoted commas, escaped quotes, CRLF/LF line endings,
 * UTF-8 BOMs, and newlines embedded inside quoted cells. It intentionally
 * returns the same CSVRow[] shape used by existing import screens.
 */

export function exportToCSV(filename: string, headers: string[], rows: (string | number | null)[][]): void {
  const csv = [
    headers.map(escapeCSV).join(','),
    ...rows.map((row) => row.map(escapeCSV).join(',')),
  ].join('\r\n');

  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeCSV(value: string | number | null): string {
  if (value === null || value === undefined) return '';
  const original = String(value);
  // Prevent spreadsheet formula injection in exported cells. CSV quoting alone
  // does not stop Excel/LibreOffice from evaluating formula-like values.
  const str = /^[\\t\\r\\n ]*[=+\\-@]/.test(original) ? `'${original}` : original;
  if (/[,"\\r\\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export interface CSVRow {
  [key: string]: string;
}

export function parseCSV(text: string, expectedHeaders: string[]): CSVRow[] {
  const records = parseCSVRecords(text.replace(/^\uFEFF/, ''));
  if (records.length < 2) return [];

  const headers = records[0].map((header) => header.trim());
  const normalizedExpected = new Map(expectedHeaders.map((header) => [header.toLowerCase(), header]));
  const keys = headers.map((header) => normalizedExpected.get(header.toLowerCase()) ?? header);

  return records.slice(1)
    .filter((values) => values.some((value) => value.trim() !== ''))
    .map((values) => {
      const row: CSVRow = {};
      keys.forEach((key, index) => {
        row[key] = values[index] ?? '';
      });
      return row;
    });
}

/** Parse CSV records without splitting on newlines that occur inside quoted fields. */
function parseCSVRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];

    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(cell);
      records.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  // Do not silently accept a malformed quoted file; an unclosed quote can
  // shift all following columns and create incorrect accounting master data.
  if (inQuotes) {
    throw new Error('CSV contains an unclosed quoted field.');
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    records.push(row);
  }

  return records;
}
