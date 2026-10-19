import { useEffect, useState } from 'react';
import BarcodeScanner from '@/components/BarcodeScanner';
import { useI18n } from '@/lib/i18n-context';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Product, Warehouse, UnitOfMeasure } from '@/lib/database';
import { parseCSV, type CSVRow } from '@/lib/csv';
import Modal from '@/components/Modal';
import {
  Package, Plus, Search, Loader2, AlertCircle, Pencil, Trash2, Download, Upload,
} from 'lucide-react';

export default function InventoryPage() {
  const { t, lang } = useI18n();
  const { profile, tenant } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [units, setUnits] = useState<UnitOfMeasure[]>([]);
  type ProductUnitRow = { id?: string; name: string; name_ar: string; factor: string; barcode: string; is_base: boolean; is_purchase_unit: boolean; is_sale_unit: boolean; allow_fraction: boolean };
  const [productUnits, setProductUnits] = useState<ProductUnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerUnitIndex, setScannerUnitIndex] = useState<number | null>(null);
  const [showUnitCreate, setShowUnitCreate] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitNameAr, setNewUnitNameAr] = useState('');
  const [savingUnit, setSavingUnit] = useState(false);
  const [importRows, setImportRows] = useState<CSVRow[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  const [form, setForm] = useState({
    code: '', name: '', name_ar: '', type: 'product' as 'product' | 'service',
    barcode: '', cost_price: '', sale_price: '', min_stock: '0', unit_id: '', category: '',
  });

  useEffect(() => { void loadData(); }, [tenant?.id]);

  async function loadData() {
    setLoading(true);
    const tid = tenant?.id;
    if (!tid) { setLoading(false); return; }
    const [
      { data: p, error: productsError },
      { data: w, error: warehousesError },
      { data: u, error: unitsError },
    ] = await Promise.all([
      supabase.from('products').select('*').eq('tenant_id', tid).order('created_at', { ascending: false }),
      supabase.from('warehouses').select('*').eq('tenant_id', tid),
      supabase.from('units_of_measure').select('*').eq('tenant_id', tid),
    ]);
    const loadError = productsError ?? warehousesError ?? unitsError;
    if (loadError) setError(loadError.message);
    setProducts((p as Product[]) ?? []);
    setWarehouses((w as Warehouse[]) ?? []);
    setUnits((u as UnitOfMeasure[]) ?? []);
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setForm({ code: '', name: '', name_ar: '', type: 'product', barcode: '', cost_price: '', sale_price: '', min_stock: '0', unit_id: '', category: '' });
    setProductUnits([{ name: '', name_ar: '', factor: '1', barcode: '', is_base: true, is_purchase_unit: true, is_sale_unit: true, allow_fraction: false }]);
    setError('');
    setModalOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({ code: p.code ?? '', name: p.name, name_ar: p.name_ar ?? '', type: p.type, barcode: p.barcode ?? '', cost_price: p.cost_price == null ? '' : String(p.cost_price), sale_price: p.sale_price == null ? '' : String(p.sale_price), min_stock: String(p.min_stock ?? 0), unit_id: p.unit_id ?? '', category: p.category ?? '' });
    void supabase.from('product_units').select('*').eq('tenant_id', tenant?.id ?? '').eq('product_id', p.id).order('created_at').then(({ data, error: unitError }) => {
      if (unitError) { setError(unitError.message); return; }
      setProductUnits((data ?? []).map((u: any) => ({ id: u.id, name: u.name, name_ar: u.name_ar ?? '', factor: String(u.factor), barcode: u.barcode ?? '', is_base: u.is_base, is_purchase_unit: u.is_purchase_unit, is_sale_unit: u.is_sale_unit, allow_fraction: u.allow_fraction })));
    });
    setError('');
    setModalOpen(true);
  }

  async function handleAddUnit() {
    const unitName = newUnitName.trim();
    if (!unitName) {
      setError(lang === 'ar' ? 'اسم الوحدة مطلوب.' : 'Unit name is required.');
      return;
    }
    if (!tenant?.id) {
      setError(lang === 'ar' ? 'تعذر تحديد المؤسسة الحالية.' : 'The current organization could not be resolved.');
      return;
    }
    setSavingUnit(true);
    setError('');
    try {
      const { data, error: insertError } = await supabase
        .from('units_of_measure')
        .insert({ tenant_id: tenant.id, name: unitName, name_ar: newUnitNameAr.trim() || null, is_base: false })
        .select('*')
        .single();
      if (insertError) throw insertError;
      if (!data) throw new Error(lang === 'ar' ? 'لم تُرجع قاعدة البيانات الوحدة المحفوظة.' : 'The database did not return the saved unit.');
      const savedUnit = data as UnitOfMeasure;
      setUnits((current) => [...current, savedUnit]);
      setForm((current) => ({ ...current, unit_id: savedUnit.id }));
      setNewUnitName('');
      setNewUnitNameAr('');
      setShowUnitCreate(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error.generic'));
    } finally {
      setSavingUnit(false);
    }
  }

  async function handleSave() {
    if (!form.name.trim()) { setError(lang === 'ar' ? 'الاسم مطلوب' : 'Name is required'); return; }
    if (!tenant?.id || !profile?.id) { setError(lang === 'ar' ? 'تعذر تحديد المؤسسة أو المستخدم الحالي.' : 'The current organization or user could not be resolved.'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        tenant_id: tenant.id,
        code: form.code.trim() || null,
        name: form.name.trim(),
        name_ar: form.name_ar.trim() || null,
        type: form.type,
        barcode: form.barcode.trim() || null,
        cost_price: form.cost_price.trim() === '' ? null : Number(form.cost_price),
        sale_price: form.sale_price.trim() === '' ? null : Number(form.sale_price),
        min_stock: form.min_stock.trim() === '' ? 0 : Number(form.min_stock),
        unit_id: form.unit_id || null,
        category: form.category.trim() || null,
        is_active: true,
      };
      let productId = editing?.id;
      if (editing) {
        const { error: e } = await supabase.from('products').update(payload).eq('id', editing.id).eq('tenant_id', tenant.id);
        if (e) throw e;
      } else {
        const { data, error: e } = await supabase.from('products').insert({ ...payload, created_by: profile.id }).select('id').single();
        if (e) throw e;
        productId = data.id;
      }
      if (productId && form.type === 'product') {
        const namedUnits = productUnits.filter((u) => u.name.trim());
        if (namedUnits.length && namedUnits.filter((u) => u.is_base).length !== 1) throw new Error(lang === 'ar' ? 'حدد وحدة أساسية واحدة فقط.' : 'Select exactly one base unit.');
        const { data: existingUnits, error: existingError } = await supabase.from('product_units').select('id').eq('tenant_id', tenant.id).eq('product_id', productId);
        if (existingError) throw existingError;
        const retainedIds = new Set(productUnits.filter((u) => u.name.trim()).map((u) => u.id).filter(Boolean));
        const removeIds = (existingUnits ?? []).map((u) => u.id).filter((id: string) => !retainedIds.has(id));
        if (removeIds.length) {
          const { error: deleteError } = await supabase.from('product_units').delete().eq('tenant_id', tenant.id).eq('product_id', productId).in('id', removeIds);
          if (deleteError) throw deleteError;
        }
        for (const unit of namedUnits) {
          const unitPayload = { tenant_id: tenant.id, product_id: productId, name: unit.name.trim(), name_ar: unit.name_ar.trim() || null, factor: Number(unit.factor), barcode: unit.barcode.trim() || null, is_base: unit.is_base, is_purchase_unit: unit.is_purchase_unit, is_sale_unit: unit.is_sale_unit, allow_fraction: unit.allow_fraction };
          if (!Number.isFinite(Number(unit.factor)) || Number(unit.factor) <= 0) throw new Error(lang === 'ar' ? 'معامل تحويل الوحدة يجب أن يكون أكبر من صفر.' : 'Unit conversion factor must be greater than zero.');
          const result = unit.id
            ? await supabase.from('product_units').update(unitPayload).eq('tenant_id', tenant.id).eq('product_id', productId).eq('id', unit.id)
            : await supabase.from('product_units').insert(unitPayload);
          if (result.error) throw result.error;
        }
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.generic'));
    } finally { setSaving(false); }
  }

  async function handleDelete(p: Product) {
    if (!confirm(lang === 'ar' ? 'حذف الصنف؟' : 'Delete item?')) return;
    const { error } = await supabase.from('products').delete().eq('id', p.id);
    if (!error) loadData();
  }

  async function handleCsvFile(file?: File) {
    if (!file) return;
    setError('');
    setImportErrors([]);
    try {
      const text = (await file.text()).replace(/^\uFEFF/, '');
      const rows = parseCSV(text, ['code', 'name', 'name_ar', 'type', 'barcode', 'cost_price', 'sale_price', 'min_stock', 'unit', 'category']);
      if (!rows.length) throw new Error(lang === 'ar' ? 'الملف فارغ أو لا يحتوي صفوف بيانات.' : 'The file is empty or contains no data rows.');
      const errors: string[] = [];
      const codes = new Set<string>();
      const barcodes = new Set<string>();
      rows.forEach((row, index) => {
        const line = index + 2;
        if (!row.name?.trim()) errors.push(`سطر ${line}: الاسم مطلوب / Row ${line}: name is required`);
        if (row.type && !['product', 'service'].includes(row.type.trim().toLowerCase())) errors.push(`سطر ${line}: النوع يجب أن يكون product أو service / invalid type`);
        for (const field of ['cost_price', 'sale_price', 'min_stock']) {
          if (row[field]?.trim() && (!Number.isFinite(Number(row[field])) || Number(row[field]) < 0)) errors.push(`سطر ${line}: قيمة غير صحيحة في ${field}`);
        }
        const code = row.code?.trim().toLowerCase();
        if (code && codes.has(code)) errors.push(`سطر ${line}: كود مكرر داخل الملف: ${row.code}`);
        if (code) codes.add(code);
        const barcode = row.barcode?.trim();
        if (barcode && barcodes.has(barcode)) errors.push(`سطر ${line}: باركود مكرر داخل الملف: ${barcode}`);
        if (barcode) barcodes.add(barcode);
      });
      const existingCodes = new Set(products.map((p) => (p.code ?? '').toLowerCase()).filter(Boolean));
      const existingBarcodes = new Set(products.map((p) => p.barcode ?? '').filter(Boolean));
      rows.forEach((row, index) => {
        if (row.code?.trim() && existingCodes.has(row.code.trim().toLowerCase())) errors.push(`سطر ${index + 2}: الكود موجود مسبقاً: ${row.code}`);
        if (row.barcode?.trim() && existingBarcodes.has(row.barcode.trim())) errors.push(`سطر ${index + 2}: الباركود موجود مسبقاً: ${row.barcode}`);
      });
      setImportRows(rows);
      setImportErrors(errors);
      setImportOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (lang === 'ar' ? 'تعذرت قراءة ملف CSV.' : 'Could not read the CSV file.'));
    }
  }

  async function confirmCsvImport() {
    if (!tenant?.id || importErrors.length || !importRows.length) return;
    setImporting(true);
    setError('');
    try {
      const unitByName = new Map(units.map((unit) => [unit.name.toLowerCase(), unit.id]));
      const payload = importRows.map((row) => ({
        tenant_id: tenant.id,
        code: row.code?.trim() || null,
        name: row.name.trim(),
        name_ar: row.name_ar?.trim() || null,
        type: (row.type?.trim().toLowerCase() === 'service' ? 'service' : 'product') as 'product' | 'service',
        barcode: row.barcode?.trim() || null,
        cost_price: row.cost_price?.trim() ? Number(row.cost_price) : null,
        sale_price: row.sale_price?.trim() ? Number(row.sale_price) : null,
        min_stock: Number(row.min_stock || 0),
        unit_id: unitByName.get((row.unit ?? '').trim().toLowerCase()) ?? null,
        category: row.category?.trim() || null,
        is_active: true,
        created_by: profile?.id ?? null,
      }));
      const { error: insertError } = await supabase.from('products').insert(payload);
      if (insertError) throw insertError;
      setImportOpen(false);
      setImportRows([]);
      setImportErrors([]);
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (lang === 'ar' ? 'فشل استيراد الأصناف.' : 'Failed to import products.'));
    } finally {
      setImporting(false);
    }
  }

  function exportProductsCsv() {
    const headers = ['code', 'name', 'name_ar', 'type', 'barcode', 'cost_price', 'sale_price', 'min_stock', 'unit', 'category'];
    const rows = filtered.map((product) => [
      product.code ?? '',
      product.name,
      product.name_ar ?? '',
      product.type,
      product.barcode ?? '',
      product.cost_price,
      product.sale_price,
      product.min_stock,
      units.find((unit) => unit.id === product.unit_id)?.name ?? '',
      product.category ?? '',
    ]);
    const escapeCsv = (value: unknown) => {
      const textValue = String(value ?? '');
      return /[",\\r\\n]/.test(textValue) ? `"${textValue.replace(/"/g, '""')}"` : textValue;
    };
    const csv = '\\uFEFF' + [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\\r\\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
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
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportProductsCsv} disabled={filtered.length === 0} className="btn-secondary flex items-center gap-2 disabled:opacity-50"><Download className="w-4 h-4" />{lang === 'ar' ? 'تصدير CSV' : 'Export CSV'}</button>
          <label className="btn-secondary flex items-center gap-2 cursor-pointer"><Upload className="w-4 h-4" />{lang === 'ar' ? 'استيراد CSV' : 'Import CSV'}<input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { void handleCsvFile(e.target.files?.[0]); e.currentTarget.value = ''; }} /></label>
          <button type="button" onClick={openCreate} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />{lang === 'ar' ? 'صنف جديد' : 'New Item'}</button>
        </div>
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

      {importOpen && (
        <Modal open={importOpen} title={lang === 'ar' ? 'معاينة استيراد الأصناف CSV' : 'Preview CSV import'} onClose={() => setImportOpen(false)}>
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? `عدد الصفوف: ${importRows.length}. أسماء الأعمدة المطلوبة: name، ويمكن استخدام code, name_ar, type, barcode, cost_price, sale_price, min_stock, unit, category.` : `Rows: ${importRows.length}. Required column: name. Optional: code, name_ar, type, barcode, cost_price, sale_price, min_stock, unit, category.`}</p>
            {importErrors.length > 0 && <div role="alert" className="rounded-lg bg-error-50 dark:bg-error-900/30 p-3 text-sm text-error-700 dark:text-error-300"><strong>{lang === 'ar' ? `أخطاء التحقق (${importErrors.length})` : `Validation errors (${importErrors.length})`}</strong><ul className="list-disc ps-5 mt-2 max-h-40 overflow-auto">{importErrors.slice(0, 30).map((issue, i) => <li key={i}>{issue}</li>)}</ul></div>}
            <div className="overflow-x-auto max-h-56 border border-[var(--color-border)] rounded-lg"><table className="w-full text-xs"><thead><tr>{['code','name','type','barcode','cost_price','sale_price'].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead><tbody>{importRows.slice(0, 8).map((row, i) => <tr key={i} className="border-t border-[var(--color-border)]">{['code','name','type','barcode','cost_price','sale_price'].map((h) => <td key={h} className="p-2">{row[h] ?? ''}</td>)}</tr>)}</tbody></table></div>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setImportOpen(false)} className="btn-secondary">{t('common.cancel')}</button><button type="button" onClick={() => void confirmCsvImport()} disabled={importing || importErrors.length > 0 || importRows.length === 0} className="btn-primary">{importing ? (lang === 'ar' ? 'جارٍ الاستيراد…' : 'Importing…') : (lang === 'ar' ? 'تأكيد الاستيراد' : 'Confirm import')}</button></div>
          </div>
        </Modal>
      )}

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
                  <td className="py-2 px-3 text-end text-[var(--color-text-muted)]">{p.cost_price == null ? '—' : Number(p.cost_price).toFixed(2)}</td>
                  <td className="py-2 px-3 text-end font-medium text-[var(--color-text)]">{p.sale_price == null ? '—' : Number(p.sale_price).toFixed(2)}</td>
                  <td className="py-2 px-3 text-end"><div className="flex gap-1 justify-end"><button type="button" onClick={() => openEdit(p)} aria-label={lang === 'ar' ? `تعديل الصنف ${p.name_ar ?? p.name}` : `Edit item ${p.name}`} className="btn-secondary !p-1.5"><Pencil className="w-3.5 h-3.5" /></button><button type="button" onClick={() => handleDelete(p)} aria-label={lang === 'ar' ? `حذف الصنف ${p.name_ar ?? p.name}` : `Delete item ${p.name}`} className="btn-secondary !p-1.5 text-error-500"><Trash2 className="w-3.5 h-3.5" /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? t('common.edit') : lang === 'ar' ? 'صنف جديد' : 'New Item'}>
        {scannerOpen && <div className="mb-4"><BarcodeScanner lang={lang} onDetected={(value) => { if (scannerUnitIndex === null) setForm((current) => ({ ...current, barcode: value })); else setProductUnits((rows) => rows.map((row, index) => index === scannerUnitIndex ? { ...row, barcode: value } : row)); setScannerUnitIndex(null); setScannerOpen(false); }} onClose={() => setScannerOpen(false)} /></div>}
        {error && <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg px-3 py-2 mb-4"><AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span></div>}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الكود' : 'Code'}</label><input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="input-field font-mono" /></div>
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الباركود' : 'Barcode'}</label><div className="flex gap-2"><input type="text" inputMode="numeric" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="input-field min-w-0" /><button type="button" onClick={() => { setScannerUnitIndex(null); setScannerOpen(true); }} aria-label={lang === 'ar' ? 'فتح كاميرا قراءة الباركود' : 'Open barcode scanner camera'} className="btn-secondary !px-3 shrink-0" title={lang === 'ar' ? 'قراءة بالكاميرا' : 'Scan with camera'}><span aria-hidden="true">▦</span><span className="sr-only">{lang === 'ar' ? 'قراءة بالكاميرا' : 'Scan with camera'}</span></button></div></div>
          </div>
          <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{t('common.name')} *</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" required /></div>
          <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الاسم بالعربية' : 'Arabic Name'}</label><input type="text" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} className="input-field" dir="rtl" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'النوع' : 'Type'}</label><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'product' | 'service' })} className="input-field"><option value="product">{lang === 'ar' ? 'منتج' : 'Product'}</option><option value="service">{lang === 'ar' ? 'خدمة' : 'Service'}</option></select></div>
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'التصنيف' : 'Category'}</label><input type="text" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input-field" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'التكلفة' : 'Cost'}</label><input type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'السعر' : 'Price'}</label><input type="number" step="0.01" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'حد أدنى' : 'Min Stock'}</label><input type="number" step="0.01" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} className="input-field" /></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الوحدة' : 'Unit'}</label>
            <div className="flex gap-2">
              <select value={form.unit_id} onChange={(e) => setForm({ ...form, unit_id: e.target.value })} className="input-field min-w-0">
                <option value="">{lang === 'ar' ? 'بدون' : 'None'}</option>
                {units.map((u) => <option key={u.id} value={u.id}>{lang === 'ar' ? u.name_ar ?? u.name : u.name}</option>)}
              </select>
              <button type="button" onClick={() => { setShowUnitCreate((value) => !value); setError(''); }} className="btn-secondary shrink-0" aria-expanded={showUnitCreate}>
                {lang === 'ar' ? 'إضافة وحدة' : 'Add unit'}
              </button>
            </div>
            {showUnitCreate && (
              <div className="mt-3 rounded-lg border border-[var(--color-border)] p-3 space-y-2">
                <input type="text" value={newUnitName} onChange={(e) => setNewUnitName(e.target.value)} placeholder={lang === 'ar' ? 'اسم الوحدة *' : 'Unit name *'} className="input-field" />
                <input type="text" value={newUnitNameAr} onChange={(e) => setNewUnitNameAr(e.target.value)} placeholder={lang === 'ar' ? 'الاسم بالعربية (اختياري)' : 'Arabic name (optional)'} className="input-field" dir="rtl" />
                <div className="flex justify-end">
                  <button type="button" onClick={() => void handleAddUnit()} disabled={savingUnit} className="btn-primary">
                    {savingUnit ? (lang === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (lang === 'ar' ? 'حفظ الوحدة' : 'Save unit')}
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-3">
            <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{lang === 'ar' ? 'وحدات وعبوات الصنف' : 'Item units and packages'}</h3><button type="button" onClick={() => setProductUnits((rows) => [...rows, { name: '', name_ar: '', factor: '1', barcode: '', is_base: false, is_purchase_unit: true, is_sale_unit: true, allow_fraction: false }])} className="btn-secondary">{lang === 'ar' ? 'إضافة عبوة/وحدة' : 'Add unit/package'}</button></div>
            {productUnits.map((unit, index) => <div key={unit.id ?? `new-${index}`} className="rounded border border-[var(--color-border)] p-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><input value={unit.name} onChange={(e) => setProductUnits((rows) => rows.map((r, i) => i === index ? { ...r, name: e.target.value } : r))} placeholder={lang === 'ar' ? 'اسم الوحدة (مثل حبة/كرتون)' : 'Unit name (piece/carton)'} className="input-field" /><input value={unit.name_ar} onChange={(e) => setProductUnits((rows) => rows.map((r, i) => i === index ? { ...r, name_ar: e.target.value } : r))} placeholder={lang === 'ar' ? 'الاسم العربي (اختياري)' : 'Arabic name (optional)'} className="input-field" dir="rtl" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><input type="number" min="0.000001" step="any" value={unit.factor} onChange={(e) => setProductUnits((rows) => rows.map((r, i) => i === index ? { ...r, factor: e.target.value } : r))} placeholder={lang === 'ar' ? 'معامل التحويل' : 'Conversion factor'} className="input-field" /><div className="flex gap-2"><input value={unit.barcode} onChange={(e) => setProductUnits((rows) => rows.map((r, i) => i === index ? { ...r, barcode: e.target.value } : r))} placeholder={lang === 'ar' ? 'باركود العبوة' : 'Package barcode'} className="input-field min-w-0" /><button type="button" onClick={() => { setScannerUnitIndex(index); setScannerOpen(true); }} aria-label={lang === 'ar' ? 'مسح باركود العبوة' : 'Scan package barcode'} className="btn-secondary shrink-0">▦</button></div></div>
              <div className="flex flex-wrap gap-3 text-sm">{([['is_base', lang === 'ar' ? 'وحدة أساسية' : 'Base unit'], ['is_purchase_unit', lang === 'ar' ? 'تستخدم في الشراء' : 'Purchase unit'], ['is_sale_unit', lang === 'ar' ? 'تستخدم في البيع' : 'Sale unit'], ['allow_fraction', lang === 'ar' ? 'السماح بالكسور' : 'Allow fractions']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-1"><input type="checkbox" checked={unit[key]} onChange={(e) => setProductUnits((rows) => rows.map((r, i) => i === index ? { ...r, [key]: e.target.checked } : r))} />{label}</label>)}<button type="button" onClick={() => setProductUnits((rows) => rows.filter((_, i) => i !== index))} className="text-error-500">{lang === 'ar' ? 'إزالة' : 'Remove'}</button></div>
            </div>)}
            <p className="text-xs text-[var(--color-text-muted)]">{lang === 'ar' ? 'اترك الأسعار فارغة إذا لم تكن محددة. معاملات التحويل موجبة، والباركود يمكن أن يختلف لكل عبوة.' : 'Leave prices blank when unknown. Conversion factors must be positive; each package may have its own barcode.'}</p>
          </div>
          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--color-border)]"><button onClick={() => setModalOpen(false)} className="btn-secondary">{t('common.cancel')}</button><button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}</button></div>
        </div>
      </Modal>
    </div>
  );
}
