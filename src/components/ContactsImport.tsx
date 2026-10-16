
import { useState } from 'react';
import { parseCSV } from '../lib/csv';
import { validateImportRows, type ImportRow } from '../lib/import-validation';

interface Props {
  onImport: (rows: ImportRow[]) => Promise<void>;
  onClose: () => void;
}

const fields = [
  { key: 'name', headers: ['Name', 'الاسم', 'اسم العميل', 'اسم المورد'], required: true },
  { key: 'name_ar', headers: ['Arabic Name', 'الاسم بالعربية'] },
  { key: 'phone', headers: ['Phone', 'الهاتف', 'رقم الهاتف'] },
  {
    key: 'email',
    headers: ['Email', 'البريد الإلكتروني'],
    validate: (value: string) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ? null
        : 'البريد الإلكتروني غير صحيح',
  },
  { key: 'address', headers: ['Address', 'العنوان'] },
  { key: 'city', headers: ['City', 'المدينة'] },
  { key: 'id_number', headers: ['ID Number', 'رقم الهوية'] },
  { key: 'notes', headers: ['Notes', 'ملاحظات'] },
];

export default function ContactsImport({ onImport, onClose }: Props) {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [issues, setIssues] = useState<{ row: number; message: string }[]>([]);
  const [invalidCount, setInvalidCount] = useState(0);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function handleFile(file?: File) {
    setError('');
    setRows([]);
    setIssues([]);
    setInvalidCount(0);

    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('هذه النسخة تقبل CSV فقط. دعم ملفات Excel الأصلية سيضاف في خطوة لاحقة.');
      return;
    }

    setLoading(true);
    setFileName(file.name);

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const text = String(reader.result ?? '').replace(/^\uFEFF/, '');
        const parsed = parseCSV(text, fields.map((field) => field.key));

        if (parsed.length === 0) {
          setError('الملف فارغ أو لا يحتوي على صفوف بيانات.');
          return;
        }

        const result = validateImportRows(parsed, fields, ['id_number']);

        setRows(result.validRows);
        setIssues(result.issues.map((issue) => ({
          row: issue.row,
          message: issue.message,
        })));
        setInvalidCount(result.invalidRowCount);

        if (result.issues.some((issue) => issue.row === 1)) {
          setError('تأكد من وجود الأعمدة المطلوبة في الصف الأول.');
        }
      } catch {
        setError('تعذر قراءة الملف. تحقق من تنسيق CSV ثم حاول مرة أخرى.');
      } finally {
        setLoading(false);
      }
    };

    reader.onerror = () => {
      setError('تعذرت قراءة الملف.');
      setLoading(false);
    };

    reader.readAsText(file, 'UTF-8');
  }

  async function confirmImport() {
    if (rows.length === 0 || issues.some((issue) => issue.row === 1)) return;

    setSaving(true);
    setError('');

    try {
      await onImport(rows);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل الاستيراد. لم يتم تأكيد نجاح الحفظ.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-bold">استيراد العملاء والموردين</h3>
        <button type="button" className="btn-secondary" onClick={onClose}>
          إغلاق
        </button>
      </div>

      <p className="text-sm text-[var(--color-text-muted)]">
        اختر ملف CSV بترميز UTF-8. يجب أن يحتوي الصف الأول على أسماء الأعمدة.
        يمكنك استخدام أسماء الأعمدة العربية أو الإنجليزية المعروفة.
      </p>

      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(event) => handleFile(event.target.files?.[0])}
        className="input-field"
        disabled={loading || saving}
      />

      {fileName && <p className="text-sm">الملف: {fileName}</p>}
      {loading && <p>جارٍ قراءة الملف والتحقق من البيانات...</p>}

      {error && (
        <p role="alert" className="text-sm text-error-500">{error}</p>
      )}

      {rows.length > 0 && (
        <>
          <div className="text-sm space-y-1">
            <p>الصفوف الصالحة للمعاينة: {rows.length}</p>
            <p>الصفوف التي تحتوي على أخطاء: {invalidCount}</p>
            <p>عدد رسائل التحقق: {issues.length}</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-start">الاسم</th>
                  <th className="p-2 text-start">الهاتف</th>
                  <th className="p-2 text-start">البريد الإلكتروني</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((row, index) => (
                  <tr key={`${row.name}-${index}`} className="border-t border-[var(--color-border)]">
                    <td className="p-2">{row.name}</td>
                    <td className="p-2">{row.phone}</td>
                    <td className="p-2">{row.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length > 10 && (
            <p className="text-xs text-[var(--color-text-muted)]">
              تظهر أول 10 صفوف فقط في المعاينة.
            </p>
          )}
        </>
      )}

      {issues.length > 0 && (
        <details>
          <summary className="cursor-pointer font-medium">
            عرض تفاصيل الأخطاء ({issues.length})
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-error-500">
            {issues.slice(0, 30).map((issue, index) => (
              <li key={`${issue.row}-${index}`}>
                الصف {issue.row}: {issue.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>
          إلغاء
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={saving || loading || rows.length === 0 || issues.some((issue) => issue.row === 1)}
          onClick={confirmImport}
        >
          {saving ? 'جارٍ الحفظ...' : `تأكيد استيراد ${rows.length} صف`}
        </button>
      </div>
    </section>
  );
}
