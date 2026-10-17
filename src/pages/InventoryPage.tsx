import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Product, Warehouse, UnitOfMeasure, ProductUnit } from '@/types/database';
import { exportToCSV, parseCSV, type CSVRow } from '@/lib/csv';
import Modal from '@/components/Modal';
import {
  Package, Plus, Search, Loader2, AlertCircle, Pencil, Trash2, Download, Upload, Camera,
} from 'lucide-react';

function generateInternalBarcode(usedBarcodes: Set<string>): string {
  // Prefix 20 is reserved for in-store/internal EAN-13 numbering in many retail systems.
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const body = '20' + Math.floor(Math.random() * 10_000_000_000).toString().padStart(10, '0');
    const sum = body.split('').reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    const barcode = body + String((10 - (sum % 10)) % 10);
    if (!usedBarcodes.has(barcode.toLowerCase())) {
      usedBarcodes.add(barcode.toLowerCase());
      return barcode;
    }
  }
  throw new Error('Could not generate a unique internal barcode. Please try again.');
}

export default function InventoryPage() {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [units, setUnits] = useState<UnitOfMeasure[]>([]);
  const [productUnits, setProductUnits] = useState<ProductUnit[]>([]);
  const [formUnits, setFormUnits] = useState<Array<{ id?: string; name: string; name_ar: string; factor: number; barcode: string; cost_price: number; sale_price: number; is_purchase_unit: boolean; is_sale_unit: boolean; allow_fraction: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<CSVRow[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [scannerStarting, setScannerStarting] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [form, setForm] = useState({
    code: '', name: '', name_ar: '', type: 'product' as 'product' | 'service',
    barcode: '', cost_price: 0, sale_price: 0, min_stock: 0, unit_id: '', category: '',
  });

  useEffect(() => { loadData(); }, [profile?.tenant_id]);

  useEffect(() => {
    if (!scannerOpen) return;
    let active = true;
    let stream: MediaStream | null = null;
    let frameId = 0;
    setScannerError('');
    setScannerStarting(true);

    type DetectedBarcode = { rawValue: string };
    type Detector = { detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]> };
    type DetectorConstructor = new (options?: { formats: string[] }) => Detector;

    async function startScanner() {
      try {
        const DetectorClass = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
        if (!DetectorClass) {
          throw new Error(lang === 'ar'
            ? 'المتصفح لا يدعم قراءة الباركود بالكاميرا. حدّث Chrome أو استخدم إدخال الباركود يدويًا.'
            : 'This browser does not support camera barcode scanning. Update Chrome or enter the barcode manually.');
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(lang === 'ar'
            ? 'الكاميرا تتطلب اتصال HTTPS وصلاحية الوصول إليها.'
            : 'Camera access requires HTTPS and permission to use the camera.');
        }

        const detector = new DetectorClass({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) throw new Error(lang === 'ar' ? 'تعذر تشغيل معاينة الكاميرا.' : 'Could not initialize camera preview.');
        video.srcObject = stream;
        await video.play();
        setScannerStarting(false);

        const scanFrame = async () => {
          if (!active || !videoRef.current) return;
          try {
            if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
              const codes = await detector.detect(video);
              if (codes.length && codes[0].rawValue.trim()) {
                const value = codes[0].rawValue.trim();
                setForm((current) => ({ ...current, barcode: value }));
                setScannerOpen(false);
                return;
              }
            }
          } catch {
            // Continue scanning; transient frame errors should not stop the camera.
          }
          if (active) frameId = window.requestAnimationFrame(scanFrame);
        };
        frameId = window.requestAnimationFrame(scanFrame);
      } catch (err) {
        setScannerStarting(false);
        setScannerError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر تشغيل ماسح الباركود.' : 'Could not start barcode scanner.'));
      }
    }

    void startScanner();
    return () => {
      active = false;
      window.cancelAnimationFrame(frameId);
      if (stream) stream.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [scannerOpen, lang]);


  async function loadData() {
    setLoading(true);
    const tid = profile?.tenant_id;
    if (!tid) { setLoading(false); return; }
    const [{ data: p }, { data: w }, { data: u }, { data: pu, error: puError }] = await Promise.all([
      supabase.from('products').select('*').eq('tenant_id', tid).order('created_at', { ascending: false }),
      supabase.from('warehouses').select('*').eq('tenant_id', tid),
      supabase.from('units_of_measure').select('*').eq('tenant_id', tid),
      supabase.from('product_units').select('*').eq('tenant_id', tid),
    ]);
    setProducts((p as Product[]) ?? []);
    setWarehouses((w as Warehouse[]) ?? []);
    setUnits((u as UnitOfMeasure[]) ?? []);
    if (puError) console.error('[InventoryPage] Could not load product units:', puError);
    setProductUnits((pu as ProductUnit[]) ?? []);
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setFormUnits([]);
    setForm({ code: '', name: '', name_ar: '', type: 'product', barcode: '', cost_price: 0, sale_price: 0, min_stock: 0, unit_id: '', category: '' });
    setError('');
    setModalOpen(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setFormUnits(productUnits.filter((unit) => unit.product_id === p.id).map((unit) => ({ id: unit.id, name: unit.name, name_ar: unit.name_ar ?? '', factor: Number(unit.factor), barcode: unit.barcode ?? '', cost_price: Number(unit.cost_price ?? 0), sale_price: Number(unit.sale_price ?? 0), is_purchase_unit: unit.is_purchase_unit, is_sale_unit: unit.is_sale_unit, allow_fraction: unit.allow_fraction })));
    setForm({ code: p.code ?? '', name: p.name, name_ar: p.name_ar ?? '', type: p.type, barcode: p.barcode ?? '', cost_price: p.cost_price, sale_price: p.sale_price, min_stock: p.min_stock, unit_id: p.unit_id ?? '', category: p.category ?? '' });
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError(lang === 'ar' ? 'الاسم مطلوب' : 'Name is required'); return; }
    if (Number(form.cost_price) < 0 || Number(form.sale_price) < 0 || Number(form.min_stock) < 0) { setError(lang === 'ar' ? 'التكلفة والسعر والحد الأدنى يجب ألا تكون سالبة.' : 'Cost, sale price, and minimum stock cannot be negative.'); return; }
    if (form.type === 'product') {
      for (const [index, unit] of formUnits.entries()) {
        if (!unit.name.trim()) { setError((lang === 'ar' ? 'اسم الوحدة مطلوب في السطر ' : 'Unit name is required on row ') + (index + 1)); return; }
        if (!Number.isFinite(Number(unit.factor)) || Number(unit.factor) <= 1) { setError((lang === 'ar' ? 'معامل تحويل الوحدة الكبرى يجب أن يكون أكبر من 1 في السطر ' : 'Packaging conversion factor must be greater than 1 on row ') + (index + 1)); return; }
        if (!Number.isFinite(Number(unit.cost_price)) || Number(unit.cost_price) < 0 || !Number.isFinite(Number(unit.sale_price)) || Number(unit.sale_price) < 0) { setError((lang === 'ar' ? 'أسعار العبوة يجب ألا تكون سالبة.' : 'Packaging prices cannot be negative.')); return; }
      }
      const enteredBarcodes = formUnits.map((unit) => unit.barcode.trim().toLowerCase()).filter(Boolean);
      if (new Set(enteredBarcodes).size !== enteredBarcodes.length) { setError(lang === 'ar' ? 'يوجد باركود مكرر بين العبوات.' : 'Duplicate barcode among packaging units.'); return; }
      const existingBaseBarcodes = products.filter((item) => item.id !== editing?.id).map((item) => (item.barcode ?? '').trim().toLowerCase()).filter(Boolean);
      const existingUnitBarcodes = productUnits.filter((unit) => unit.product_id !== editing?.id).map((unit) => (unit.barcode ?? '').trim().toLowerCase()).filter(Boolean);
      const allExisting = new Set([...existingBaseBarcodes, ...existingUnitBarcodes]);
      if (enteredBarcodes.some((barcode) => allExisting.has(barcode) || barcode === form.barcode.trim().toLowerCase())) { setError(lang === 'ar' ? 'باركود العبوة مكرر مع صنف أو وحدة أخرى.' : 'Packaging barcode duplicates another product or unit.'); return; }
    }
    if (!profile?.tenant_id) return;
    setSaving(true); setError('');
    try {
      const payload = {
        tenant_id: profile.tenant_id,
        code: form.code.trim() || null,
        name: form.name.trim(),
        name_ar: form.name_ar.trim() || null,
        type: form.type,
        barcode: form.barcode.trim() || (form.type === 'product' ? generateInternalBarcode(new Set(products.map((p) => (p.barcode ?? '').trim().toLowerCase()).filter(Boolean))) : null),
        cost_price: Number(form.cost_price) || 0,
        sale_price: Number(form.sale_price) || 0,
        min_stock: Number(form.min_stock) || 0,
        unit_id: form.unit_id || null,
        category: form.category.trim() || null,
        is_active: true,
      };
      let productId = editing?.id;
      if (editing) {
        const { data, error: e } = await supabase.from('products').update(payload).eq('id', editing.id).select('id').maybeSingle();
        if (e) throw e;
        if (!data?.id) throw new Error(lang === 'ar' ? 'لم يتم تحديث الصنف؛ تحقق من الصلاحيات.' : 'Product was not updated; check permissions.');
        productId = data.id;
      } else {
        const { data, error: e } = await supabase.from('products').insert({ ...payload, created_by: profile.id }).select('id').single();
        if (e) throw e;
        productId = data.id;
      }
      if (!productId) throw new Error(lang === 'ar' ? 'تعذر تحديد الصنف المحفوظ.' : 'Could not identify the saved product.');
      if (form.type === 'product') {
        const existingUnits = productUnits.filter((unit) => unit.product_id === productId);
        const retainedIds = new Set(formUnits.map((unit) => unit.id).filter((id): id is string => Boolean(id)));
        const removedIds = existingUnits.filter((unit) => !retainedIds.has(unit.id)).map((unit) => unit.id);
        if (removedIds.length) {
          const { error: deleteError } = await supabase.from('product_units').delete().eq('product_id', productId).in('id', removedIds);
          if (deleteError) throw deleteError;
        }
        const unitPayloads = formUnits.map((unit) => ({
          ...(unit.id ? { id: unit.id } : {}), tenant_id: profile.tenant_id!, product_id: productId!,
          name: unit.name.trim(), name_ar: unit.name_ar.trim() || null, factor: Number(unit.factor),
          barcode: unit.barcode.trim() || null, cost_price: Number(unit.cost_price), sale_price: Number(unit.sale_price),
          is_base: false, is_purchase_unit: unit.is_purchase_unit, is_sale_unit: unit.is_sale_unit, allow_fraction: unit.allow_fraction,
        }));
        if (unitPayloads.length) {
          const { error: unitsError } = await supabase.from('product_units').upsert(unitPayloads);
          if (unitsError) throw unitsError;
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


  const csvHeaders = ['code', 'name', 'name_ar', 'type', 'barcode', 'cost_price', 'sale_price', 'min_stock', 'category'];

  function handleExport() {
    exportToCSV(
      'arab-spring-products',
      csvHeaders,
      filtered.map((p) => [p.code, p.name, p.name_ar, p.type, p.barcode, p.cost_price, p.sale_price, p.min_stock, p.category])
    );
  }

  function downloadImportTemplate() {
    exportToCSV('products-import-template', csvHeaders, []);
  }

  async function handleImportFile(event: { target: { files: FileList | null; value: string } }) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    setImportRows([]);
    setImportErrors([]);
    try {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        setImportErrors([lang === 'ar' ? 'يرجى اختيار ملف CSV فقط. ملفات Excel غير مدعومة في هذه النسخة.' : 'Please choose a CSV file. Excel files are not supported in this version.']);
        return;
      }
      const parsed = parseCSV(await file.text(), csvHeaders);
      if (!parsed.length) {
        setImportErrors([lang === 'ar' ? 'الملف فارغ أو لا يحتوي على صفوف بيانات صالحة.' : 'The file is empty or contains no valid data rows.']);
        return;
      }

      const errors: string[] = [];
      const missing = csvHeaders.filter((header) => !(header in parsed[0]));
      if (missing.length) errors.push((lang === 'ar' ? 'أعمدة ناقصة: ' : 'Missing columns: ') + missing.join(', '));

      const seenCodes = new Set<string>();
      const seenBarcodes = new Set<string>();
      const existingCodes = new Set(products.map((p) => (p.code ?? '').trim().toLowerCase()).filter(Boolean));
      const existingBarcodes = new Set(products.map((p) => (p.barcode ?? '').trim().toLowerCase()).filter(Boolean));

      parsed.forEach((row, index) => {
        const line = index + 2;
        const name = (row.name ?? '').trim();
        const code = (row.code ?? '').trim().toLowerCase();
        const barcode = (row.barcode ?? '').trim().toLowerCase();
        const type = (row.type ?? '').trim().toLowerCase();
        if (!name) errors.push((lang === 'ar' ? 'السطر ' : 'Row ') + line + (lang === 'ar' ? ': الاسم مطلوب.' : ': name is required.'));
        if (type !== 'product' && type !== 'service') errors.push((lang === 'ar' ? 'السطر ' : 'Row ') + line + (lang === 'ar' ? ': النوع يجب أن يكون product أو service.' : ': type must be product or service.'));
        for (const field of ['cost_price', 'sale_price', 'min_stock']) {
          const raw = (row[field] ?? '').trim();
          const value = raw === '' ? 0 : Number(raw);
          if (!Number.isFinite(value) || value < 0) errors.push((lang === 'ar' ? 'السطر ' : 'Row ') + line + ': ' + field + (lang === 'ar' ? ' يجب أن يكون رقمًا غير سالب.' : ' must be a non-negative number.'));
        }
        if (code && (existingCodes.has(code) || seenCodes.has(code))) errors.push((lang === 'ar' ? 'السطر ' : 'Row ') + line + (lang === 'ar' ? ': الكود مكرر.' : ': duplicate code.'));
        if (barcode && (existingBarcodes.has(barcode) || seenBarcodes.has(barcode))) errors.push((lang === 'ar' ? 'السطر ' : 'Row ') + line + (lang === 'ar' ? ': الباركود مكرر.' : ': duplicate barcode.'));
        if (code) seenCodes.add(code);
        if (barcode) seenBarcodes.add(barcode);
      });

      if (errors.length === 0) {
        const usedBarcodes = new Set([
          ...existingBarcodes,
          ...parsed.map((row) => (row.barcode ?? '').trim().toLowerCase()).filter(Boolean),
        ]);
        const rowsWithBarcodes = parsed.map((row) => ({
          ...row,
          barcode: (row.barcode ?? '').trim() || ((row.type ?? '').trim().toLowerCase() === 'product'
            ? generateInternalBarcode(usedBarcodes)
            : ''),
        }));
        setImportRows(rowsWithBarcodes);
      } else {
        setImportRows(parsed);
      }
      setImportErrors(errors);
    } catch (err) {
      setImportErrors([err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر قراءة الملف.' : 'Could not read the file.')]);
    }
  }

  async function confirmImport() {
    if (!profile?.tenant_id || !profile.id || !importRows.length || importErrors.length) return;
    setImportBusy(true);
    setImportErrors([]);
    try {
      const payload = importRows.map((row) => ({
        tenant_id: profile.tenant_id,
        created_by: profile.id,
        code: row.code?.trim() || null,
        name: row.name.trim(),
        name_ar: row.name_ar?.trim() || null,
        type: row.type.trim().toLowerCase() as 'product' | 'service',
        barcode: row.barcode?.trim() || null,
        cost_price: row.cost_price?.trim() ? Number(row.cost_price) : 0,
        sale_price: row.sale_price?.trim() ? Number(row.sale_price) : 0,
        min_stock: row.min_stock?.trim() ? Number(row.min_stock) : 0,
        category: row.category?.trim() || null,
        is_active: true,
      }));
      const { error: insertError } = await supabase.from('products').insert(payload);
      if (insertError) throw insertError;
      await loadData();
      setImportOpen(false);
      setImportRows([]);
      setImportFileName('');
    } catch (err) {
      setImportErrors([err instanceof Error ? err.message : (lang === 'ar' ? 'فشل استيراد المنتجات.' : 'Product import failed.')]);
    } finally {
      setImportBusy(false);
    }
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
        <button onClick={() => { setImportRows([]); setImportErrors([]); setImportFileName(''); setImportOpen(true); }} className="btn-secondary flex items-center gap-2"><Upload className="w-4 h-4" />{lang === 'ar' ? 'استيراد CSV' : 'Import CSV'}</button>
        <button onClick={handleExport} className="btn-secondary flex items-center gap-2"><Download className="w-4 h-4" />{lang === 'ar' ? 'تصدير CSV' : 'Export CSV'}</button>
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
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الباركود' : 'Barcode'}</label><div className="flex gap-2"><input type="text" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="input-field min-w-0 flex-1" /><button type="button" onClick={() => { setScannerError(''); setScannerOpen(true); }} className="btn-secondary shrink-0 flex items-center gap-1.5" title={lang === 'ar' ? 'مسح الباركود بالكاميرا' : 'Scan barcode with camera'} aria-label={lang === 'ar' ? 'مسح الباركود بالكاميرا' : 'Scan barcode with camera'}><Camera className="w-4 h-4" /><span className="hidden sm:inline">{lang === 'ar' ? 'مسح بالكاميرا' : 'Scan'}</span></button></div></div>
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
          <div className="space-y-3 rounded-xl border border-[var(--color-border)] p-3">
            <div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-[var(--color-text)]">{lang === 'ar' ? 'وحدات القياس والعبوات' : 'Units & Packaging'}</h3><button type="button" onClick={() => setFormUnits((current) => [...current, { name: '', name_ar: '', factor: 1, barcode: '', cost_price: 0, sale_price: 0, is_purchase_unit: true, is_sale_unit: true, allow_fraction: false }])} className="btn-secondary text-sm">{lang === 'ar' ? '+ إضافة وحدة' : '+ Add unit'}</button></div>
            <div><label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الوحدة الأساسية' : 'Base unit'}</label><select value={form.unit_id} onChange={(e) => setForm({ ...form, unit_id: e.target.value })} className="input-field"><option value="">{lang === 'ar' ? 'بدون' : 'None'}</option>{units.map((u) => <option key={u.id} value={u.id}>{lang === 'ar' ? u.name_ar ?? u.name : u.name}</option>)}</select><p className="mt-1 text-xs text-[var(--color-text-muted)]">{lang === 'ar' ? 'التكلفة والسعر أعلاه هما تكلفة وسعر الوحدة الأساسية.' : 'The cost and price above apply to the base unit.'}</p></div>
            {formUnits.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'لم تُضف عبوات أكبر بعد.' : 'No larger packaging units added yet.'}</p>}
            {formUnits.map((unit, index) => <div key={unit.id ?? `new-${index}`} className="grid grid-cols-2 md:grid-cols-6 gap-2 rounded-lg bg-[var(--color-bg)] p-2">
              <input aria-label={lang === 'ar' ? 'اسم الوحدة' : 'Unit name'} placeholder={lang === 'ar' ? 'اسم الوحدة (كرتون)' : 'Unit name (carton)'} value={unit.name} onChange={(e) => setFormUnits((current) => current.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} className="input-field" />
              <input aria-label={lang === 'ar' ? 'الاسم بالعربية' : 'Arabic unit name'} placeholder={lang === 'ar' ? 'الاسم بالعربية' : 'Arabic name'} value={unit.name_ar} onChange={(e) => setFormUnits((current) => current.map((item, i) => i === index ? { ...item, name_ar: e.target.value } : item))} className="input-field" dir="auto" />
              <input aria-label={lang === 'ar' ? 'معامل التحويل' : 'Conversion factor'} type="number" min="1" step="0.000001" placeholder={lang === 'ar' ? 'كم حبة؟' : 'Base units'} value={unit.factor} onChange={(e) => setFormUnits((current) => current.map((item, i) => i === index ? { ...item, factor: Number(e.target.value) } : item))} className="input-field" />
              <input aria-label={lang === 'ar' ? 'باركود الوحدة' : 'Unit barcode'} placeholder={lang === 'ar' ? 'باركود العبوة' : 'Unit barcode'} value={unit.barcode} onChange={(e) => setFormUnits((current) => current.map((item, i) => i === index ? { ...item, barcode: e.target.value } : item))} className="input-field" />
              <input aria-label={lang === 'ar' ? 'تكلفة الوحدة' : 'Unit cost'} type="number" min="0" step="0.0001" placeholder={lang === 'ar' ? 'تكلفة العبوة' : 'Unit cost'} value={unit.cost_price} onChange={(e) => setFormUnits((current) => current.map((item, i) => i === index ? { ...item, cost_price: Number(e.target.value) } : item))} className="input-field" />
              <input aria-label={lang === 'ar' ? 'سعر الوحدة' : 'Unit sale price'} type="number" min="0" step="0.0001" placeholder={lang === 'ar' ? 'سعر العبوة' : 'Unit price'} value={unit.sale_price} onChange={(e) => setFormUnits((current) => current.map((item, i) => i === index ? { ...item, sale_price: Number(e.target.value) } : item))} className="input-field" />
              <div className="col-span-2 md:col-span-6 flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={unit.is_purchase_unit} onChange={(e) => setFormUnits((current) => current.map((item, i) => i === index ? { ...item, is_purchase_unit: e.target.checked } : item))} />{lang === 'ar' ? 'تُستخدم للشراء' : 'Purchase unit'}</label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={unit.is_sale_unit} onChange={(e) => setFormUnits((current) => current.map((item, i) => i === index ? { ...item, is_sale_unit: e.target.checked } : item))} />{lang === 'ar' ? 'تُستخدم للبيع' : 'Sales unit'}</label><button type="button" onClick={() => setFormUnits((current) => current.filter((_, i) => i !== index))} className="text-error-500 text-sm">{lang === 'ar' ? 'حذف الوحدة' : 'Remove unit'}</button></div>
            </div>)}
          </div>
          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--color-border)]"><button onClick={() => setModalOpen(false)} className="btn-secondary">{t('common.cancel')}</button><button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}</button></div>
        </div>

      </Modal>

      <Modal open={scannerOpen} onClose={() => setScannerOpen(false)} title={lang === 'ar' ? 'مسح الباركود بالكاميرا' : 'Scan barcode with camera'}>
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'وجّه الكاميرا الخلفية نحو الباركود وثبّت الصنف داخل الإطار حتى تتم قراءته.' : 'Point the rear camera at the barcode and hold the item steady in view.'}</p>
          <div className="overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} autoPlay muted playsInline className="w-full max-h-80 object-contain" />
          </div>
          {scannerStarting && <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]"><Loader2 className="w-4 h-4 animate-spin" />{lang === 'ar' ? 'جارٍ تشغيل الكاميرا…' : 'Starting camera…'}</div>}
          {scannerError && <div className="flex items-start gap-2 rounded-lg bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 p-3 text-sm"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{scannerError}</span></div>}
          <div className="flex justify-end"><button type="button" onClick={() => setScannerOpen(false)} className="btn-secondary">{t('common.cancel')}</button></div>
        </div>
      </Modal>

      <Modal open={importOpen} onClose={() => !importBusy && setImportOpen(false)} title={lang === 'ar' ? 'استيراد المنتجات من CSV' : 'Import products from CSV'}>
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'نزّل القالب واملأ صفوف المنتجات ثم اختر ملف CSV. اترك الباركود فارغًا إذا لم يكن للصنف باركود؛ سيُنشئ النظام باركودًا داخليًا تلقائيًا للمنتجات فقط. لن تُحفظ البيانات قبل تأكيد الاستيراد.' : 'Download the template, fill in product rows, then choose a CSV file. Leave barcode blank when a product has no barcode; an internal barcode will be generated automatically for products only. Nothing is saved until you confirm the import.'}</p>
          <button type="button" onClick={downloadImportTemplate} className="btn-secondary flex items-center gap-2"><Download className="w-4 h-4" />{lang === 'ar' ? 'تنزيل القالب' : 'Download template'}</button>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'ملف CSV' : 'CSV file'}</label>
            <input type="file" accept=".csv,text/csv" onChange={handleImportFile} disabled={importBusy} className="input-field" />
            {importFileName && <p className="text-xs mt-1 text-[var(--color-text-muted)]">{importFileName}</p>}
          </div>
          {importErrors.length > 0 && <div className="rounded-lg border border-error-300 bg-error-50 dark:bg-error-900/20 p-3 text-sm text-error-600 dark:text-error-400 max-h-40 overflow-auto"><p className="font-semibold mb-1">{lang === 'ar' ? 'يجب تصحيح التالي قبل الحفظ:' : 'Fix the following before saving:'}</p><ul className="list-disc ps-5 space-y-1">{importErrors.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}
          {importRows.length > 0 && <div className="rounded-lg border border-[var(--color-border)] overflow-auto max-h-52"><p className="text-sm font-medium p-2">{lang === 'ar' ? 'معاينة ' + importRows.length + ' صف' : 'Preview: ' + importRows.length + ' rows'}</p><table className="w-full text-xs"><thead><tr>{['code', 'name', 'type', 'cost_price', 'sale_price'].map((header) => <th key={header} className="text-start p-2 border-b border-[var(--color-border)]">{header}</th>)}</tr></thead><tbody>{importRows.slice(0, 20).map((row, i) => <tr key={i}>{['code', 'name', 'type', 'cost_price', 'sale_price'].map((key) => <td key={key} className="p-2 border-b border-[var(--color-border)]">{row[key] || '—'}</td>)}</tr>)}</tbody></table>{importRows.length > 20 && <p className="text-xs p-2 text-[var(--color-text-muted)]">{lang === 'ar' ? 'تظهر أول 20 صفًا فقط في المعاينة.' : 'Only the first 20 rows are shown in preview.'}</p>}</div>}
          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--color-border)]"><button type="button" onClick={() => setImportOpen(false)} disabled={importBusy} className="btn-secondary">{t('common.cancel')}</button><button type="button" onClick={confirmImport} disabled={importBusy || !importRows.length || importErrors.length > 0} className="btn-primary flex items-center gap-2">{importBusy && <Loader2 className="w-4 h-4 animate-spin" />}{lang === 'ar' ? 'تأكيد الاستيراد' : 'Confirm import'}</button></div>
        </div>
      </Modal>
    </div>
  );
}
