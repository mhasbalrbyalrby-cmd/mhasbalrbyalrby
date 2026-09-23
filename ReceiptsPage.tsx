import { useEffect, useState } from 'react';
import { useI18n } from './i18n-context';
import { useAuth } from './auth-context';
import { supabase } from './supabase';
import type { Receipt, Party, ReceiptType, ReceiptStatus } from './database';
import Modal from './Modal';
import {
  Receipt as ReceiptIcon, Plus, Search, Loader2, AlertCircle,
  CheckCircle2, XCircle, Eye, Trash2,
} from 'lucide-react';

export default function ReceiptsPage() {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<ReceiptType | 'all'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    type: 'receipt' as ReceiptType,
    party_id: '',
    date: new Date().toISOString().slice(0, 10),
    amount: 0,
    currency: 'SAR',
    method: 'cash' as 'cash' | 'bank' | 'card' | 'transfer' | 'cheque',
    reference: '',
    notes: '',
  });

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const tid = profile?.tenant_id;
    if (!tid) { setLoading(false); return; }
    const [{ data: r }, { data: p }] = await Promise.all([
      supabase.from('receipts').select('*').eq('tenant_id', tid).order('date', { ascending: false }),
      supabase.from('parties').select('*').eq('tenant_id', tid),
    ]);
    setReceipts((r as Receipt[]) ?? []);
    setParties((p as Party[]) ?? []);
    setLoading(false);
  }

  function openCreate() {
    setForm({ type: 'receipt', party_id: '', date: new Date().toISOString().slice(0, 10), amount: 0, currency: 'SAR', method: 'cash', reference: '', notes: '' });
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!profile?.tenant_id) return;
    if (!form.party_id) { setError(lang === 'ar' ? 'اختر جهة' : 'Select party'); return; }
    if (form.amount <= 0) { setError(lang === 'ar' ? 'المبلغ يجب أن يكون أكبر من صفر' : 'Amount must be > 0'); return; }
    setSaving(true); setError('');
    try {
      const num = `RC-${Date.now().toString().slice(-8)}`;
      const { error: e } = await supabase.from('receipts').insert({
        tenant_id: profile.tenant_id,
        receipt_number: num,
        type: form.type,
        party_id: form.party_id,
        date: form.date,
        amount: Number(form.amount),
        currency: form.currency,
        exchange_rate: 1,
        amount_base: Number(form.amount),
        method: form.method,
        reference: form.reference.trim() || null,
        status: 'draft',
        notes: form.notes.trim() || null,
        created_by: profile.id,
      });
      if (e) throw e;
      setModalOpen(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.generic'));
    } finally { setSaving(false); }
  }

  async function postReceipt(r: Receipt) {
    if (!profile) return;
    const { data, error } = await supabase.rpc('post_receipt', { p_receipt_id: r.id });
    if (error) {
      alert((error as Error).message);
      return;
    }
    const result = data as { success: boolean; error?: string };
    if (!result.success) {
      alert(result.error || (lang === 'ar' ? 'فشل الترحيل' : 'Posting failed'));
      return;
    }
    loadData();
  }

  async function cancelReceipt(r: Receipt) {
    if (!confirm(lang === 'ar' ? 'إلغاء السند؟' : 'Cancel receipt?')) return;
    const { error } = await supabase.from('receipts').update({ status: 'cancelled' }).eq('id', r.id);
    if (!error) loadData();
  }

  async function deleteReceipt(r: Receipt) {
    if (r.status === 'posted') { alert(lang === 'ar' ? 'لا يمكن حذف سند مرحل' : 'Cannot delete posted receipt'); return; }
    if (!confirm(lang === 'ar' ? 'حذف السند؟' : 'Delete receipt?')) return;
    const { error } = await supabase.from('receipts').delete().eq('id', r.id);
    if (!error) loadData();
  }

  const filtered = receipts.filter((r) => {
    const ms = !search || r.receipt_number.toLowerCase().includes(search.toLowerCase());
    const mt = filterType === 'all' || r.type === filterType;
    return ms && mt;
  });

  const typeLabels: Record<ReceiptType, { ar: string; en: string }> = {
    receipt: { ar: 'قبض', en: 'Receipt' },
    payment: { ar: 'صرف', en: 'Payment' },
    transfer: { ar: 'تحويل', en: 'Transfer' },
  };

  const statusColors: Record<ReceiptStatus, string> = {
    draft: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400',
    posted: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400',
    cancelled: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400',
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center"><ReceiptIcon className="w-5 h-5 text-white" /></div>
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text)]">{t('nav.receipts')}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'سندات القبض والصرف' : 'Receipt and payment vouchers'}</p>
          </div>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />{lang === 'ar' ? 'سند جديد' : 'New Voucher'}</button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-[var(--color-text-muted)]" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('common.search')} className="input-field ps-10" />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value as ReceiptType | 'all')} className="input-field !w-auto">
          <option value="all">{lang === 'ar' ? 'الكل' : 'All'}</option>
          <option value="receipt">{lang === 'ar' ? 'قبض' : 'Receipt'}</option>
          <option value="payment">{lang === 'ar' ? 'صرف' : 'Payment'}</option>
          <option value="transfer">{lang === 'ar' ? 'تحويل' : 'Transfer'}</option>
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
              {filtered.map((r) => {
                const party = parties.find((p) => p.id === r.party_id);
                return (
                  <tr key={r.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                    <td className="py-2 px-3 font-mono text-[var(--color-text)]">{r.receipt_number}</td>
                    <td className="py-2 px-3 text-[var(--color-text-muted)]">{lang === 'ar' ? typeLabels[r.type].ar : typeLabels[r.type].en}</td>
                    <td className="py-2 px-3 text-[var(--color-text)]">{party ? (lang === 'ar' ? party.name_ar ?? party.name : party.name) : '—'}</td>
                    <td className="py-2 px-3 text-[var(--color-text-muted)]">{r.date}</td>
                    <td className="py-2 px-3 text-end font-medium text-[var(--color-text)]">{r.amount.toFixed(2)} {r.currency}</td>
                    <td className="py-2 px-3"><span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[r.status]}`}>{r.status}</span></td>
                    <td className="py-2 px-3 text-end">
                      <div className="flex gap-1 justify-end">
                        {r.status === 'draft' && (
                          <>
                            <button onClick={() => postReceipt(r)} className="btn-secondary !p-1.5 text-success-600" title={lang === 'ar' ? 'ترحيل' : 'Post'}><CheckCircle2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => cancelReceipt(r)} className="btn-secondary !p-1.5 text-error-500" title={t('common.cancel')}><XCircle className="w-3.5 h-3.5" /></button>
                            <button onClick={() => deleteReceipt(r)} className="btn-secondary !p-1.5 text-error-500" title={t('common.delete')}><Trash2 className="w-3.5 h-3.5" /></button>
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={lang === 'ar' ? 'سند جديد' : 'New Voucher'}>
        {error && <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg px-3 py-2 mb-4"><AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span></div>}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'النوع' : 'Type'}</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ReceiptType })} className="input-field">
                <option value="receipt">{lang === 'ar' ? 'قبض' : 'Receipt'}</option>
                <option value="payment">{lang === 'ar' ? 'صرف' : 'Payment'}</option>
                <option value="transfer">{lang === 'ar' ? 'تحويل' : 'Transfer'}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{t('common.date')}</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input-field" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الجهة' : 'Party'} *</label>
            <select value={form.party_id} onChange={(e) => setForm({ ...form, party_id: e.target.value })} className="input-field">
              <option value="">{lang === 'ar' ? 'اختر' : 'Select'}</option>
              {parties.map((p) => <option key={p.id} value={p.id}>{lang === 'ar' ? p.name_ar ?? p.name : p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{t('common.amount')} *</label>
              <input type="number" step="0.01" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{t('common.currency')}</label>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="input-field">
                <option value="SAR">SAR</option><option value="YER">YER</option><option value="USD">USD</option><option value="AED">AED</option><option value="EGP">EGP</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الطريقة' : 'Method'}</label>
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as typeof form.method })} className="input-field">
              <option value="cash">{lang === 'ar' ? 'نقدي' : 'Cash'}</option>
              <option value="bank">{lang === 'ar' ? 'مصرف' : 'Bank'}</option>
              <option value="card">{lang === 'ar' ? 'بطاقة' : 'Card'}</option>
              <option value="transfer">{lang === 'ar' ? 'تحويل' : 'Transfer'}</option>
              <option value="cheque">{lang === 'ar' ? 'شيك' : 'Cheque'}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'مرجع' : 'Reference'}</label>
            <input type="text" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{t('common.notes')}</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field min-h-16" rows={2} />
          </div>
          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--color-border)]">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
