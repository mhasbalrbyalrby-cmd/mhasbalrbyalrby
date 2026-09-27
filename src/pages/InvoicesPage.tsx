import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Invoice, Party, InvoiceLine, InvoiceType, InvoiceStatus } from '@/types/database';
import Modal from '@/components/Modal';
import {
  FileText, Plus, Search, Pencil, Trash2, Loader2, AlertCircle,
  CheckCircle2, XCircle, Eye,
} from 'lucide-react';

export default function InvoicesPage() {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<InvoiceType | 'all'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [viewModal, setViewModal] = useState<Invoice | null>(null);
  const [viewLines, setViewLines] = useState<InvoiceLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    type: 'sale' as InvoiceType,
    party_id: '',
    date: new Date().toISOString().slice(0, 10),
    currency: 'SAR',
    notes: '',
    lines: [{ product_id: '', description: '', quantity: 1, unit_price: 0 }] as { product_id: string; description: string; quantity: number; unit_price: number }[],
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const tenantId = profile?.tenant_id;
    if (!tenantId) { setLoading(false); return; }

    const [{ data: invData }, { data: partyData }] = await Promise.all([
      supabase.from('invoices').select('*').eq('tenant_id', tenantId).order('date', { ascending: false }),
      supabase.from('parties').select('*').eq('tenant_id', tenantId),
    ]);

    setInvoices((invData as Invoice[]) ?? []);
    setParties((partyData as Party[]) ?? []);
    setLoading(false);
  }

  function openCreate() {
    setEditingInvoiceId(null);
    setForm({
      type: 'sale',
      party_id: '',
      date: new Date().toISOString().slice(0, 10),
      currency: 'SAR',
      notes: '',
      lines: [{ product_id: '', description: '', quantity: 1, unit_price: 0 }],
    });
    setError('');
    setModalOpen(true);
  }

  async function openEdit(inv: Invoice) {
    if (inv.status !== 'draft') return;
    setEditingInvoiceId(inv.id);
    setError('');

    // جلب أسطر الفاتورة
    const { data: lines } = await supabase
      .from('invoice_lines')
      .select('*')
      .eq('invoice_id', inv.id)
      .order('line_order');

    const formattedLines = (lines as InvoiceLine[] ?? []).map(l => ({
      product_id: l.product_id || '',
      description: l.description || '',
      quantity: l.quantity,
      unit_price: l.unit_price,
    }));

    setForm({
      type: inv.type,
      party_id: inv.party_id,
      date: inv.date,
      currency: inv.currency,
      notes: inv.notes || '',
      lines: formattedLines.length > 0 ? formattedLines : [{ product_id: '', description: '', quantity: 1, unit_price: 0 }],
    });

    setModalOpen(true);
  }

  function addLine() {
    setForm({ ...form, lines: [...form.lines, { product_id: '', description: '', quantity: 1, unit_price: 0 }] });
  }

  function updateLine(idx: number, field: string, value: string | number) {
    const newLines = [...form.lines];
    (newLines[idx] as Record<string, string | number>)[field] = value;
    setForm({ ...form, lines: newLines });
  }

  function removeLine(idx: number) {
    if (form.lines.length <= 1) return;
    setForm({ ...form, lines: form.lines.filter((_, i) => i !== idx) });
  }

  const subtotal = form.lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);
  const total = subtotal;

  async function handleSave() {
    if (!profile?.tenant_id) return;
    if (!form.party_id) {
      setError(lang === 'ar' ? 'اختر جهة الاتصال' : 'Select a contact');
      return;
    }
    const hasValidLine = form.lines.some((l) => (l.description.trim() || l.product_id) && Number(l.quantity) > 0);
    if (!hasValidLine) {
      setError(lang === 'ar' ? 'أضف سطرًا واحدًا صالحًا على الأقل' : 'Add at least one valid line');
      return;
    }

    setSaving(true);
    setError('');

    try {
      let invId = editingInvoiceId;

      if (editingInvoiceId) {
        // تحديث الفاتورة الحالية
        const { error: updateErr } = await supabase
          .from('invoices')
          .update({
            type: form.type,
            party_id: form.party_id,
            date: form.date,
            currency: form.currency,
            subtotal,
            total,
            notes: form.notes.trim() || null,
          })
          .eq('id', editingInvoiceId);

        if (updateErr) throw updateErr;

        // حذف الأسطر القديمة وإعادة إدراج الجديدة
        await supabase.from('invoice_lines').delete().eq('invoice_id', editingInvoiceId);
      } else {
        // إنشاء فاتورة جديدة
        const invNumber = `INV-${Date.now().toString().slice(-8)}`;
        const { data: inv, error: invErr } = await supabase
          .from('invoices')
          .insert({
            tenant_id: profile.tenant_id,
            invoice_number: invNumber,
            type: form.type,
            party_id: form.party_id,
            date: form.date,
            currency: form.currency,
            subtotal,
            total,
            status: 'draft',
            notes: form.notes.trim() || null,
            created_by: profile.id,
          })
          .select()
          .single();

        if (invErr) throw invErr;
        invId = (inv as Invoice).id;
      }

      const linePayloads = form.lines.map((l, i) => ({
        invoice_id: invId,
        tenant_id: profile.tenant_id,
        product_id: l.product_id || null,
        description: l.description || null,
        quantity: Number(l.quantity) || 1,
        unit_price: Number(l.unit_price) || 0,
        line_total: (Number(l.quantity) || 1) * (Number(l.unit_price) || 0),
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
    setActionLoadingId(inv.id);
    try {
      const { data, error } = await supabase.rpc('post_invoice', { p_invoice_id: inv.id });
      if (error) {
        alert(error.message);
        return;
      }
      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        alert(result.error || (lang === 'ar' ? 'فشل الترحيل' : 'Posting failed'));
        return;
      }
      await loadData();
    } finally {
      setActionLoadingId(null);
    }
  }

  async function cancelInvoice(inv: Invoice) {
    if (!confirm(lang === 'ar' ? 'إلغاء الفاتورة؟' : 'Cancel invoice?')) return;
    setActionLoadingId(inv.id);
    try {
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'cancelled' })
        .eq('id', inv.id);
      if (!error) await loadData();
    } finally {
      setActionLoadingId(null);
    }
  }

  async function deleteInvoice(inv: Invoice) {
    if (!confirm(lang === 'ar' ? 'حذف الفاتورة؟' : 'Delete invoice?')) return;
    setActionLoadingId(inv.id);
    try {
      await supabase.from('invoice_lines').delete().eq('invoice_id', inv.id);
      const { error } = await supabase.from('invoices').delete().eq('id', inv.id);
      if (!error) await loadData();
    } finally {
      setActionLoadingId(null);
    }
  }

  async function viewInvoice(inv: Invoice) {
    setViewModal(inv);
    const { data } = await supabase
      .from('invoice_lines')
      .select('*')
      .eq('invoice_id', inv.id)
      .order('line_order');
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
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text)]">{t('nav.invoices')}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              {lang === 'ar' ? 'فواتير المبيعات والمشتريات والمرتجع' : 'Sales, purchase, and return invoices'}
            </p>
          </div>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          {lang === 'ar' ? 'فاتورة جديدة' : 'New Invoice'}
        </button>
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
                const isActionLoading = actionLoadingId === inv.id;

                return (
                  <tr key={inv.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                    <td className="py-2 px-3 font-mono text-[var(--color-text)]">{inv.invoice_number}</td>
                    <td className="py-2 px-3 text-[var(--color-text-muted)]">{lang === 'ar' ? typeLabels[inv.type]?.ar : typeLabels[inv.type]?.en}</td>
                    <td className="py-2 px-3 text-[var(--color-text)]">{party ? (lang === 'ar' ? party.name_ar ?? party.name : party.name) : '—'}</td>
                    <td className="py-2 px-3 text-[var(--color-text-muted)]">{inv.date}</td>
                    <td className="py-2 px-3 text-end font-medium text-[var(--color-text)]">{(Number(inv.total) || 0).toFixed(2)} {inv.currency}</td>
                    <td className="py-2 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[inv.status]}`}>{inv.status}</span>
                    </td>
                    <td className="py-2 px-3 text-end">
                      <div className="flex gap-1 justify-end items-center">
                        {isActionLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin text-[var(--color-text-muted)]" />
                        ) : (
                          <>
                            <button onClick={() => viewInvoice(inv)} className="btn-secondary !p-1.5" title={lang === 'ar' ? 'عرض' : 'View'}>
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {inv.status === 'draft' && (
                              <>
                                <button onClick={() => openEdit(inv)} className="btn-secondary !p-1.5" title={lang === 'ar' ? 'تعديل' : 'Edit'}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => postInvoice(inv)} className="btn-secondary !p-1.5 text-success-600" title={lang === 'ar' ? 'ترحيل' : 'Post'}>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => cancelInvoice(inv)} className="btn-secondary !p-1.5 text-error-500" title={t('common.cancel')}>
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => deleteInvoice(inv)} className="btn-secondary !p-1.5 text-error-500" title={t('common.delete')}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
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

      {/* Create / Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingInvoiceId ? (lang === 'ar' ? 'تعديل الفاتورة' : 'Edit Invoice') : (lang === 'ar' ? 'فاتورة جديدة' : 'New Invoice')} size="lg">
        {error && (
          <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg px-3 py-2 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'النوع' : 'Type'}</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as InvoiceType })} className="input-field">
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
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>{lang === 'ar' ? p.name_ar ?? p.name : p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{t('common.date')}</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input-field" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[var(--color-text-muted)]">{lang === 'ar' ? 'سطور الفاتورة' : 'Invoice Lines'}</span>
              <button onClick={addLine} className="btn-secondary text-sm flex items-center gap-1">
                <Plus className="w-3 h-3" />
                {lang === 'ar' ? 'سطر' : 'Line'}
              </button>
            </div>
            {form.lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center mb-2">
                <input
                  type="text"
                  placeholder={lang === 'ar' ? 'الوصف' : 'Description'}
                  value={line.description}
                  onChange={(e) => updateLine(idx, 'description', e.target.value)}
                  className="input-field col-span-5"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder={lang === 'ar' ? 'الكمية' : 'Qty'}
                  value={line.quantity || ''}
                  onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                  className="input-field col-span-2"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder={lang === 'ar' ? 'السعر' : 'Price'}
                  value={line.unit_price || ''}
                  onChange={(e) => updateLine(idx, 'unit_price', e.target.value)}
                  className="input-field col-span-3"
                />
                <div className="col-span-1 text-end text-sm text-[var(--color-text-muted)]">
                  {((Number(line.quantity) || 0) * (Number(line.unit_price) || 0)).toFixed(2)}
                </div>
                <button onClick={() => removeLine(idx)} className="btn-secondary !p-1.5 col-span-1 text-error-500">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-bg)]">
            <span className="font-medium text-[var(--color-text)]">{lang === 'ar' ? 'الإجمالي' : 'Total'}</span>
            <span className="text-lg font-bold text-[var(--color-text)]">{total.toFixed(2)} {form.currency}</span>
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--color-border)]">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('common.save')}
            </button>
          </div>
        </div>
      </Modal>

      {/* View Modal */}
      <Modal open={!!viewModal} onClose={() => setViewModal(null)} title={viewModal?.invoice_number ?? ''} size="lg">
        {viewModal && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'النوع' : 'Type'}: </span><span className="font-medium text-[var(--color-text)]">{lang === 'ar' ? typeLabels[viewModal.type]?.ar : typeLabels[viewModal.type]?.en}</span></div>
              <div><span className="text-[var(--color-text-muted)]">{t('common.date')}: </span><span className="font-medium text-[var(--color-text)]">{viewModal.date}</span></div>
              <div><span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'الجهة' : 'Party'}: </span><span className="font-medium text-[var(--color-text)]">{(() => { const p = parties.find((p) => p.id === viewModal.party_id); return p ? (lang === 'ar' ? p.name_ar ?? p.name : p.name) : '—'; })()}</span></div>
              <div><span className="text-[var(--color-text-muted)]">{t('common.status')}: </span><span className="font-medium text-[var(--color-text)]">{viewModal.status}</span></div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                  <th className="text-start py-2 font-medium">{lang === 'ar' ? 'الوصف' : 'Description'}</th>
                  <th className="text-end py-2 font-medium">{lang === 'ar' ? 'كمية' : 'Qty'}</th>
                  <th className="text-end py-2 font-medium">{lang === 'ar' ? 'سعر' : 'Price'}</th>
                  <th className="text-end py-2 font-medium">{lang === 'ar' ? 'إجمالي' : 'Total'}</th>
                </tr>
              </thead>
              <tbody>
                {viewLines.map((line) => (
                  <tr key={line.id} className="border-b border-[var(--color-border)]">
                    <td className="py-2 text-[var(--color-text)]">{line.description ?? '—'}</td>
                    <td className="py-2 text-end text-[var(--color-text)]">{line.quantity}</td>
                    <td className="py-2 text-end text-[var(--color-text)]">{(Number(line.unit_price) || 0).toFixed(2)}</td>
                    <td className="py-2 text-end font-medium text-[var(--color-text)]">{(Number(line.line_total) || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--color-border)] font-bold">
                  <td colSpan={3} className="py-2 text-end">{lang === 'ar' ? 'الإجمالي' : 'Total'}</td>
                  <td className="py-2 text-end text-[var(--color-text)]">{(Number(viewModal.total) || 0).toFixed(2)} {viewModal.currency}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
