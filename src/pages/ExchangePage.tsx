import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { ExchangeTransfer, Party, TransferStatus } from '@/types/database';
import Modal from '@/components/Modal';
import {
  ArrowLeftRight, Plus, Search, Loader2, AlertCircle,
  XCircle, Eye, Send, Check,
} from 'lucide-react';

export default function ExchangePage() {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const [transfers, setTransfers] = useState<ExchangeTransfer[]>([]);
  const [agents, setAgents] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<TransferStatus | 'all'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [viewModal, setViewModal] = useState<ExchangeTransfer | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    sender_name: '',
    sender_phone: '',
    beneficiary_name: '',
    beneficiary_phone: '',
    amount: 0,
    currency: 'SAR',
    commission: 0,
    commission_currency: 'SAR',
    agent_id: '',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const tid = profile?.tenant_id;
    if (!tid) {
      setLoading(false);
      return;
    }

    const [{ data: tr }, { data: ag }] = await Promise.all([
      supabase.from('exchange_transfers').select('*').eq('tenant_id', tid).order('date', { ascending: false }),
      supabase.from('party_roles').select('party_id, role').eq('role', 'agent'),
    ]);

    setTransfers((tr as ExchangeTransfer[]) ?? []);

    if (ag && ag.length > 0) {
      const agentIds = ag.map((a: { party_id: string }) => a.party_id);
      const { data: agentParties } = await supabase.from('parties').select('*').in('id', agentIds);
      setAgents((agentParties as Party[]) ?? []);
    }
    setLoading(false);
  }

  function openCreate() {
    setForm({
      sender_name: '',
      sender_phone: '',
      beneficiary_name: '',
      beneficiary_phone: '',
      amount: 0,
      currency: 'SAR',
      commission: 0,
      commission_currency: 'SAR',
      agent_id: '',
      date: new Date().toISOString().slice(0, 10),
      notes: '',
    });
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!profile?.tenant_id) return;
    if (!form.sender_name.trim() || !form.beneficiary_name.trim()) {
      setError(lang === 'ar' ? 'اسم المرسل والمستفيد مطلوبان' : 'Sender and beneficiary names required');
      return;
    }
    if (Number(form.amount) <= 0) {
      setError(lang === 'ar' ? 'المبلغ يجب أن يكون أكبر من صفر' : 'Amount must be > 0');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const num = `TR-${Date.now().toString().slice(-8)}`;
      const { error: e } = await supabase.from('exchange_transfers').insert({
        tenant_id: profile.tenant_id,
        transfer_number: num,
        sender_name: form.sender_name.trim(),
        sender_phone: form.sender_phone.trim() || null,
        beneficiary_name: form.beneficiary_name.trim(),
        beneficiary_phone: form.beneficiary_phone.trim() || null,
        amount: Number(form.amount),
        currency: form.currency,
        commission: Number(form.commission),
        commission_currency: form.commission_currency,
        agent_id: form.agent_id || null,
        date: form.date,
        status: 'pending',
        notes: form.notes.trim() || null,
        created_by: profile.id,
      });

      if (e) throw e;
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.generic'));
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(tr: ExchangeTransfer, status: TransferStatus) {
    setActionLoadingId(tr.id);
    try {
      const updates: Partial<ExchangeTransfer> = { status };
      if (status === 'delivered') {
        updates.delivery_date = new Date().toISOString().slice(0, 10);
      }
      const { error } = await supabase.from('exchange_transfers').update(updates).eq('id', tr.id);
      if (!error) await loadData();
    } finally {
      setActionLoadingId(null);
    }
  }

  const filtered = transfers.filter((tr) => {
    const ms =
      !search ||
      tr.transfer_number.toLowerCase().includes(search.toLowerCase()) ||
      tr.sender_name.toLowerCase().includes(search.toLowerCase()) ||
      tr.beneficiary_name.toLowerCase().includes(search.toLowerCase());
    const mst = filterStatus === 'all' || tr.status === filterStatus;
    return ms && mst;
  });

  const statusColors: Record<TransferStatus, string> = {
    pending: 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400',
    sent: 'bg-secondary-100 text-secondary-700 dark:bg-secondary-900/30 dark:text-secondary-400',
    delivered: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400',
    cancelled: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400',
    reversed: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400',
  };

  const statusLabels: Record<TransferStatus, { ar: string; en: string }> = {
    pending: { ar: 'معلقة', en: 'Pending' },
    sent: { ar: 'مرسلة', en: 'Sent' },
    delivered: { ar: 'مسلمة', en: 'Delivered' },
    cancelled: { ar: 'ملغاة', en: 'Cancelled' },
    reversed: { ar: 'معكوسة', en: 'Reversed' },
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
            <ArrowLeftRight className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text)]">{t('nav.exchange')}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              {lang === 'ar' ? 'الحوالات والصرافة' : 'Money transfers and exchange'}
            </p>
          </div>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          {lang === 'ar' ? 'حوالة جديدة' : 'New Transfer'}
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.search')}
            className="input-field ps-10"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as TransferStatus | 'all')}
          className="input-field !w-auto"
        >
          <option value="all">{lang === 'ar' ? 'الكل' : 'All'}</option>
          <option value="pending">{lang === 'ar' ? 'معلقة' : 'Pending'}</option>
          <option value="sent">{lang === 'ar' ? 'مرسلة' : 'Sent'}</option>
          <option value="delivered">{lang === 'ar' ? 'مسلمة' : 'Delivered'}</option>
          <option value="cancelled">{lang === 'ar' ? 'ملغاة' : 'Cancelled'}</option>
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
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'المرسل' : 'Sender'}</th>
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'المستفيد' : 'Beneficiary'}</th>
                <th className="text-end py-2 px-3 font-medium">{t('common.amount')}</th>
                <th className="text-end py-2 px-3 font-medium">{lang === 'ar' ? 'العمولة' : 'Commission'}</th>
                <th className="text-start py-2 px-3 font-medium">{t('common.status')}</th>
                <th className="text-end py-2 px-3 font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tr) => {
                const isActionLoading = actionLoadingId === tr.id;

                return (
                  <tr key={tr.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                    <td className="py-2 px-3 font-mono text-[var(--color-text)]">{tr.transfer_number}</td>
                    <td className="py-2 px-3 text-[var(--color-text)]">{tr.sender_name}</td>
                    <td className="py-2 px-3 text-[var(--color-text)]">{tr.beneficiary_name}</td>
                    <td className="py-2 px-3 text-end font-medium text-[var(--color-text)]">
                      {(Number(tr.amount) || 0).toFixed(2)} {tr.currency}
                    </td>
                    <td className="py-2 px-3 text-end text-[var(--color-text-muted)]">
                      {(Number(tr.commission) || 0).toFixed(2)} {tr.commission_currency}
                    </td>
                    <td className="py-2 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[tr.status]}`}>
                        {lang === 'ar' ? statusLabels[tr.status]?.ar : statusLabels[tr.status]?.en}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-end">
                      <div className="flex gap-1 justify-end items-center">
                        {isActionLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin text-[var(--color-text-muted)]" />
                        ) : (
                          <>
                            <button
                              onClick={() => setViewModal(tr)}
                              className="btn-secondary !p-1.5"
                              title={lang === 'ar' ? 'عرض' : 'View'}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {tr.status === 'pending' && (
                              <button
                                onClick={() => updateStatus(tr, 'sent')}
                                className="btn-secondary !p-1.5 text-secondary-600"
                                title={lang === 'ar' ? 'إرسال' : 'Send'}
                              >
                                <Send className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {tr.status === 'sent' && (
                              <button
                                onClick={() => updateStatus(tr, 'delivered')}
                                className="btn-secondary !p-1.5 text-success-600"
                                title={lang === 'ar' ? 'تسليم' : 'Deliver'}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {(tr.status === 'pending' || tr.status === 'sent') && (
                              <button
                                onClick={() => updateStatus(tr, 'cancelled')}
                                className="btn-secondary !p-1.5 text-error-500"
                                title={t('common.cancel')}
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
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

      {/* New Transfer Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={lang === 'ar' ? 'حوالة جديدة' : 'New Transfer'} size="lg">
        {error && (
          <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg px-3 py-2 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
                {lang === 'ar' ? 'اسم المرسل' : 'Sender Name'} *
              </label>
              <input
                type="text"
                value={form.sender_name}
                onChange={(e) => setForm({ ...form, sender_name: e.target.value })}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
                {lang === 'ar' ? 'هاتف المرسل' : 'Sender Phone'}
              </label>
              <input
                type="text"
                value={form.sender_phone}
                onChange={(e) => setForm({ ...form, sender_phone: e.target.value })}
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
                {lang === 'ar' ? 'اسم المستفيد' : 'Beneficiary Name'} *
              </label>
              <input
                type="text"
                value={form.beneficiary_name}
                onChange={(e) => setForm({ ...form, beneficiary_name: e.target.value })}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
                {lang === 'ar' ? 'هاتف المستفيد' : 'Beneficiary Phone'}
              </label>
              <input
                type="text"
                value={form.beneficiary_phone}
                onChange={(e) => setForm({ ...form, beneficiary_phone: e.target.value })}
                className="input-field"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{t('common.amount')} *</label>
              <input
                type="number"
                step="0.01"
                value={form.amount || ''}
                onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{t('common.currency')}</label>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="input-field">
                <option value="SAR">SAR</option>
                <option value="YER">YER</option>
                <option value="USD">USD</option>
                <option value="AED">AED</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
                {lang === 'ar' ? 'العمولة' : 'Commission'}
              </label>
              <input
                type="number"
                step="0.01"
                value={form.commission || ''}
                onChange={(e) => setForm({ ...form, commission: Number(e.target.value) })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
                {lang === 'ar' ? 'عملة العمولة' : 'Commission Currency'}
              </label>
              <select
                value={form.commission_currency}
                onChange={(e) => setForm({ ...form, commission_currency: e.target.value })}
                className="input-field"
              >
                <option value="SAR">SAR</option>
                <option value="YER">YER</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          {agents.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
                {lang === 'ar' ? 'الوكيل' : 'Agent'}
              </label>
              <select value={form.agent_id} onChange={(e) => setForm({ ...form, agent_id: e.target.value })} className="input-field">
                <option value="">{lang === 'ar' ? 'بدون' : 'None'}</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {lang === 'ar' ? a.name_ar ?? a.name : a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{t('common.date')}</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input-field" />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{t('common.notes')}</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input-field min-h-16"
              rows={2}
            />
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--color-border)]">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">
              {t('common.cancel')}
            </button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('common.save')}
            </button>
          </div>
        </div>
      </Modal>

      {/* View Transfer Modal */}
      <Modal open={!!viewModal} onClose={() => setViewModal(null)} title={viewModal?.transfer_number ?? ''} size="lg">
        {viewModal && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-[var(--color-bg)] rounded-lg">
                <p className="text-xs text-[var(--color-text-muted)] mb-1">{lang === 'ar' ? 'بيانات المرسل' : 'Sender Info'}</p>
                <p className="font-semibold text-[var(--color-text)]">{viewModal.sender_name}</p>
                {viewModal.sender_phone && <p className="text-xs text-[var(--color-text-muted)]">{viewModal.sender_phone}</p>}
              </div>

              <div className="p-3 bg-[var(--color-bg)] rounded-lg">
                <p className="text-xs text-[var(--color-text-muted)] mb-1">{lang === 'ar' ? 'بيانات المستفيد' : 'Beneficiary Info'}</p>
                <p className="font-semibold text-[var(--color-text)]">{viewModal.beneficiary_name}</p>
                {viewModal.beneficiary_phone && <p className="text-xs text-[var(--color-text-muted)]">{viewModal.beneficiary_phone}</p>}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <span className="text-[var(--color-text-muted)] block text-xs">{t('common.amount')}</span>
                <span className="font-bold text-[var(--color-text)]">{(Number(viewModal.amount) || 0).toFixed(2)} {viewModal.currency}</span>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)] block text-xs">{lang === 'ar' ? 'العمولة' : 'Commission'}</span>
                <span className="font-medium text-[var(--color-text)]">{(Number(viewModal.commission) || 0).toFixed(2)} {viewModal.commission_currency}</span>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)] block text-xs">{t('common.status')}</span>
                <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-1 ${statusColors[viewModal.status]}`}>
                  {lang === 'ar' ? statusLabels[viewModal.status]?.ar : statusLabels[viewModal.status]?.en}
                </span>
              </div>
            </div>

            {viewModal.notes && (
              <div className="text-sm pt-2 border-t border-[var(--color-border)]">
                <span className="text-[var(--color-text-muted)] block text-xs mb-1">{t('common.notes')}</span>
                <p className="text-[var(--color-text)] bg-[var(--color-bg)] p-2 rounded">{viewModal.notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
