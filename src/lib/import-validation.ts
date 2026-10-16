
export type ImportRow = Record<string, string>;

export interface ImportField {
  key: string;
  headers?: string[];
  required?: boolean;
  validate?: (value: string) => string | null;
}

export interface ImportIssue {
  row: number;
  field?: string;
  message: string;
}

export interface ImportResult {
  rows: ImportRow[];
  validRows: ImportRow[];
  issues: ImportIssue[];
  invalidRowCount: number;
}

function normalizeHeader(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[\s_-]+/g, '');
}

export function validateImportRows(
  sourceRows: ImportRow[],
  fields: ImportField[],
  duplicateBy: string[] = [],
): ImportResult {
  const issues: ImportIssue[] = [];
  const availableHeaders = new Map<string, string>();

  for (const source of sourceRows) {
    for (const header of Object.keys(source)) {
      const normalized = normalizeHeader(header);
      if (!availableHeaders.has(normalized)) {
        availableHeaders.set(normalized, header);
      }
    }
  }

  const resolved = new Map<string, string>();
  let missingRequiredColumn = false;

  for (const field of fields) {
    const candidates = [field.key, ...(field.headers ?? [])];
    const match = candidates
      .map(normalizeHeader)
      .find((header) => availableHeaders.has(header));

    if (match) {
      resolved.set(field.key, availableHeaders.get(match)!);
    } else if (field.required) {
      missingRequiredColumn = true;
      issues.push({
        row: 1,
        field: field.key,
        message: `العمود المطلوب غير موجود: ${field.key}`,
      });
    }
  }

  const rows = sourceRows.map((source, index) => {
    const row: ImportRow = {};

    for (const field of fields) {
      const header = resolved.get(field.key);
      const value = header ? (source[header] ?? '').trim() : '';
      row[field.key] = value;

      if (field.required && !value) {
        issues.push({
          row: index + 2,
          field: field.key,
          message: `الحقل مطلوب: ${field.key}`,
        });
      } else if (value && field.validate) {
        const message = field.validate(value);
        if (message) {
          issues.push({ row: index + 2, field: field.key, message });
        }
      }
    }

    return row;
  });

  for (const key of duplicateBy) {
    const seen = new Map<string, number>();

    rows.forEach((row, index) => {
      const value = (row[key] ?? '').trim().toLocaleLowerCase();
      if (!value) return;

      if (seen.has(value)) {
        issues.push({
          row: index + 2,
          field: key,
          message: `قيمة مكررة في الحقل ${key}؛ ظهرت أول مرة في الصف ${seen.get(value)! + 2}`,
        });
      } else {
        seen.set(value, index);
      }
    });
  }

  const invalidRows = new Set(
    issues.filter((issue) => issue.row > 1).map((issue) => issue.row),
  );

  return {
    rows,
    validRows: missingRequiredColumn
      ? []
      : rows.filter((_, index) => !invalidRows.has(index + 2)),
    issues,
    invalidRowCount: missingRequiredColumn
      ? rows.length
      : invalidRows.size,
  };
}
