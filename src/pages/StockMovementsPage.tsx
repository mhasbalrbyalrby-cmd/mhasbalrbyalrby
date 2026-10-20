import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeftRight, ClipboardCheck, Loader2, PackagePlus, RefreshCw, Send, Truck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import { supabase } from '@/lib/supabase';
import type { Product, Warehouse } from '@/lib/database';

type DocType = 'stock_in' | 'stock_out' | 'transfer' | 'count_adjustment';
type DocStatus = 'draft' | 'posted' | 'cancelled';
type StockDoc = {
  id: string; document_number: string; document_type: DocType; status: DocStatus;
  warehouse_id: string; to_warehouse_id: string | null; document_date: string; notes: string | null;
  created_at: string; posted_at: string | null;
};
type Line = { product_id: string; quantity: string; unit_cost: string; counted_quantity: string };
const inputClass = 'input-field min-w-0';

export default function StockMovementsPage() {
  const { tenant } = useAuth();
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const [docs, setDocs] = useState<StockDoc[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [schemaReady, setSchemaReady] = useState(false);
  const [schemaMessage, setSchemaMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [docType, setDocType] = useState<DocType>('stock_in');
  const [warehouseId, setWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [docDate, setDocDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([{ product_id: '', quantity: '1', unit_cost: '0', counted_quantity: '' }]);

  const warehouseName = (id: string) => {
    const w = warehouses.find(x => x.id === id);
    return w ? ((ar && w.name_ar) || w.name) : '—';
  };
  const productName = (id: string) => {
    const p = products.find(x => x.id === id);
    return p ? ((ar && p.name_ar) || p.name) : id;
  };
  const typeLabel = (type: DocType) => ({
    stock_in: ar ? 'توريد مخزني' : 'Stock In',
    stock_out: ar ? 'صرف مخزني' : 'Stock Out',
    transfer: ar ? 'تحويل بين المخازن' : 'Warehouse Transfer',
    count_adjustment: ar ? 'جرد وتسوية' : 'Stock Count / Adjustment',
  })[type];
  const statusLabel = (status: DocStatus) => ({
    draft: ar ? 'مسودة' : 'Draft',
    posted: ar ? 'مرحّل' : 'Posted',
    cancelled: ar ? 'ملغى' : 'Cancelled',
  })[status];

  async function loadData() {
    setLoading(true);
    setError('');
    const tid = tenant?.id;
    if (!tid) { setLoading(false); return; }
    const [docResult, warehouseResult, productResult, schemaResult] = await Promise.all([
      supabase.from('stock_documents').select('*').eq('tenant_id', tid).order('created_at', { ascending: false }).limit(100),
      supabase.from('warehouses').select('*').eq('tenant_id', tid).eq('is_active', true),
      supabase.from('products').select('*').eq('tenant_id', tid).eq('is_active', true).eq('type', 'product').order('name'),
      supabase.from('stock_document_lines').select('id').limit(1),
    ]);
    setWarehouses((warehouseResult.data as Warehouse[]) ?? []);
    setProducts((productResult.data as Product[]) ?? []);
    if (docResult.error || schemaResult.error) {
      setSchemaReady(false);
      setSchemaMessage(ar
        ? 'جداول سندات المخزون غير متاحة في قاعدة البيانات المتصلة. لم يتم تمكين الحفظ أو الترحيل.'
        : 'Stock document tables are unavailable in the connected database. Save and posting remain disabled.');
      if (docResult.error && !/does not exist|schema cache|stock_documents/i.test(docResult.error.message)) setError(docResult.error.message);
      setDocs([]);
    } else {
      setSchemaReady(true);
      setSchemaMessage('');
      setDocs((docResult.data as StockDoc[]) ?? []);
    }
    if (warehouseResult.error) setError(warehouseResult.error.message);
    if (productResult.error) setError(productResult.error.message);
    setLoading(false);
  }
  useEffect(() => { void loadData(); }, [tenant?.id]);

  const hasDuplicateProducts = new Set(lines.filter(l => l.product_id).map(l => l.product_id)).size !== lines.filter(l => l.product_id).length;
  const canSave = useMemo(() => schemaReady && !!warehouseId && !!docNumber.trim() && lines.length > 0 && !hasDuplicateProducts &&
    lines.every(l => !!l.product_id && Number.isFinite(Number(l.quantity)) && Number(l.quantity) > 0 && Number.isFinite(Number(l.unit_cost)) && Number(l.unit_cost) >= 0 &&
      (docType !== 'count_adjustment' || (l.counted_quantity !== '' && Number.isFinite(Number(l.counted_quantity)) && Number(l.counted_quantity) >= 0))) &&
    (docType !== 'transfer' || (!!toWarehouseId && toWarehouseId !== warehouseId)), [schemaReady, warehouseId, docNumber, lines, docType, toWarehouseId, hasDuplicateProducts]);

  function resetForm() {
    setDocType('stock_in'); setWarehouseId(''); setToWarehouseId(''); setDocNumber('');
    setDocDate(new Date().toISOString().slice(0, 10)); setNotes('');
    setLines([{ product_id: '', quantity: '1', unit_cost: '0', counted_quantity: '' }]);
    setShowForm(false); setError('');
  }

  async function saveDraft() {
    if (!tenant?.id || !canSave) return;
    setBusy(true); setError('');
    let createdId: string | null = null;
    try {
      const { data: doc, error: docError } = await supabase.from('stock_documents').insert({
        tenant_id: tenant.id, document_number: docNumber.trim(), document_type: docType,
        status: 'draft', warehouse_id: warehouseId,
        to_warehouse_id: docType === 'transfer' ? toWarehouseId : null,
        document_date: docDate, notes: notes.trim() || null,
      }).select('id').single();
      if (docError) throw docError;
      createdId = doc.id;
      const { error: linesError } = await supabase.from('stock_document_lines').insert(lines.map(l => ({
        tenant_id: tenant.id, document_id: doc.id, product_id: l.product_id,
        quantity: Number(l.quantity), unit_cost: Number(l.unit_cost || 0),
        counted_quantity: docType === 'count_adjustment' ? Number(l.counted_quantity) : null,
      })));
      if (linesError) {
        await supabase.from('stock_documents').delete().eq('id', doc.id).eq('tenant_id', tenant.id);
        throw linesError;
      }
      resetForm();
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ar ? 'تعذر حفظ المسودة' : 'Could not save draft'));
    } finally { setBusy(false); }
  }

  async function postDocument(doc: StockDoc) {
    if (!schemaReady || doc.status !== 'draft') return;
    const message = ar ? `هل تريد اعتماد وترحيل السند «${doc.document_number}»؟ لا يمكن تعديله بعد الترحيل.` : `Post document ${doc.document_number}? Posted documents cannot be edited.`;
    if (!window.confirm(message)) return;
    setBusy(true); setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('post_stock_document', { p_document_id: doc.id });
      if (rpcError) throw rpcError;
      if (!data || data.success !== true) throw new Error(data?.error || (ar ? 'فشل ترحيل السند' : 'Posting failed'));
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ar ? 'فشل الترحيل' : 'Posting failed'));
    } finally { setBusy(false); }
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center"><Truck className="w-5 h-5 text-white" /></div>
        <div><h2 className="text-lg font-bold text-[var(--color-text)]">{ar ? 'حركات المخزون والمستودعات' : 'Stock Movements & Warehouses'}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">{ar ? 'سندات التوريد والصرف والتحويل والجرد' : 'Stock in, stock out, transfers and stocktaking'}</p></div>
      </div>
      <div className="flex gap-2"><button className="btn-secondary flex items-center gap-2" onClick={() => void loadData()} disabled={loading || busy}><RefreshCw className="w-4 h-4" />{ar ? 'تحديث' : 'Refresh'}</button>
        <button className="btn-primary flex items-center gap-2" onClick={() => { setShowForm(v => !v); setError(''); }} disabled={!schemaReady || warehouses.length === 0 || products.length === 0}><PackagePlus className="w-4 h-4" />{ar ? 'سند جديد' : 'New document'}</button></div>
    </div>

    {!schemaReady && <div className="rounded-xl border border-warning-400 bg-warning-50 p-4 text-sm text-warning-900 flex gap-3"><AlertCircle className="w-5 h-5 shrink-0" /><div><p className="font-semibold">{ar ? 'الحفظ والترحيل غير متاحين' : 'Save and posting are disabled'}</p><p>{schemaMessage || (ar ? 'لم يتم التحقق من جاهزية جداول السندات.' : 'Stock document schema has not been verified.')}</p><p className="mt-1">{ar ? 'هذا إجراء حماية مقصود حتى تُطبّق Migration في بيئة اختبار منفصلة وتُختبر العمليات.' : 'This is intentional until the migration is applied and tested in a separate test environment.'}</p></div></div>}
    {error && <div role="alert" className="rounded-lg border border-error-300 p-3 text-sm text-error-700 flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}

    {showForm && schemaReady && <section className="card space-y-4">
      <h3 className="font-semibold">{ar ? 'إنشاء مسودة سند مخزني' : 'Create stock document draft'}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <label className="text-sm space-y-1"><span>{ar ? 'نوع السند' : 'Document type'}</span><select className={inputClass} value={docType} onChange={e => setDocType(e.target.value as DocType)}><option value="stock_in">{typeLabel('stock_in')}</option><option value="stock_out">{typeLabel('stock_out')}</option><option value="transfer">{typeLabel('transfer')}</option><option value="count_adjustment">{typeLabel('count_adjustment')}</option></select><p className="text-xs text-[var(--color-text-muted)]">{ar ? 'اختر نوع الحركة الصحيح؛ التحويل يتطلب مستودعاً مستلماً، والجرد يتطلب الكمية الفعلية.' : 'Choose the correct movement type. Transfers need a destination warehouse; stock counts need the counted quantity.'}</p></label>
        <label className="text-sm space-y-1"><span>{ar ? 'رقم السند' : 'Document number'}</span><input className={inputClass} value={docNumber} onChange={e => setDocNumber(e.target.value)} required placeholder={ar ? 'مثال: ST-0001' : 'e.g. ST-0001'} /></label>
        <label className="text-sm space-y-1"><span>{ar ? 'التاريخ' : 'Date'}</span><input type="date" className={inputClass} value={docDate} onChange={e => setDocDate(e.target.value)} required /></label>
        <label className="text-sm space-y-1"><span>{ar ? 'المستودع المصدر/المعني' : 'Source / selected warehouse'}</span><select className={inputClass} value={warehouseId} onChange={e => setWarehouseId(e.target.value)}><option value="">{ar ? 'اختر مستودعاً' : 'Select warehouse'}</option>{warehouses.map(w => <option key={w.id} value={w.id}>{(ar && w.name_ar) || w.name}</option>)}</select><p className="text-xs text-[var(--color-text-muted)]">{ar ? 'هذا هو المستودع المصدر في التحويل، أو المستودع المعني في بقية الحركات.' : 'This is the source warehouse for transfers, or the warehouse affected by other movements.'}</p></label>
        {docType === 'transfer' && <label className="text-sm space-y-1"><span>{ar ? 'المستودع المستلم' : 'Destination warehouse'}</span><select className={inputClass} value={toWarehouseId} onChange={e => setToWarehouseId(e.target.value)}><option value="">{ar ? 'اختر المستودع المستلم' : 'Select destination'}</option>{warehouses.filter(w => w.id !== warehouseId).map(w => <option key={w.id} value={w.id}>{(ar && w.name_ar) || w.name}</option>)}</select><p className="text-xs text-[var(--color-text-muted)]">{ar ? 'اختر مستودعاً مختلفاً عن المستودع المصدر.' : 'Choose a destination different from the source warehouse.'}</p></label>}
        <label className="text-sm space-y-1 sm:col-span-2"><span>{ar ? 'ملاحظات' : 'Notes'}</span><input className={inputClass} value={notes} onChange={e => setNotes(e.target.value)} /></label>
      </div>
      {hasDuplicateProducts && <p role="alert" className="text-sm text-error-600">{ar ? 'لا يمكن تكرار الصنف في أكثر من سطر بالسند نفسه؛ اجمع الكمية في سطر واحد.' : 'A product can only appear once per document. Combine its quantity into one line.'}</p>}
      <div className="space-y-3">
        <div className="flex justify-between items-center gap-2"><h4 className="font-medium">{ar ? 'الأصناف والكميات' : 'Products and quantities'}</h4><button className="btn-secondary text-sm" type="button" onClick={() => setLines(v => [...v, { product_id: '', quantity: '1', unit_cost: '0', counted_quantity: '' }])}>{ar ? '+ إضافة صنف' : '+ Add line'}</button></div>
        {lines.map((line, index) => <div key={index} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 rounded-lg border border-[var(--color-border)] p-3">
          <label className="text-xs space-y-1 lg:col-span-2"><span>{ar ? 'الصنف' : 'Product'}</span><select className={inputClass} value={line.product_id} onChange={e => setLines(v => v.map((l,i) => i===index ? {...l,product_id:e.target.value}:l))}><option value="">{ar ? 'اختر صنفاً' : 'Select product'}</option>{products.map(p => <option key={p.id} value={p.id}>{(ar && p.name_ar) || p.name} ({p.code})</option>)}</select><p className="text-xs text-[var(--color-text-muted)]">{ar ? 'اختر الصنف المسجل في المخزون؛ لا تكرر الصنف في سطر آخر من السند.' : 'Choose the inventory item. Do not add the same item on another line in this document.'}</p></label>
          <label className="text-xs space-y-1"><span>{ar ? 'الكمية' : 'Quantity'}</span><input type="number" min="0.0001" step="0.0001" className={inputClass} value={line.quantity} onChange={e => setLines(v => v.map((l,i) => i===index ? {...l,quantity:e.target.value}:l))} /></label>
          <label className="text-xs space-y-1"><span>{ar ? 'تكلفة الوحدة' : 'Unit cost'}</span><input type="number" min="0" step="0.0001" className={inputClass} value={line.unit_cost} onChange={e => setLines(v => v.map((l,i) => i===index ? {...l,unit_cost:e.target.value}:l))} /></label>
          {docType === 'count_adjustment' ? <label className="text-xs space-y-1"><span>{ar ? 'الكمية الفعلية بالجرد' : 'Counted quantity'}</span><input type="number" min="0" step="0.0001" className={inputClass} value={line.counted_quantity} onChange={e => setLines(v => v.map((l,i) => i===index ? {...l,counted_quantity:e.target.value}:l))} /></label> : <button type="button" className="text-sm text-error-600 self-end py-2" disabled={lines.length===1} onClick={() => setLines(v => v.filter((_,i)=>i!==index))}>{ar ? 'حذف السطر' : 'Remove line'}</button>}
        </div>)}
      </div>
      <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={resetForm} disabled={busy}>{ar ? 'إلغاء' : 'Cancel'}</button><button className="btn-primary flex items-center gap-2" onClick={() => void saveDraft()} disabled={!canSave || busy}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{ar ? 'حفظ المسودة' : 'Save draft'}</button></div>
    </section>}

    <section className="card p-0 overflow-hidden">
      <div className="p-4 border-b border-[var(--color-border)] flex items-center gap-2"><ClipboardCheck className="w-5 h-5" /><h3 className="font-semibold">{ar ? 'سجل السندات المخزنية' : 'Stock document register'}</h3></div>
      {loading ? <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div> : docs.length === 0 ? <div className="p-8 text-center text-sm text-[var(--color-text-muted)]">{schemaReady ? (ar ? 'لا توجد سندات حتى الآن.' : 'No stock documents yet.') : (ar ? 'ستظهر السندات بعد تجهيز الجداول في بيئة اختبار.' : 'Documents will appear after the schema is available in a test environment.')}</div> :
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-start border-b border-[var(--color-border)]"><th className="p-3 text-start">{ar ? 'رقم السند' : 'Document #'}</th><th className="p-3 text-start">{ar ? 'النوع' : 'Type'}</th><th className="p-3 text-start">{ar ? 'المستودع' : 'Warehouse'}</th><th className="p-3 text-start">{ar ? 'التاريخ' : 'Date'}</th><th className="p-3 text-start">{ar ? 'الحالة' : 'Status'}</th><th className="p-3 text-start">{ar ? 'الإجراء' : 'Action'}</th></tr></thead><tbody>{docs.map(doc => <tr key={doc.id} className="border-b border-[var(--color-border)]"><td className="p-3 font-medium">{doc.document_number}</td><td className="p-3">{typeLabel(doc.document_type)}</td><td className="p-3">{warehouseName(doc.warehouse_id)}{doc.to_warehouse_id ? <span className="block text-xs text-[var(--color-text-muted)]">{ar ? 'إلى: ' : 'To: '}{warehouseName(doc.to_warehouse_id)}</span> : null}</td><td className="p-3">{doc.document_date}</td><td className="p-3">{statusLabel(doc.status)}</td><td className="p-3">{doc.status === 'draft' ? <button className="btn-primary text-xs flex items-center gap-1" disabled={busy || !schemaReady} onClick={() => void postDocument(doc)}><Send className="w-3 h-3" />{ar ? 'اعتماد وترحيل' : 'Post'}</button> : <span className="text-xs text-[var(--color-text-muted)]">{doc.status === 'posted' ? (ar ? 'مقفول بعد الترحيل' : 'Locked after posting') : '—'}</span>}</td></tr>)}</tbody></table></div>}
    </section>
    <p className="text-xs text-[var(--color-text-muted)] flex items-start gap-2"><ArrowLeftRight className="w-4 h-4 shrink-0" />{ar ? 'التحويل يسجل حركة خروج ودخول مترابطتين. الجرد يعتمد الفرق بين الرصيد المحسوب والكمية الفعلية. لا توجد قيود محاسبية تلقائية لتسويات الجرد حتى يتم اعتماد خريطة حسابات واختبارها.' : 'Transfers create paired outgoing/incoming movements. Stocktaking compares book stock to counted quantity. Automatic GL entries for adjustments are not enabled until account mapping is reviewed and tested.'}</p>
  </div>;
}
