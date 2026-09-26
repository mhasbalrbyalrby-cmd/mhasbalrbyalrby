import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Product, Warehouse, UnitOfMeasure } from '@/lib/database';
import Modal from '@/components/Modal';
import {
  Package, Plus, Search, Loader2, AlertCircle, Pencil, Trash2,
} from 'lucide-react';

export default function InventoryPage() {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [units, setUnits] = useState<UnitOfMeasure[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    code: '', name: '', name_ar: '', type: 'product' as 'product' | 'service',
    barcode: '', cost_price: 0, sale_price: 0, min_stock: 0, unit_id: '', category: '',
  });

  useEffect(() => { loadData(); }, [profile?.tenant_id]);

  async function loadData() {
    setLoading(true);
    const tid = profile?.tenant_id;
    if (!tid) { setLoading(false); return; }
    const [{ data: p }, { data: w }, { data: u }] = await Promise.all([
      supabase.from('products').select('*').eq('tenant_id', tid).order('created_at', { ascending: false }),
      supabase.from('warehouses').select('*').eq('tenant_id', tid),
      supabase.from('units_of_measure').select('*').eq('tenant_id', tid),
    ]);
    setProducts((p as Product[]) ?? []);
    setWarehouses((w as Warehouse[]) ?? []);
    setUnits((u as UnitOfMeasure[]) ?? []);
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setForm({ code: '', name: '', name_ar: '', type: 'product', barcode: '', cost_price: 0, sale_price: 0, min_stock: 0, unit_id: '', category: '' });
    setError('');
    setModalOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({ code: p.code ?? '', name: p.name, name_ar: p.name_ar ?? '', type: p.type, barcode: p.barcode ?? '', cost_price: p.cost_price, sale_price: p.sale_price, min_stock: p.min_stock, unit_id: p.unit_id ?? '', category: p.category ?? '' });
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError(lang === 'ar' ? 'الاسم مطلوب' : 'Name is required'); return; }
    if (!profile?.tenant_id) return;
    setSaving(true); setError('');
    try {
      const payload = {
        tenant_id: profile.tenant_id,
        code: form.code.trim() || null,
        name: form.name.trim(),
        name_ar: form.name_ar.trim() || null,
        type: form.type,
        barcode: form.barcode.trim() || null,
        cost_price: Number(form.cost_price) || 0,
        sale_price: Number(form.sale_price) || 0,
        min_stock: Number(form.min_stock) || 0,
        unit_id: form.unit_id || null,
        category: form.category.trim() || null,
        is_active: true,
      };
      if (editing) {
        const { error: e } = await supabase.from('products').update(payload).eq('id', editing.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from('products').insert({ ...payload, created_by: profile.id });
        if (e) throw e;
      }
      setModalOpen(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.generic'));
    } finally { setSaving(false); }
  }

  async function handleDelete(p: Product) {
    if (!confirm(lang === 'ar' ? 'حذف الصنف؟' : 'Delete item?')) return;
    const { error } = await supabase.from('products').delete().eq('id', p.id);
    if (!error) loadData();
  }

  const filtered = products.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.name_ar ?? '').includes(search) || (p.code ?? '').includes(search) || (p.barcode ?? '').includes(search)
  );

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center"><Package className="w-5 h-5 text-white" /></div>
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text)]">{t('nav.inventory')}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'المنتجات والمخازن والمخزون' : 'Products, warehouses, and stock'}</p>
          </div>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />{lang === 'ar' ? 'صنف جديد' : 'New Item'}</button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-[var(--color-text-muted)]" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('common.search')} className="input-field ps-10" />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card"><div className="text-2xl font-bold text-[var(--color-text)]">{products.length}</div><div className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'إجمالي الأصناف' : 'Total Items'}</div></div>
        <div className="card"><div className="text-2xl font-bold text-primary-500">{products.filter((p) => p.type === 'product').length}</div><div className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'منتجات' : 'Products'}</div></div>
        <div className="card"><div className="text-2xl font-bold text-secondary-500">{products.filter((p) => p.type === 'service').length}</div><div className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'خدمات' : 'Services'}</div></div>
        <div className="card"><div className="text-2xl font-bold text-accent-500">{warehouses.length}</div><div className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'مخازن' : 'Warehouses'}</div></div>
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-12 text-[var(--color-text-muted)]">{t('common.no_data')}</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'الكود' : 'Code'}</th>
                <th className="text-start py-2 px-3 font-medium">{t('common.name')}</th>
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'النوع' : 'Type'}</th>
                <th className="text-end py-2 px-3 font-medium">{lang === 'ar' ? 'التكلفة' : 'Cost'}</th>
                <th className="text-end py-2 px-3 font-medium">{lang === 'ar' ? 'السعر' : 'Price'}</th>
                <th className="text-end py-2 px-3 font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                  <td className="py-2 px-3 font-mono text-[var(--color-text)]">{p.code ?? '—'}</td>
                  <td className="py-2 px-3"><div className="font-medium text-[var(--color-text)]">{lang === 'ar' ? p.name_ar ?? p.name : p.name}</div>{p.barcode && <div className="text-xs text-[var(--color-text-muted)]">{p.barcode}</div>}</td>
                  <td className="py-2 px-3"><span className={`text-xs px-2 py-0.5 rounded-full ${p.type === 'product' ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' : 'bg-secondary-100 text-secondary-700 dark:bg-secondary-900/30 dark:text-secondary-400'}`}>{p.type === 'product' ? (lang === 'ar' ? 'منتج' : 'Product') : (lang === 'ar' ? 'خدمة' : 'Service')}</span></td>
                  <td className="py-2 px-3 text-end text-[var(--color-text-muted)]">{p.cost_price.toFixed(2)}</td>
                  <td className="py-2 px-3 text-end font-medium text-[var(--color-text)]">{p.sale_price.toFixed(2)}</td>
                  <td className="py-2 px-3 text-end"><div className="flex gap-1 justify-end"><button onClick={() => openEdit(p)} className="btn-secondary !p-1.5"><Pencil className="w-3.5 h-3.5" /></button><button onClick={() => handleDelete(p)} className="btn-secondary !p-1.5 text-error-500"><Trash2 className="w-3.5 h-3.5" /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? t('common.edit') : lang === 'ar' ? 'صنف جديد' : 'New Item'}>
        {error && <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg px-3 py-2 mb-4"><AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span></div>}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الكود' : 'Code'}</label><input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="input-field font-mono" /></div>
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الباركود' : 'Barcode'}</label><input type="text" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="input-field" /></div>
          </div>
          <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{t('common.name')} *</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" required /></div>
          <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الاسم بالعربية' : 'Arabic Name'}</label><input type="text" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} className="input-field" dir="rtl" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'النوع' : 'Type'}</label><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'product' | 'service' })} className="input-field"><option value="product">{lang === 'ar' ? 'منتج' : 'Product'}</option><option value="service">{lang === 'ar' ? 'خدمة' : 'Service'}</option></select></div>
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'التصنيف' : 'Category'}</label><input type="text" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input-field" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'التكلفة' : 'Cost'}</label><input type="number" step="0.01" value={form.cost_price || ''} onChange={(e) => setForm({ ...form, cost_price: Number(e.target.value) })} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'السعر' : 'Price'}</label><input type="number" step="0.01" value={form.sale_price || ''} onChange={(e) => setForm({ ...form, sale_price: Number(e.target.value) })} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'حد أدنى' : 'Min Stock'}</label><input type="number" step="0.01" value={form.min_stock || ''} onChange={(e) => setForm({ ...form, min_stock: Number(e.target.value) })} className="input-field" /></div>
          </div>
          {units.length > 0 && (
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الوحدة' : 'Unit'}</label><select value={form.unit_id} onChange={(e) => setForm({ ...form, unit_id: e.target.value })} className="input-field"><option value="">{lang === 'ar' ? 'بدون' : 'None'}</option>{units.map((u) => <option key={u.id} value={u.id}>{lang === 'ar' ? u.name_ar ?? u.name : u.name}</option>)}</select></div>
          )}
          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--color-border)]"><button onClick={() => setModalOpen(false)} className="btn-secondary">{t('common.cancel')}</button><button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}</button></div>
        </div>
      </Modal>
    </div>
  );
}
