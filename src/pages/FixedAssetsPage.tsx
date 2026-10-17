import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { FixedAsset } from '@/types/database';
import { formatDualDate } from '@/lib/hijri';
import { exportToCSV } from '@/lib/csv';
import { Building, Plus, Loader2, AlertCircle, Download, Trash2, Pencil, TrendingDown } from 'lucide-react';
import Modal from '@/components/Modal';

const CATEGORIES = ['buildings', 'vehicles', 'equipment', 'furniture', 'computers', 'land', 'other'];
const CATEGORY_AR: Record<string, string> = {
  buildings: 'مباني', vehicles: 'مركبات', equipment: 'معدات', furniture: 'أثاث',
  computers: 'حواسيب', land: 'أراضي', other: 'أخرى',
};
const STATUS_AR: Record<string, string> = {
  active: 'نشط', disposed: 'مستبعد', fully_depreciated: 'مستهلك بالكامل',
};

export default function FixedAssetsPage() {
  const { lang } = useI18n();
  const { profile } = useAuth();
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FixedAsset | null>(null);
  const [saving, setSaving] = useState(false);

  const ar = lang === 'ar';
  const [form, setForm] = useState({
    asset_name: '', asset_name_ar: '', asset_code: '', category: 'equipment',
    purchase_date: '', purchase_cost: 0, salvage_value: 0, useful_life_years: 5,
    depreciation_method: 'straight_line', notes: '',
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const tid = profile?.tenant_id;
    if (!tid) { setLoading(false); return; }
    const { data, error: e } = await supabase
      .from('fixed_assets')
      .select('*')
      .eq('tenant_id', tid)
      .order('created_at', { ascending: false });
    if (e) { setError(e.message); setLoading(false); return; }
    setAssets((data as FixedAsset[]) ?? []);
    setLoading(false);
  }

  const computedDepreciation = (() => {
    const cost = Number(form.purchase_cost) || 0;
    const salvage = Number(form.salvage_value) || 0;
    const years = Number(form.useful_life_years) || 1;
    if (years <= 0) return 0;
    return Math.max(0, (cost - salvage) / years);
  })();

  function openCreate() {
    setEditing(null);
    setForm({ asset_name: '', asset_name_ar: '', asset_code: '', category: 'equipment', purchase_date: '', purchase_cost: 0, salvage_value: 0, useful_life_years: 5, depreciation_method: 'straight_line', notes: '' });
    setError('');
    setModalOpen(true);
  }

  function openEdit(a: FixedAsset) {
    setEditing(a);
    setForm({
      asset_name: a.asset_name, asset_name_ar: a.asset_name_ar ?? '', asset_code: a.asset_code ?? '',
      category: a.category ?? 'equipment', purchase_date: a.purchase_date ?? '',
      purchase_cost: a.purchase_cost, salvage_value: a.salvage_value,
      useful_life_years: a.useful_life_years, depreciation_method: a.depreciation_method,
      notes: a.notes ?? '',
    });
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!profile?.tenant_id || !form.asset_name.trim()) return;
    setSaving(true); setError('');
    try {
      const payload = {
        tenant_id: profile.tenant_id,
        asset_name: form.asset_name.trim(),
        asset_name_ar: form.asset_name_ar.trim() || null,
        asset_code: form.asset_code.trim() || null,
        category: form.category,
        purchase_date: form.purchase_date || null,
        purchase_cost: Number(form.purchase_cost) || 0,
        salvage_value: Number(form.salvage_value) || 0,
        useful_life_years: Number(form.useful_life_years) || 1,
        depreciation_method: form.depreciation_method,
        annual_depreciation: computedDepreciation,
        current_value: (Number(form.purchase_cost) || 0) - 0,
        created_by: profile.id,
      };
      if (editing) {
        const { error: e } = await supabase.from('fixed_assets').update({
          ...payload,
          current_value: editing.current_value,
          accumulated_depreciation: editing.accumulated_depreciation,
        }).eq('id', editing.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from('fixed_assets').insert(payload);
        if (e) throw e;
      }
      setModalOpen(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : (ar ? 'خطأ' : 'Error'));
    } finally { setSaving(false); }
  }

  async function deleteAsset(a: FixedAsset) {
    if (!confirm(ar ? 'حذف هذا الأصل؟' : 'Delete this asset?')) return;
    const { error: e } = await supabase.from('fixed_assets').delete().eq('id', a.id);
    if (e) { setError(e.message); return; }
    loadData();
  }

  async function runDepreciation(a: FixedAsset) {
    if (!confirm(ar ? `احتساب إهلاك سنة واحدة لهذا الأصل؟ (${a.annual_depreciation?.toFixed(2) ?? '0'})` : `Post one year of depreciation? (${a.annual_depreciation?.toFixed(2) ?? '0'})`)) return;
    const newAccum = (a.accumulated_depreciation ?? 0) + (a.annual_depreciation ?? 0);
    const newValue = (a.purchase_cost ?? 0) - newAccum;
    const newStatus = newValue <= (a.salvage_value ?? 0) ? 'fully_depreciated' : 'active';
    const { error: e } = await supabase.from('fixed_assets').update({
      accumulated_depreciation: newAccum,
      current_value: newValue,
      status: newStatus,
    }).eq('id', a.id);
    if (e) { setError(e.message); return; }
    loadData();
  }

  function handleExport() {
    const headers = ar
      ? ['الأصل', 'الكود', 'الفئة', 'تكلفة الشراء', 'القيمة المتبقية', 'الإهلاك السنوي', 'الإهلاك المتراكم', 'الحالة']
      : ['Asset', 'Code', 'Category', 'Purchase Cost', 'Current Value', 'Annual Depreciation', 'Accumulated Depreciation', 'Status'];
    const rows = assets.map((a) => [
      ar ? a.asset_name_ar ?? a.asset_name : a.asset_name,
      a.asset_code ?? '', a.category ?? '',
      a.purchase_cost, a.current_value, a.annual_depreciation,
      a.accumulated_depreciation, a.status,
    ]);
    exportToCSV(ar ? 'الأصول-الثابتة' : 'fixed-assets', headers, rows);
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" /></div>;

  const totalCost = assets.reduce((s, a) => s + (a.purchase_cost ?? 0), 0);
  const totalDepreciation = assets.reduce((s, a) => s + (a.accumulated_depreciation ?? 0), 0);
  const totalBookValue = assets.reduce((s, a) => s + (a.current_value ?? 0), 0);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center"><Building className="w-5 h-5 text-white" /></div>
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text)]">{ar ? 'الأصول الثابتة' : 'Fixed Assets'}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">{ar ? 'تتبع الأصول وحساب الإهلاك' : 'Asset tracking and depreciation'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} disabled={assets.length === 0} className="btn-secondary flex items-center gap-2"><Download className="w-4 h-4" />{ar ? 'تصدير' : 'Export'}</button>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />{ar ? 'أصل جديد' : 'New Asset'}</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card"><div className="text-2xl font-bold text-[var(--color-text)]">{totalCost.toFixed(0)}</div><div className="text-sm text-[var(--color-text-muted)]">{ar ? 'إجمالي التكلفة' : 'Total Cost'}</div></div>
        <div className="card"><div className="text-2xl font-bold text-error-500">{totalDepreciation.toFixed(0)}</div><div className="text-sm text-[var(--color-text-muted)]">{ar ? 'إجمالي الإهلاك' : 'Total Depreciation'}</div></div>
        <div className="card"><div className="text-2xl font-bold text-success-500">{totalBookValue.toFixed(0)}</div><div className="text-sm text-[var(--color-text-muted)]">{ar ? 'صافي القيمة الدفترية' : 'Net Book Value'}</div></div>
      </div>

      {error && <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 text-sm rounded-lg px-3 py-2"><AlertCircle className="w-4 h-4" /><span>{error}</span></div>}

      {assets.length === 0 ? (
        <div className="card text-center py-12 text-[var(--color-text-muted)]">{ar ? 'لا توجد أصول مسجلة' : 'No assets recorded'}</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                <th className="text-start py-2 px-3 font-medium">{ar ? 'الأصل' : 'Asset'}</th>
                <th className="text-start py-2 px-3 font-medium">{ar ? 'الفئة' : 'Category'}</th>
                <th className="text-end py-2 px-3 font-medium">{ar ? 'التكلفة' : 'Cost'}</th>
                <th className="text-end py-2 px-3 font-medium">{ar ? 'الإهلاك السنوي' : 'Annual Depr.'}</th>
                <th className="text-end py-2 px-3 font-medium">{ar ? 'المتراكم' : 'Accumulated'}</th>
                <th className="text-end py-2 px-3 font-medium">{ar ? 'القيمة الحالية' : 'Current Value'}</th>
                <th className="text-center py-2 px-3 font-medium">{ar ? 'الحالة' : 'Status'}</th>
                <th className="text-end py-2 px-3 font-medium">{ar ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                  <td className="py-2 px-3">
                    <div className="font-medium text-[var(--color-text)]">{ar ? a.asset_name_ar ?? a.asset_name : a.asset_name}</div>
                    {a.asset_code && <div className="text-xs text-[var(--color-text-muted)]">{a.asset_code}</div>}
                  </td>
                  <td className="py-2 px-3 text-[var(--color-text-muted)]">{a.category ? (ar ? CATEGORY_AR[a.category] ?? a.category : a.category) : '—'}</td>
                  <td className="py-2 px-3 text-end font-medium text-[var(--color-text)]">{a.purchase_cost?.toFixed(2) ?? '0'}</td>
                  <td className="py-2 px-3 text-end text-accent-600">{a.annual_depreciation?.toFixed(2) ?? '0'}</td>
                  <td className="py-2 px-3 text-end text-error-500">{a.accumulated_depreciation?.toFixed(2) ?? '0'}</td>
                  <td className="py-2 px-3 text-end font-medium text-success-600">{a.current_value?.toFixed(2) ?? '0'}</td>
                  <td className="py-2 px-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${a.status === 'active' ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' : a.status === 'disposed' ? 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'}`}>
                      {ar ? STATUS_AR[a.status ?? ''] ?? a.status ?? '—' : a.status ?? '—'}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-end">
                    <div className="flex gap-1 justify-end">
                      {a.status === 'active' && (
                        <button onClick={() => runDepreciation(a)} className="btn-secondary !p-1.5 text-accent-600" title={ar ? 'احتساب إهلاك' : 'Post depreciation'}>
                          <TrendingDown className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => openEdit(a)} className="btn-secondary !p-1.5" title={ar ? 'تعديل' : 'Edit'}><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteAsset(a)} className="btn-secondary !p-1.5 text-error-500" title={ar ? 'حذف' : 'Delete'}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? (ar ? 'تعديل أصل' : 'Edit Asset') : (ar ? 'أصل ثابت جديد' : 'New Fixed Asset')}>
        {error && <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 text-sm rounded-lg px-3 py-2 mb-4"><AlertCircle className="w-4 h-4" /><span>{error}</span></div>}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'اسم الأصل' : 'Asset Name'} *</label><input type="text" value={form.asset_name} onChange={(e) => setForm({ ...form, asset_name: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'الاسم بالعربية' : 'Arabic Name'}</label><input type="text" value={form.asset_name_ar} onChange={(e) => setForm({ ...form, asset_name_ar: e.target.value })} className="input-field" dir="rtl" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'كود الأصل' : 'Asset Code'}</label><input type="text" value={form.asset_code} onChange={(e) => setForm({ ...form, asset_code: e.target.value })} className="input-field" placeholder="ASSET-001" /></div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'الفئة' : 'Category'}</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input-field">
                {CATEGORIES.map((c) => <option key={c} value={c}>{ar ? CATEGORY_AR[c] : c}</option>)}
              </select>
            </div>
          </div>
          <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'تاريخ الشراء' : 'Purchase Date'}</label><input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} className="input-field" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'تكلفة الشراء' : 'Purchase Cost'}</label><input type="number" step="0.01" value={form.purchase_cost || ''} onChange={(e) => setForm({ ...form, purchase_cost: Number(e.target.value) })} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'القيمة المتبقية' : 'Salvage Value'}</label><input type="number" step="0.01" value={form.salvage_value || ''} onChange={(e) => setForm({ ...form, salvage_value: Number(e.target.value) })} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'العمر (سنوات)' : 'Useful Life (years)'}</label><input type="number" min="1" value={form.useful_life_years} onChange={(e) => setForm({ ...form, useful_life_years: Number(e.target.value) })} className="input-field" /></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'طريقة الإهلاك' : 'Depreciation Method'}</label>
            <select value={form.depreciation_method} onChange={(e) => setForm({ ...form, depreciation_method: e.target.value })} className="input-field">
              <option value="straight_line">{ar ? 'قسط ثابت' : 'Straight Line'}</option>
              <option value="declining_balance">{ar ? 'قسط متناقص' : 'Declining Balance'}</option>
            </select>
          </div>
          <div className="p-3 rounded-lg bg-[var(--color-bg)] flex justify-between items-center">
            <span className="text-sm font-medium text-[var(--color-text-muted)]">{ar ? 'الإهلاك السنوي المحسوب' : 'Computed Annual Depreciation'}</span>
            <span className="font-bold text-accent-600">{computedDepreciation.toFixed(2)}</span>
          </div>
          <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{ar ? 'ملاحظات' : 'Notes'}</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field min-h-16" rows={2} /></div>
          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--color-border)]"><button onClick={() => setModalOpen(false)} className="btn-secondary">{ar ? 'إلغاء' : 'Cancel'}</button><button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{ar ? 'حفظ' : 'Save'}</button></div>
        </div>
      </Modal>
    </div>
  );
}
