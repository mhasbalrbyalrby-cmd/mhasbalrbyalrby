/**
 * CSV export and import utilities.
 */

export function exportToCSV(filename: string, headers: string[], rows: (string | number | null)[][]): void {
  const csv = [
    headers.map(escapeCSV).join(','),
    ...rows.map((row) => row.map(escapeCSV).join(',')),
  ].join('\n');

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
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export interface CSVRow {
  [key: string]: string;
}

export function parseCSV(text: string, expectedHeaders: string[] = []): CSVRow[] {
  const source = text.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"' && quoted && source[i + 1] === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((value) => value.trim() !== '')) records.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim() !== '')) records.push(row);
  }
  if (records.length < 2) return [];

  const headers = records[0].map((header) => header.trim().replace(/^\uFEFF/, ''));
  const normalizedExpected = expectedHeaders.map((header) => header.toLowerCase());
  return records.slice(1).map((values) => {
    const result: CSVRow = {};
    headers.forEach((header, index) => {
      const normalized = header.toLowerCase();
      const canonical = expectedHeaders.find((candidate) => candidate.toLowerCase() === normalized);
      const key = canonical ?? (normalizedExpected.includes(normalized) ? expectedHeaders[normalizedExpected.indexOf(normalized)] : header);
      result[key] = (values[index] ?? '').trim();
    });
    return result;
  });
}
