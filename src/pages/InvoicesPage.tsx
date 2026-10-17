import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Invoice, Party, InvoiceLine, InvoiceType, InvoiceStatus, Product, ProductUnit, UnitOfMeasure, Warehouse, Shift } from '@/types/database';
import { exportToCSV } from '@/lib/csv';
import { formatDualDate } from '@/lib/hijri';
import Modal from '@/components/Modal';
import {
  FileText, Plus, Search, Pencil, Trash2, Loader2, AlertCircle,
  CheckCircle2, XCircle, Eye, Download, Camera,
} from 'lucide-react';

interface FormLine {
  product_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  unit_id: string;
  unit_name_snapshot: string;
  conversion_factor: number;
}

export default function InvoicesPage() {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productUnits, setProductUnits] = useState<ProductUnit[]>([]);
  const [baseUnits, setBaseUnits] = useState<UnitOfMeasure[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<InvoiceType | 'all'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [viewModal, setViewModal] = useState<Invoice | null>(null);
  const [viewLines, setViewLines] = useState<InvoiceLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [scannerStarting, setScannerStarting] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [form, setForm] = useState({
    type: 'sale' as InvoiceType,
    party_id: '',
    date: new Date().toISOString().slice(0, 10),
    due_date: '',
    currency: 'SAR',
    notes: '',
    warehouse_id: '',
    shift_id: '',
    discount_amount: 0,
    lines: [{ product_id: '', description: '', quantity: 1, unit_price: 0, discount_amount: 0, unit_id: '', unit_name_snapshot: '', conversion_factor: 1 }] as FormLine[],
  });

  useEffect(() => { void loadData(); }, [profile?.tenant_id]);

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
        if (!DetectorClass) throw new Error(lang === 'ar' ? 'المتصفح لا يدعم قراءة الباركود بالكاميرا. يمكنك إدخال الباركود يدويًا.' : 'This browser does not support camera barcode scanning. You can enter the barcode manually.');
        if (!navigator.mediaDevices?.getUserMedia) throw new Error(lang === 'ar' ? 'الكاميرا تتطلب اتصال HTTPS وصلاحية الوصول إليها.' : 'Camera access requires HTTPS and camera permission.');
        const detector = new DetectorClass({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (!active) { stream.getTracks().forEach((track) => track.stop()); return; }
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
              const code = codes.find((item) => item.rawValue.trim())?.rawValue.trim();
              if (code) {
                const matchedUnit = productUnits.find((unit) => (unit.barcode ?? '').trim() === code);
                const product = matchedUnit ? products.find((item) => item.id === matchedUnit.product_id) : products.find((item) => (item.barcode ?? '').trim() === code);
                if (!product) setError((lang === 'ar' ? 'لم يتم العثور على صنف يحمل الباركود: ' : 'No product found for barcode: ') + code);
                else setForm((current) => {
                  const selectedUnitId = matchedUnit?.id ?? '';
                  const existing = current.lines.findIndex((line) => line.product_id === product.id && line.unit_id === selectedUnitId);
                  if (existing >= 0) {
                    const lines = [...current.lines];
                    lines[existing] = { ...lines[existing], quantity: (Number(lines[existing].quantity) || 0) + 1 };
                    return { ...current, lines };
                  }
                  const blankIndex = current.lines.findIndex((line) => !line.product_id && !line.description.trim());
                  const newLine: FormLine = {
                    product_id: product.id,
                    description: lang === 'ar' ? product.name_ar ?? product.name : product.name,
                    quantity: 1,
                    unit_price: matchedUnit ? ((current.type === 'sale' || current.type === 'return_sale') ? Number(matchedUnit.sale_price) : Number(matchedUnit.cost_price)) : (current.type === 'sale' || current.type === 'return_sale' ? product.sale_price : product.cost_price),
                    discount_amount: 0,
                    unit_id: matchedUnit?.id ?? '',
                    unit_name_snapshot: matchedUnit ? (lang === 'ar' ? matchedUnit.name_ar ?? matchedUnit.name : matchedUnit.name) : (() => { const baseUnit = baseUnits.find((unit) => unit.id === product.unit_id); return baseUnit ? (lang === 'ar' ? baseUnit.name_ar ?? baseUnit.name : baseUnit.name) : (lang === 'ar' ? 'وحدة أساسية' : 'Base unit'); })(),
                    conversion_factor: Number(matchedUnit?.factor ?? 1),
                  };
                  if (blankIndex >= 0) { const lines = [...current.lines]; lines[blankIndex] = newLine; return { ...current, lines }; }
                  return { ...current, lines: [...current.lines, newLine] };
                });
                setScannerOpen(false);
                return;
              }
            }
          } catch { /* Continue scanning after transient frame errors. */ }
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
  }, [scannerOpen, lang, products, productUnits, baseUnits]);


  async function loadData() {
    setLoading(true);
    setLoadError('');
    const tenantId = profile?.tenant_id;
    if (!tenantId) {
      setInvoices([]);
      setParties([]);
      setProducts([]);
      setProductUnits([]);
      setBaseUnits([]);
      setWarehouses([]);
      setShifts([]);
      setLoading(false);
      if (profile) setLoadError(lang === 'ar' ? 'حسابك غير مرتبط بمؤسسة؛ تعذر تحميل الفواتير.' : 'Your account is not linked to a tenant; invoices cannot be loaded.');
      return;
    }

    try {
      const results = await Promise.all([
        supabase.from('invoices').select('*').eq('tenant_id', tenantId).order('date', { ascending: false }),
        supabase.from('parties').select('*').eq('tenant_id', tenantId),
        supabase.from('products').select('*').eq('tenant_id', tenantId).eq('is_active', true),
        supabase.from('product_units').select('*').eq('tenant_id', tenantId),
        supabase.from('units_of_measure').select('*').eq('tenant_id', tenantId),
        supabase.from('warehouses').select('*').eq('tenant_id', tenantId).eq('is_active', true),
        supabase.from('shifts').select('*').eq('tenant_id', tenantId).eq('status', 'open').order('start_time', { ascending: false }),
      ]);
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
      const [invResult, partyResult, prodResult, unitsResult, baseUnitsResult, whResult, shiftResult] = results;
      setInvoices((invResult.data as Invoice[]) ?? []);
      setParties((partyResult.data as Party[]) ?? []);
      setProducts((prodResult.data as Product[]) ?? []);
      setProductUnits((unitsResult.data as ProductUnit[]) ?? []);
      setBaseUnits((baseUnitsResult.data as UnitOfMeasure[]) ?? []);
      setWarehouses((whResult.data as Warehouse[]) ?? []);
      setShifts((shiftResult.data as Shift[]) ?? []);
    } catch (err) {
      console.error('[InvoicesPage] Failed to load invoice data:', err);
      setInvoices([]);
      setLoadError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر تحميل بيانات الفواتير.' : 'Could not load invoice data.'));
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setForm({
      type: 'sale',
      party_id: '',
      date: new Date().toISOString().slice(0, 10),
      due_date: '',
      currency: 'SAR',
      notes: '',
      warehouse_id: '',
      shift_id: '',
      discount_amount: 0,
      lines: [{ product_id: '', description: '', quantity: 1, unit_price: 0, discount_amount: 0, unit_id: '', unit_name_snapshot: '', conversion_factor: 1 }],
    });
    setError('');
    setModalOpen(true);
  }

  function changeInvoiceType(nextType: InvoiceType) {
    setForm((current) => ({
      ...current,
      type: nextType,
      lines: current.lines.map((line) => {
        const product = products.find((item) => item.id === line.product_id);
        const unit = productUnits.find((item) => item.id === line.unit_id);
        const isSale = nextType === 'sale' || nextType === 'return_sale';
        return { ...line, unit_price: unit ? Number(isSale ? unit.sale_price : unit.cost_price) : product ? (isSale ? product.sale_price : product.cost_price) : line.unit_price };
      }),
    }));
  }

  function addLine() {
    setForm({ ...form, lines: [...form.lines, { product_id: '', description: '', quantity: 1, unit_price: 0, discount_amount: 0, unit_id: '', unit_name_snapshot: '', conversion_factor: 1 }] });
  }

  function updateLine(idx: number, field: keyof FormLine, value: string | number) {
    const newLines = [...form.lines];
    (newLines[idx] as unknown as Record<string, string | number>)[field] = value;
    if (field === 'product_id' && typeof value === 'string' && value) {
      const prod = products.find((p) => p.id === value);
      if (prod) {
        newLines[idx].description = lang === 'ar' ? prod.name_ar ?? prod.name : prod.name;
        newLines[idx].unit_price = form.type === 'sale' || form.type === 'return_sale' ? prod.sale_price : prod.cost_price;
        newLines[idx].unit_id = '';
        newLines[idx].conversion_factor = 1;
        const baseUnit = baseUnits.find((unit) => unit.id === prod.unit_id);
        newLines[idx].unit_name_snapshot = baseUnit ? (lang === 'ar' ? baseUnit.name_ar ?? baseUnit.name : baseUnit.name) : (lang === 'ar' ? 'وحدة أساسية' : 'Base unit');
      }
    }
    setForm({ ...form, lines: newLines });
  }

  function updateLineUnit(idx: number, unitId: string) {
    const line = form.lines[idx];
    const selectedUnit = productUnits.find((unit) => unit.id === unitId);
    const product = products.find((item) => item.id === line.product_id);
    const baseUnit = product ? baseUnits.find((unit) => unit.id === product.unit_id) : undefined;
    const newLines = [...form.lines];
    newLines[idx] = {
      ...line,
      unit_id: selectedUnit?.id ?? '',
      conversion_factor: Number(selectedUnit?.factor ?? 1),
      unit_name_snapshot: selectedUnit ? (lang === 'ar' ? selectedUnit.name_ar ?? selectedUnit.name : selectedUnit.name) : baseUnit ? (lang === 'ar' ? baseUnit.name_ar ?? baseUnit.name : baseUnit.name) : (lang === 'ar' ? 'وحدة أساسية' : 'Base unit'),
      unit_price: selectedUnit ? ((form.type === 'sale' || form.type === 'return_sale') ? Number(selectedUnit.sale_price) : Number(selectedUnit.cost_price)) : product ? ((form.type === 'sale' || form.type === 'return_sale') ? product.sale_price : product.cost_price) : line.unit_price,
    };
    setForm({ ...form, lines: newLines });
  }

  function removeLine(idx: number) {
    if (form.lines.length <= 1) return;
    setForm({ ...form, lines: form.lines.filter((_, i) => i !== idx) });
  }

  const lineTotals = form.lines.map((l) => (Number(l.quantity) || 0) * (Number(l.unit_price) || 0) - (Number(l.discount_amount) || 0));
  const subtotal = lineTotals.reduce((s, v) => s + v, 0);
  const invoiceDiscount = Number(form.discount_amount) || 0;
  const afterDiscount = Math.max(0, subtotal - invoiceDiscount);
  const taxRate = 0.15;
  const taxAmount = (form.type === 'sale' || form.type === 'return_sale') ? afterDiscount * taxRate : 0;
  const total = afterDiscount + taxAmount;

  async function handleSave() {
    if (!profile?.tenant_id) return;
    if (!form.party_id) {
      setError(lang === 'ar' ? 'اختر جهة الاتصال' : 'Select a contact');
      return;
    }
    if (form.lines.length === 0 || form.lines.every((l) => !l.description && !l.product_id)) {
      setError(lang === 'ar' ? 'أضف سطرًا واحدًا على الأقل' : 'Add at least one line');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const invNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
      const { data: inv, error: invErr } = await supabase
        .from('invoices')
        .insert({
          tenant_id: profile.tenant_id,
          invoice_number: invNumber,
          type: form.type,
          party_id: form.party_id,
          date: form.date,
          due_date: form.due_date || null,
          currency: form.currency,
          subtotal,
          discount_amount: invoiceDiscount,
          tax_amount: taxAmount,
          total,
          status: 'draft',
          notes: form.notes.trim() || null,
          warehouse_id: form.warehouse_id || null,
          shift_id: form.shift_id || null,
          created_by: profile.id,
        })
        .select()
        .single();

      if (invErr) throw invErr;
      const invId = (inv as Invoice).id;

      const linePayloads = form.lines.map((l, i) => ({
        invoice_id: invId,
        tenant_id: profile.tenant_id,
        product_id: l.product_id || null,
        unit_id: l.unit_id || null,
        unit_name_snapshot: l.unit_name_snapshot || null,
        conversion_factor: Number(l.conversion_factor) > 0 ? Number(l.conversion_factor) : 1,
        base_quantity: (Number(l.quantity) || 1) * (Number(l.conversion_factor) > 0 ? Number(l.conversion_factor) : 1),
        description: l.description || null,
        quantity: Number(l.quantity) || 1,
        unit_price: Number(l.unit_price) || 0,
        discount_amount: Number(l.discount_amount) || 0,
        line_total: (Number(l.quantity) || 1) * (Number(l.unit_price) || 0) - (Number(l.discount_amount) || 0),
        line_order: i,
      }));

      const { error: linesErr } = await supabase.from('invoice_lines').insert(linePayloads);
      if (linesErr) throw linesErr;

      setModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.generic'));
    } finally {
      setSaving(false);
    }
  }

  async function postInvoice(inv: Invoice) {
    if (!profile) return;
    const { data, error } = await supabase.rpc('post_invoice', { p_invoice_id: inv.id });
    if (error) { alert((error as Error).message); return; }
    const result = data as { success: boolean; error?: string };
    if (!result.success) { alert(result.error || (lang === 'ar' ? 'فشل الترحيل' : 'Posting failed')); return; }
    loadData();
  }

  async function cancelInvoice(inv: Invoice) {
    if (!confirm(lang === 'ar' ? 'إلغاء الفاتورة؟' : 'Cancel invoice?')) return;
    const { error } = await supabase.from('invoices').update({ status: 'cancelled' }).eq('id', inv.id);
    if (!error) loadData();
  }

  async function deleteInvoice(inv: Invoice) {
    if (inv.status === 'posted') { alert(lang === 'ar' ? 'لا يمكن حذف فاتورة مرحلة' : 'Cannot delete a posted invoice'); return; }
    if (!confirm(lang === 'ar' ? 'حذف الفاتورة؟' : 'Delete invoice?')) return;
    await supabase.from('invoice_lines').delete().eq('invoice_id', inv.id);
    const { error } = await supabase.from('invoices').delete().eq('id', inv.id);
    if (!error) loadData();
  }

  async function viewInvoice(inv: Invoice) {
    setViewModal(inv);
    const { data } = await supabase.from('invoice_lines').select('*').eq('invoice_id', inv.id).order('line_order');
    setViewLines((data as InvoiceLine[]) ?? []);
  }

  const filtered = invoices.filter((inv) => {
    const matchSearch = !search || inv.invoice_number.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || inv.type === filterType;
    return matchSearch && matchType;
  });

  const typeLabels: Record<InvoiceType, { ar: string; en: string }> = {
    sale: { ar: 'مبيعات', en: 'Sale' },
    purchase: { ar: 'مشتريات', en: 'Purchase' },
    return_sale: { ar: 'مرتجع مبيعات', en: 'Return Sale' },
    return_purchase: { ar: 'مرتجع مشتريات', en: 'Return Purchase' },
  };

  const statusColors: Record<InvoiceStatus, string> = {
    draft: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400',
    posted: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400',
    cancelled: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400',
    paid: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400',
    partial: 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400',
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center"><FileText className="w-5 h-5 text-white" /></div>
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text)]">{t('nav.invoices')}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'فواتير المبيعات والمشتريات والمرتجع' : 'Sales, purchase, and return invoices'}</p>
          </div>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />{lang === 'ar' ? 'فاتورة جديدة' : 'New Invoice'}</button>
        <button onClick={() => { exportToCSV(lang === 'ar' ? 'الفواتير' : 'invoices', lang === 'ar' ? ['رقم','نوع','جهة','تاريخ','مبلغ','عملة','حالة'] : ['Number','Type','Party','Date','Amount','Currency','Status'], invoices.map((inv) => { const p = parties.find((pp) => pp.id === inv.party_id); return [inv.invoice_number, inv.type, p ? (lang === 'ar' ? p.name_ar ?? p.name : p.name) : '', inv.date, inv.total.toFixed(2), inv.currency, inv.status]; })); }} disabled={invoices.length === 0} className="btn-secondary flex items-center gap-2"><Download className="w-4 h-4" />{lang === 'ar' ? 'تصدير' : 'Export'}</button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-[var(--color-text-muted)]" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('common.search')} className="input-field ps-10" />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value as InvoiceType | 'all')} className="input-field !w-auto">
          <option value="all">{lang === 'ar' ? 'الكل' : 'All'}</option>
          <option value="sale">{lang === 'ar' ? 'مبيعات' : 'Sale'}</option>
          <option value="purchase">{lang === 'ar' ? 'مشتريات' : 'Purchase'}</option>
          <option value="return_sale">{lang === 'ar' ? 'مرتجع مبيعات' : 'Return Sale'}</option>
          <option value="return_purchase">{lang === 'ar' ? 'مرتجع مشتريات' : 'Return Purchase'}</option>
        </select>
      </div>

      {loadError && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-error-300 bg-error-50 dark:bg-error-900/20 px-4 py-3 text-sm text-error-700 dark:text-error-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div><p className="font-semibold">{lang === 'ar' ? 'تعذر تحميل الفواتير' : 'Could not load invoices'}</p><p>{loadError}</p></div>
          <button onClick={() => void loadData()} className="ms-auto underline">{lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}</button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card text-center py-12 text-[var(--color-text-muted)]">{t('common.no_data')}</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'رقم' : 'Number'}</th>
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'النوع' : 'Type'}</th>
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'الجهة' : 'Party'}</th>
                <th className="text-start py-2 px-3 font-medium">{t('common.date')}</th>
                <th className="text-end py-2 px-3 font-medium">{t('common.amount')}</th>
                <th className="text-start py-2 px-3 font-medium">{t('common.status')}</th>
                <th className="text-end py-2 px-3 font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => {
                const party = parties.find((p) => p.id === inv.party_id);
                return (
                  <tr key={inv.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                    <td className="py-2 px-3 font-mono text-[var(--color-text)]">{inv.invoice_number}</td>
                    <td className="py-2 px-3 text-[var(--color-text-muted)]">{lang === 'ar' ? typeLabels[inv.type].ar : typeLabels[inv.type].en}</td>
                    <td className="py-2 px-3 text-[var(--color-text)]">{party ? (lang === 'ar' ? party.name_ar ?? party.name : party.name) : '—'}</td>
                    <td className="py-2 px-3 text-[var(--color-text-muted)]">{inv.date}{inv.due_date ? ` → ${inv.due_date}` : ''}<div className="text-xs text-[var(--color-text-muted)]">{formatDualDate(inv.date, lang)}</div></td>
                    <td className="py-2 px-3 text-end font-medium text-[var(--color-text)]">{inv.total.toFixed(2)} {inv.currency}</td>
                    <td className="py-2 px-3"><span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[inv.status]}`}>{inv.status}</span></td>
                    <td className="py-2 px-3 text-end">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => viewInvoice(inv)} className="btn-secondary !p-1.5" title={lang === 'ar' ? 'عرض' : 'View'}><Eye className="w-3.5 h-3.5" /></button>
                        {inv.status === 'draft' && (
                          <>
                            <button onClick={() => postInvoice(inv)} className="btn-secondary !p-1.5 text-success-600" title={lang === 'ar' ? 'ترحيل' : 'Post'}><CheckCircle2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => cancelInvoice(inv)} className="btn-secondary !p-1.5 text-error-500" title={t('common.cancel')}><XCircle className="w-3.5 h-3.5" /></button>
                            <button onClick={() => deleteInvoice(inv)} className="btn-secondary !p-1.5 text-error-500" title={t('common.delete')}><Trash2 className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={lang === 'ar' ? 'فاتورة جديدة' : 'New Invoice'} size="lg">
        {error && (
          <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg px-3 py-2 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span>
          </div>
        )}
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'النوع' : 'Type'}</label>
              <select value={form.type} onChange={(e) => changeInvoiceType(e.target.value as InvoiceType)} className="input-field">
                <option value="sale">{lang === 'ar' ? 'مبيعات' : 'Sale'}</option>
                <option value="purchase">{lang === 'ar' ? 'مشتريات' : 'Purchase'}</option>
                <option value="return_sale">{lang === 'ar' ? 'مرتجع مبيعات' : 'Return Sale'}</option>
                <option value="return_purchase">{lang === 'ar' ? 'مرتجع مشتريات' : 'Return Purchase'}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الجهة' : 'Party'} *</label>
              <select value={form.party_id} onChange={(e) => setForm({ ...form, party_id: e.target.value })} className="input-field">
                <option value="">{lang === 'ar' ? 'اختر' : 'Select'}</option>
                {parties.map((p) => <option key={p.id} value={p.id}>{lang === 'ar' ? p.name_ar ?? p.name : p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{t('common.date')}</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'}</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="input-field" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'المخزن' : 'Warehouse'}</label>
              <select value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })} className="input-field">
                <option value="">{lang === 'ar' ? 'بدون' : 'None'}</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{lang === 'ar' ? w.name_ar ?? w.name : w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الوردية' : 'Shift'}</label>
              <select value={form.shift_id} onChange={(e) => setForm({ ...form, shift_id: e.target.value })} className="input-field">
                <option value="">{lang === 'ar' ? 'بدون' : 'None'}</option>
                {shifts.map((s) => <option key={s.id} value={s.id}>{s.start_time.slice(0, 16).replace('T', ' ')}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[var(--color-text-muted)]">{lang === 'ar' ? 'سطور الفاتورة' : 'Invoice Lines'}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => { setError(''); setScannerError(''); setScannerOpen(true); }} className="btn-secondary text-sm flex items-center gap-1"><Camera className="w-3.5 h-3.5" />{lang === 'ar' ? 'مسح باركود' : 'Scan barcode'}</button>
                <button onClick={addLine} className="btn-secondary text-sm flex items-center gap-1"><Plus className="w-3 h-3" />{lang === 'ar' ? 'سطر' : 'Line'}</button>
              </div>
            </div>
            {form.lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center mb-2">
                <select
                  value={line.product_id}
                  onChange={(e) => updateLine(idx, 'product_id', e.target.value)}
                  className="input-field col-span-2 !text-xs"
                >
                  <option value="">{lang === 'ar' ? 'منتج/خدمة/يدوي' : 'Product/Service/Manual'}</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{lang === 'ar' ? p.name_ar ?? p.name : p.name}{p.type === 'service' ? (lang === 'ar' ? ' (خدمة)' : ' (service)') : ''}</option>)}
                </select>
                <input type="text" placeholder={lang === 'ar' ? 'الوصف' : 'Description'} value={line.description} onChange={(e) => updateLine(idx, 'description', e.target.value)} className="input-field col-span-2" />
                <select value={line.unit_id} onChange={(e) => updateLineUnit(idx, e.target.value)} className="input-field col-span-2 !text-xs" aria-label={lang === 'ar' ? 'وحدة الفاتورة' : 'Invoice unit'}>
                  <option value="">{lang === 'ar' ? 'الوحدة الأساسية' : 'Base unit'}</option>
                  {productUnits.filter((unit) => unit.product_id === line.product_id && ((form.type === 'sale' || form.type === 'return_sale') ? unit.is_sale_unit : unit.is_purchase_unit)).map((unit) => <option key={unit.id} value={unit.id}>{lang === 'ar' ? unit.name_ar ?? unit.name : unit.name}</option>)}
                </select>
                <input type="number" step="0.01" placeholder={lang === 'ar' ? 'كمية' : 'Qty'} value={line.quantity || ''} onChange={(e) => updateLine(idx, 'quantity', e.target.value)} className="input-field col-span-1" />
                <input type="number" step="0.01" placeholder={lang === 'ar' ? 'سعر' : 'Price'} value={line.unit_price || ''} onChange={(e) => updateLine(idx, 'unit_price', e.target.value)} className="input-field col-span-2" />
                <input type="number" step="0.01" placeholder={lang === 'ar' ? 'خصم' : 'Disc'} value={line.discount_amount || ''} onChange={(e) => updateLine(idx, 'discount_amount', e.target.value)} className="input-field col-span-1" />
                <div className="col-span-1 text-end text-sm text-[var(--color-text-muted)]">{lineTotals[idx]?.toFixed(2)}</div>
                <button onClick={() => removeLine(idx)} className="btn-secondary !p-1.5 col-span-1 text-error-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
          <p className="text-xs text-[var(--color-text-muted)] -mt-2">{lang === 'ar' ? 'ملاحظة: الخدمات لا تؤثر على المخزون ولا تنشئ تكلفة بيع مخزنية. إيرادات الخدمات ترتبط بالحساب المناسب وفق إعدادات المؤسسة.' : 'Note: Services do not affect inventory or create stock COGS. Service revenue links to the appropriate account per settings.'}</p>

          <div className="space-y-1 p-3 rounded-lg bg-[var(--color-bg)]">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'المجموع الفرعي' : 'Subtotal'}</span>
              <span className="text-[var(--color-text)]">{subtotal.toFixed(2)} {form.currency}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'خصم الفاتورة' : 'Invoice Discount'}</span>
              <input type="number" step="0.01" value={form.discount_amount || ''} onChange={(e) => setForm({ ...form, discount_amount: Number(e.target.value) })} className="input-field !w-32 !py-1 text-end" />
            </div>
            {(form.type === 'sale' || form.type === 'return_sale') && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'ضريبة القيمة المضافة (15%)' : 'VAT (15%)'}</span>
                <span className="text-[var(--color-text)]">{taxAmount.toFixed(2)} {form.currency}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1 border-t border-[var(--color-border)]">
              <span className="font-medium text-[var(--color-text)]">{lang === 'ar' ? 'الإجمالي' : 'Total'}</span>
              <span className="text-lg font-bold text-[var(--color-text)]">{total.toFixed(2)} {form.currency}</span>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--color-border)]">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={scannerOpen} onClose={() => setScannerOpen(false)} title={lang === 'ar' ? 'مسح باركود الصنف' : 'Scan product barcode'} size="lg">
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'وجّه الكاميرا إلى باركود الصنف، أو أدخل رقم الباركود يدويًا. إذا كان الصنف موجودًا في الفاتورة فستزداد كميته بمقدار واحد.' : 'Point the camera at a product barcode or enter its code manually. If the item is already on the invoice, its quantity increases by one.'}</p>
          {scannerError && <div role="alert" className="rounded-lg bg-error-50 dark:bg-error-900/30 p-3 text-sm text-error-600 dark:text-error-400">{scannerError}</div>}
          <div className="flex gap-2">
            <input value={manualBarcode} onChange={(e) => setManualBarcode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const code = manualBarcode.trim(); const product = products.find((item) => (item.barcode ?? '').trim() === code); if (!code) return; if (!product) { setScannerError((lang === 'ar' ? 'لا يوجد صنف بهذا الباركود: ' : 'No product found for barcode: ') + code); return; } setForm((current) => { const existing = current.lines.findIndex((line) => line.product_id === product.id); if (existing >= 0) { const lines = [...current.lines]; lines[existing] = { ...lines[existing], quantity: (Number(lines[existing].quantity) || 0) + 1 }; return { ...current, lines }; } const blankIndex = current.lines.findIndex((line) => !line.product_id && !line.description.trim()); const newLine: FormLine = { product_id: product.id, description: lang === 'ar' ? product.name_ar ?? product.name : product.name, quantity: 1, unit_price: current.type === 'sale' || current.type === 'return_sale' ? product.sale_price : product.cost_price, discount_amount: 0 }; if (blankIndex >= 0) { const lines = [...current.lines]; lines[blankIndex] = newLine; return { ...current, lines }; } return { ...current, lines: [...current.lines, newLine] }; }); setManualBarcode(''); setScannerOpen(false); } }} placeholder={lang === 'ar' ? 'أدخل الباركود يدويًا' : 'Enter barcode manually'} className="input-field flex-1" />
            <button onClick={() => { const code = manualBarcode.trim(); const product = products.find((item) => (item.barcode ?? '').trim() === code); if (!code) return; if (!product) { setScannerError((lang === 'ar' ? 'لا يوجد صنف بهذا الباركود: ' : 'No product found for barcode: ') + code); return; } setForm((current) => { const existing = current.lines.findIndex((line) => line.product_id === product.id); if (existing >= 0) { const lines = [...current.lines]; lines[existing] = { ...lines[existing], quantity: (Number(lines[existing].quantity) || 0) + 1 }; return { ...current, lines }; } const blankIndex = current.lines.findIndex((line) => !line.product_id && !line.description.trim()); const newLine: FormLine = { product_id: product.id, description: lang === 'ar' ? product.name_ar ?? product.name : product.name, quantity: 1, unit_price: form.type === 'sale' || form.type === 'return_sale' ? product.sale_price : product.cost_price, discount_amount: 0 }; if (blankIndex >= 0) { const lines = [...current.lines]; lines[blankIndex] = newLine; return { ...current, lines }; } return { ...current, lines: [...current.lines, newLine] }; }); setManualBarcode(''); setScannerOpen(false); }} className="btn-secondary">{lang === 'ar' ? 'إضافة' : 'Add'}</button>
          </div>
          <video ref={videoRef} muted playsInline className="w-full max-h-72 rounded-lg bg-black object-contain" />
          {scannerStarting && <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]"><Loader2 className="w-4 h-4 animate-spin" />{lang === 'ar' ? 'جارٍ تشغيل الكاميرا…' : 'Starting camera…'}</div>}
          <div className="flex justify-end"><button onClick={() => setScannerOpen(false)} className="btn-secondary">{lang === 'ar' ? 'إغلاق' : 'Close'}</button></div>
        </div>
      </Modal>

      <Modal open={!!viewModal} onClose={() => setViewModal(null)} title={viewModal?.invoice_number ?? ''} size="lg">
        {viewModal && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'النوع' : 'Type'}: </span><span className="font-medium text-[var(--color-text)]">{lang === 'ar' ? typeLabels[viewModal.type].ar : typeLabels[viewModal.type].en}</span></div>
              <div><span className="text-[var(--color-text-muted)]">{t('common.date')}: </span><span className="font-medium text-[var(--color-text)]">{viewModal.date}</span></div>
              <div><span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'الجهة' : 'Party'}: </span><span className="font-medium text-[var(--color-text)]">{(() => { const p = parties.find((p) => p.id === viewModal.party_id); return p ? (lang === 'ar' ? p.name_ar ?? p.name : p.name) : '—'; })()}</span></div>
              <div><span className="text-[var(--color-text-muted)]">{t('common.status')}: </span><span className="font-medium text-[var(--color-text)]">{viewModal.status}</span></div>
              {viewModal.due_date && <div><span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'الاستحقاق' : 'Due'}: </span><span className="font-medium text-[var(--color-text)]">{viewModal.due_date}</span></div>}
              {viewModal.discount_amount > 0 && <div><span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'الخصم' : 'Discount'}: </span><span className="font-medium text-[var(--color-text)]">{viewModal.discount_amount.toFixed(2)}</span></div>}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                  <th className="text-start py-2 font-medium">{lang === 'ar' ? 'الوصف' : 'Description'}</th>
                  <th className="text-end py-2 font-medium">{lang === 'ar' ? 'كمية' : 'Qty'}</th>
                  <th className="text-end py-2 font-medium">{lang === 'ar' ? 'سعر' : 'Price'}</th>
                  <th className="text-end py-2 font-medium">{lang === 'ar' ? 'خصم' : 'Disc'}</th>
                  <th className="text-end py-2 font-medium">{lang === 'ar' ? 'إجمالي' : 'Total'}</th>
                </tr>
              </thead>
              <tbody>
                {viewLines.map((line) => (
                  <tr key={line.id} className="border-b border-[var(--color-border)]">
                    <td className="py-2 text-[var(--color-text)]">{line.description ?? '—'}</td>
                    <td className="py-2 text-end text-[var(--color-text)]">{line.quantity}</td>
                    <td className="py-2 text-end text-[var(--color-text)]">{line.unit_price.toFixed(2)}</td>
                    <td className="py-2 text-end text-[var(--color-text)]">{line.discount_amount?.toFixed(2) ?? '0'}</td>
                    <td className="py-2 text-end font-medium text-[var(--color-text)]">{line.line_total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--color-border)] font-bold">
                  <td colSpan={4} className="py-2 text-end">{lang === 'ar' ? 'الإجمالي' : 'Total'}</td>
                  <td className="py-2 text-end text-[var(--color-text)]">{viewModal.total.toFixed(2)} {viewModal.currency}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
