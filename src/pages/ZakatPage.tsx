import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { ZakatRecord } from '@/types/database';
import { formatHijri, gregorianToHijri, hijriToGregorian, HIJRI_MONTHS_AR, HIJRI_MONTHS_EN } from '@/lib/hijri';
import { exportToCSV } from '@/lib/csv';
import {
  HandCoins, Plus, Loader2, AlertCircle, Download, Save, Calculator, BookOpen,
} from 'lucide-react';
import Modal from '@/components/Modal';

const ZAKAT_WRITES_ENABLED = false; // Keep writes disabled until isolated database tests pass.

export default function ZakatPage() {
  const { lang } = useI18n();
  const { profile } = useAuth();
  const [records, setRecords] = useState<ZakatRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const today = new Date();
  const todayHijri = gregorianToHijri(today);

  const [form, setForm] = useState({
    hijri_year: `${todayHijri.year}`,
    cash_amount: 0,
    receivables_amount: 0,
    inventory_amount: 0,
    other_amount: 0,
    notes: '',
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const tid = profile?.tenant_id;
    if (!tid) { setLoading(false); return; }
    const { data, error: e } = await supabase.from('zakat_records').select('*').eq('tenant_id', tid).order('created_at', { ascending: false });
    if (e) setError(e.message);
    setRecords((data as ZakatRecord[]) ?? []);
    setLoading(false);
  }

  const totalBase = Number(form.cash_amount) + Number(form.receivables_amount) + Number(form.inventory_amount) + Number(form.other_amount);
  const zakatDue = totalBase * 0.025;
  const nisabEstimate = 85 * 200;

  function openCreate() {
    setForm({ hijri_year: `${todayHijri.year}`, cash_amount: 0, receivables_amount: 0, inventory_amount: 0, other_amount: 0, notes: '' });
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!ZAKAT_WRITES_ENABLED) { setError(ar ? 'الحفظ معطل مؤقتاً حتى اجتياز اختبارات قاعدة تطوير معزولة.' : 'Saving is temporarily disabled until isolated database tests pass.'); return; }
    if (!profile?.tenant_id) return;
    setSaving(true); setError('');
    try {
      const haulStart = hijriToGregorian(todayHijri.year - 1, todayHijri.month, todayHijri.day);
      const haulEnd = today.toISOString().slice(0, 10);
      const { error: e } = await supabase.from('zakat_records').insert({
        tenant_id: profile.tenant_id,
        hijri_year: form.hijri_year,
        nisab_date: haulEnd,
        nisab_hijri: formatHijri(today),
        haul_start: haulStart.toISOString().slice(0, 10),
        haul_end: haulEnd,
        cash_amount: Number(form.cash_amount) || 0,
        receivables_amount: Number(form.receivables_amount) || 0,
        inventory_amount: Number(form.inventory_amount) || 0,
        other_amount: Number(form.other_amount) || 0,
        total_zakat_base: totalBase,
        zakat_rate: 0.025,
        zakat_due: zakatDue,
        zakat_paid: 0,
        status: 'calculated',
        notes: form.notes.trim() || null,
        created_by: profile.id,
      });
      if (e) throw e;
      setModalOpen(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'خطأ' : 'Error'));
    } finally { setSaving(false); }
  }

  async function recordPayment(rec: ZakatRecord) {
    if (!ZAKAT_WRITES_ENABLED) { setError(ar ? 'تسجيل الدفعات معطل مؤقتاً حتى اجتياز اختبارات قاعدة تطوير معزولة.' : 'Payment recording is temporarily disabled until isolated database tests pass.'); return; }
    const amount = prompt(lang === 'ar' ? 'أدخل المبلغ المدفوع:' : 'Enter paid amount:', rec.zakat_due.toFixed(2));
    if (!amount) return;
    const paid = Number(amount);
    if (isNaN(paid) || paid <= 0) return;
    const method = prompt(lang === 'ar' ? 'طريقة الدفع (نقدي/مصرف):' : 'Payment method (cash/bank):', 'cash') ?? 'cash';
    const { error: e } = await supabase.from('zakat_records').update({
      zakat_paid: rec.zakat_paid + paid,
      payment_date: new Date().toISOString().slice(0, 10),
      payment_method: method,
      status: rec.zakat_paid + paid >= rec.zakat_due ? 'paid' : 'partial',
    }).eq('id', rec.id);
    if (e) { alert(e.message); return; }
    loadData();
  }

  function handleExport() {
    const headers = lang === 'ar'
      ? ['السنة الهجرية', 'النقد', 'المدينون', 'المخزون', 'أخرى', 'وعاء الزكاة', 'المستحق', 'المدفوع', 'المتبقي', 'الحالة']
      : ['Hijri Year', 'Cash', 'Receivables', 'Inventory', 'Other', 'Zakat Base', 'Zakat Due', 'Paid', 'Remaining', 'Status'];
    const rows = records.map((r) => [
      r.hijri_year, r.cash_amount, r.receivables_amount, r.inventory_amount, r.other_amount,
      r.total_zakat_base, r.zakat_due, r.zakat_paid, r.zakat_due - r.zakat_paid, r.status,
    ]);
    exportToCSV(`zakat-${lang === 'ar' ? 'الزكاة' : 'records'}`, headers, rows);
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" /></div>;

  const ar = lang === 'ar';
  const months = ar ? HIJRI_MONTHS_AR : HIJRI_MONTHS_EN;

  return (
    <div className="space-y-6 max-w-4xl">
      <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">{ar ? 'وضع القراءة فقط: تم تعطيل الحفظ وتسجيل الدفعات مؤقتاً حتى نجاح اختبارات قاعدة تطوير معزولة. يمكنك الاستعراض والتصدير.' : 'Read-only mode: saving and payment recording are disabled until isolated database tests pass. Viewing and export remain available.'}</div>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-success-600 flex items-center justify-center"><HandCoins className="w-5 h-5 text-white" /></div>
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text)]">{ar ? 'الزكاة' : 'Zakat'}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">{ar ? 'احتساب زكاة الأموال وفق الأحكام الشرعية' : 'Zakat calculation per Islamic rules'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} disabled={records.length === 0} className="btn-secondary flex items-center gap-2"><Download className="w-4 h-4" />{ar ? 'تصدير' : 'Export'}</button>
          <button onClick={openCreate} disabled={!ZAKAT_WRITES_ENABLED} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />{ar ? 'احتساب جديد' : 'New Calculation'}</button>
        </div>
      </div>

      <div className="card bg-emerald-50 dark:bg-emerald-900/15 border-emerald-200 dark:border-emerald-800/40">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
          <h3 className="font-bold text-emerald-800 dark:text-emerald-300">{ar ? 'آيات من سورة التوبة' : 'Verses from Surah At-Tawbah'}</h3>
        </div>
        <div className="space-y-3 text-emerald-900 dark:text-emerald-200" dir="rtl" style={{ fontFamily: "'Noto Naskh Arabic', 'Amiri', serif, sans-serif" }}>
          <p className="leading-loose text-base">
            <span className="text-emerald-600 dark:text-emerald-400 font-bold ms-1">﴿١٠١﴾</span>
            وَمِمَّنْ حَوْلَكُم مِّنَ ٱلْأَعْرَابِ مُنَٰفِقُونَ ۖ وَمِنْ أَهْلِ ٱلْمَدِينَةِ ۖ مَرَدُوا۟ عَلَى ٱلنِّفَاقِ لَا تَعْلَمُهُمْ ۖ نَحْنُ نَعْلَمُهُمْ ۚ سَنُعَذِّبُهُم مَّرَّتَيْنِ ثُمَّ يُرَدُّونَ إِلَىٰ عَذَابٍ عَظِيمٍ
          </p>
          <p className="leading-loose text-base">
            <span className="text-emerald-600 dark:text-emerald-400 font-bold ms-1">﴿١٠٢﴾</span>
            وَءَاخَرُونَ ٱعْتَرَفُوا۟ بِذُنُوبِهِمْ خَلَطُوا۟ عَمَلًا صَٰلِحًا وَءَاخَرَ سَيِّئًا عَسَى ٱللَّهُ أَن يَتُوبَ عَلَيْهِمْ ۚ إِنَّ ٱللَّهَ غَفُورٌ رَّحِيمٌ
          </p>
          <p className="leading-loose text-base">
            <span className="text-emerald-600 dark:text-emerald-400 font-bold ms-1">﴿١٠٣﴾</span>
            خُذْ مِنْ أَمْوَٰلِهِمْ صَدَقَةً تُطَهِّرُهُمْ وَتُزَكِّيهِم بِهَا وَصَلِّ عَلَيْهِمْ ۚ إِنَّ صَلَوٰتَكَ سَكَنٌ لَّهُمْ ۗ وَٱللَّهُ سَمِيعٌ عَلِيمٌ
          </p>
          <p className="leading-loose text-base">
            <span className="text-emerald-600 dark:text-emerald-400 font-bold ms-1">﴿١٠٤﴾</span>
            أَلَمْ يَعْلَمُوٓا۟ أَنَّ ٱللَّهَ هُوَ يَقْبَلُ ٱلتَّوْبَةَ عَنْ عِبَادِهِۦ وَيَأْخُذُ ٱلصَّدَقَٰتِ وَأَنَّ ٱللَّهَ هُوَ ٱلتَّوَّابُ ٱلرَّحِيمُ
          </p>
        </div>
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-3 pt-3 border-t border-emerald-200 dark:border-emerald-800/40">
          {ar ? 'سورة التوبة — الآيات ١٠١–١٠٤. هذه الآيات للبركة والتذكير، والاحتساب أدناه تقديري وقابل للمراجعة الشرعية.' : 'Surah At-Tawbah — Verses 101–104. These verses are for blessing and reminder; the calculation below is an estimate subject to scholarly review.'}
        </p>
      </div>

      <div className="card bg-accent-50 dark:bg-accent-900/20 border-accent-200">
        <div className="flex items-start gap-2 text-sm text-accent-700 dark:text-accent-300">
          <Calculator className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">{ar ? 'تنبيه شرعي' : 'Islamic Notice'}</p>
            <p className="mt-1">{ar ? 'هذا الاحتساب تقديري وقابل للمراجعة. لا يُعد فتوى نهائية. راجع عالمًا مختصًا للحالات المعقدة. لا تُدخل الأصول الثابتة المستخدمة في التشغيل تلقائيًا.' : 'This is an estimate and subject to review. It is not a final fatwa. Consult a qualified scholar for complex cases. Fixed operational assets are not automatically included.'}</p>
          </div>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 text-sm rounded-lg px-3 py-2"><AlertCircle className="w-4 h-4" /><span>{error}</span></div>}

      <div className="grid grid-cols-3 gap-4">
        <div className="card"><div className="text-2xl font-bold text-[var(--color-text)]">{records.length}</div><div className="text-sm text-[var(--color-text-muted)]">{ar ? 'سجلات' : 'Records'}</div></div>
        <div className="card"><div className="text-2xl font-bold text-success-500">{records.reduce((s, r) => s + r.zakat_paid, 0).toFixed(2)}</div><div className="text-sm text-[var(--color-text-muted)]">{ar ? 'إجمالي المدفوع' : 'Total Paid'}</div></div>
        <div className="card"><div className="text-2xl font-bold text-warning-500">{records.reduce((s, r) => s + (r.zakat_due - r.zakat_paid), 0).toFixed(2)}</div><div className="text-sm text-[var(--color-text-muted)]">{ar ? 'إجمالي المتبقي' : 'Total Remaining'}</div></div>
      </div>

      {records.length === 0 ? (
        <div className="card text-center py-12 text-[var(--color-text-muted)]">{ar ? 'لا توجد سجلات زكاة بعد' : 'No zakat records yet'}</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                <th className="text-start py-2 px-3 font-medium">{ar ? 'السنة الهجرية' : 'Hijri Year'}</th>
                <th className="text-end py-2 px-3 font-medium">{ar ? 'النقد' : 'Cash'}</th>
                <th className="text-end py-2 px-3 font-medium">{ar ? 'المدينون' : 'Receivables'}</th>
                <th className="text-end py-2 px-3 font-medium">{ar ? 'المخزون' : 'Inventory'}</th>
                <th className="text-end py-2 px-3 font-medium">{ar ? 'وعاء الزكاة' : 'Zakat Base'}</th>
                <th className="text-end py-2 px-3 font-medium">{ar ? 'المستحق' : 'Due'}</th>
                <th className="text-end py-2 px-3 font-medium">{ar ? 'المدفوع' : 'Paid'}</th>
                <th className="text-start py-2 px-3 font-medium">{ar ? 'الحالة' : 'Status'}</th>
                <th className="text-end py-2 px-3 font-medium">{ar ? 'إجراء' : 'Action'}</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                  <td className="py-2 px-3 font-medium text-[var(--color-text)]">{r.hijri_year}هـ</td>
                  <td className="py-2 px-3 text-end text-[var(--color-text)]">{r.cash_amount.toFixed(2)}</td>
                  <td className="py-2 px-3 text-end text-[var(--color-text)]">{r.receivables_amount.toFixed(2)}</td>
                  <td className="py-2 px-3 text-end text-[var(--color-text)]">{r.inventory_amount.toFixed(2)}</td>
                  <td className="py-2 px-3 text-end font-medium text-[var(--color-text)]">{r.total_zakat_base.toFixed(2)}</td>
                  <td className="py-2 px-3 text-end font-bold text-success-600">{r.zakat_due.toFixed(2)}</td>
                  <td className="py-2 px-3 text-end text-[var(--color-text)]">{r.zakat_paid.toFixed(2)}</td>
                  <td className="py-2 px-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === 'paid' ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' : r.status === 'partial' ? 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'}`}>
                      {r.status === 'paid' ? (ar ? 'مدفوع' : 'Paid') : r.status === 'partial' ? (ar ? 'جزئي' : 'Partial') : (ar ? 'محتسب' : 'Calculated')}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-end">
                    {r.status !== 'paid' && (
                      <button onClick={() => recordPayment(r)} disabled={!ZAKAT_WRITES_ENABLED} className="btn-secondary !p-1.5 text-success-600" title={ar ? 'تسجيل دفعة' : 'Record Payment'}>
                        <Save className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={ar ? 'احتساب زكاة جديد' : 'New Zakat Calculation'} size="lg">
        {error && <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 text-sm rounded-lg px-3 py-2 mb-4"><AlertCircle className="w-4 h-4" /><span>{error}</span></div>}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'السنة الهجرية' : 'Hijri Year'}</label>
            <div className="flex gap-2 items-center">
              <input type="text" value={form.hijri_year} onChange={(e) => setForm({ ...form, hijri_year: e.target.value })} className="input-field" />
              <span className="text-sm text-[var(--color-text-muted)]">{ar ? 'هـ' : 'AH'}</span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">{ar ? `تاريخ اليوم الهجري: ${todayHijri.day} ${months[todayHijri.month - 1]} ${todayHijri.year}هـ` : `Today (Hijri): ${todayHijri.day} ${months[todayHijri.month - 1]} ${todayHijri.year} AH`}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'الأموال النقدية' : 'Cash Funds'}</label>
              <input type="number" step="0.01" value={form.cash_amount || ''} onChange={(e) => setForm({ ...form, cash_amount: Number(e.target.value) })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'الأرصدة المدينة' : 'Receivables'}</label>
              <input type="number" step="0.01" value={form.receivables_amount || ''} onChange={(e) => setForm({ ...form, receivables_amount: Number(e.target.value) })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'المخزون التجاري' : 'Trade Inventory'}</label>
              <input type="number" step="0.01" value={form.inventory_amount || ''} onChange={(e) => setForm({ ...form, inventory_amount: Number(e.target.value) })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'أخرى' : 'Other'}</label>
              <input type="number" step="0.01" value={form.other_amount || ''} onChange={(e) => setForm({ ...form, other_amount: Number(e.target.value) })} className="input-field" />
            </div>
          </div>

          <div className="space-y-2 p-4 rounded-lg bg-[var(--color-bg)]">
            <div className="flex justify-between text-sm"><span className="text-[var(--color-text-muted)]">{ar ? 'إجمالي وعاء الزكاة' : 'Total Zakat Base'}</span><span className="font-bold text-[var(--color-text)]">{totalBase.toFixed(2)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[var(--color-text-muted)]">{ar ? 'النصاب التقديري (85 جرام ذهب)' : 'Estimated Nisab (85g gold)'}</span><span className="text-[var(--color-text-muted)]">{nisabEstimate.toFixed(0)}</span></div>
            {totalBase < nisabEstimate && (
              <div className="text-xs text-warning-600">{ar ? 'تنبيه: المبلغ أقل من النصاب التقديري' : 'Warning: Amount below estimated Nisab'}</div>
            )}
            <div className="flex justify-between text-sm"><span className="text-[var(--color-text-muted)]">{ar ? 'النسبة (2.5%)' : 'Rate (2.5%)'}</span><span className="text-[var(--color-text)]">2.5%</span></div>
            <div className="flex justify-between pt-2 border-t border-[var(--color-border)]"><span className="font-bold text-[var(--color-text)]">{ar ? 'الزكاة المستحقة' : 'Zakat Due'}</span><span className="text-lg font-bold text-success-600">{zakatDue.toFixed(2)}</span></div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'ملاحظات' : 'Notes'}</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field min-h-16" rows={2} />
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--color-border)]">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">{ar ? 'إلغاء' : 'Cancel'}</button>
            <button onClick={handleSave} disabled={saving || !ZAKAT_WRITES_ENABLED} className="btn-primary flex items-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{ar ? 'حفظ' : 'Save'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
