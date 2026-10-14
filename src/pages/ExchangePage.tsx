import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { ExchangeTransfer, Party, TransferStatus, Currency, ExchangeRate, Shift } from '@/types/database';
import { formatDualDate } from '@/lib/hijri';
import { exportToCSV } from '@/lib/csv';
import Modal from '@/components/Modal';
import {
  ArrowLeftRight, Plus, Search, Loader2, AlertCircle,
  XCircle, Send, Check, Download,
} from 'lucide-react';

export default function ExchangePage() {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const [transfers, setTransfers] = useState<ExchangeTransfer[]>([]);
  const [agents, setAgents] = useState<Party[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<TransferStatus | 'all'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    sender_name: '', sender_phone: '', beneficiary_name: '', beneficiary_phone: '',
    amount: 0, currency: 'SAR', commission: 0, commission_currency: 'SAR',
    commission_type: 'fixed' as 'fixed' | 'percentage',
    commission_bearer: 'sender' as 'sender' | 'beneficiary',
    direction: 'outgoing' as 'outgoing' | 'incoming',
    cash_currency: 'SAR', exchange_rate: 0,
    agent_id: '', shift_id: '', date: new Date().toISOString().slice(0, 10), notes: '',
  });
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [rateForm, setRateForm] = useState({
    from_currency: 'SAR', to_currency: 'USD', rate: 0, date: new Date().toISOString().slice(0, 10),
  });
  const [rateSaving, setRateSaving] = useState(false);
  const [rateError, setRateError] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const tid = profile?.tenant_id;
    if (!tid) { setLoading(false); return; }
    const [{ data: tr }, { data: ag }, { data: c }, { data: rates }, { data: sh }] = await Promise.all([
      supabase.from('exchange_transfers').select('*').eq('tenant_id', tid).order('date', { ascending: false }),
      supabase.from('party_roles').select('party_id, role, party:parties!inner(tenant_id)').eq('role', 'agent').eq('party.tenant_id', tid),
      supabase.from('currencies').select('*').eq('tenant_id', tid).eq('is_active', true),
      supabase.from('exchange_rates').select('*').eq('tenant_id', tid).order('date', { ascending: false }).limit(50),
      supabase.from('shifts').select('*').eq('tenant_id', tid).eq('status', 'open').order('start_time', { ascending: false }),
    ]);
    setTransfers((tr as ExchangeTransfer[]) ?? []);
    const tenantCurrencies = (c as Currency[]) ?? [];
    setCurrencies(tenantCurrencies);
    setExchangeRates((rates as ExchangeRate[]) ?? []);
    setShifts((sh as Shift[]) ?? []);
    if (ag && ag.length > 0) {
      const agentIds = ag.map((a: { party_id: string }) => a.party_id);
      const { data: agentParties } = await supabase.from('parties').select('*').eq('tenant_id', tid).in('id', agentIds);
      setAgents((agentParties as Party[]) ?? []);
    } else {
      setAgents([]);
    }
    setLoading(false);
  }

  async function generateTransferNumber(tid: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const num = `TR-${Date.now().toString().slice(-8)}${attempt > 0 ? attempt : ''}`;
      const { data: existing } = await supabase
        .from('exchange_transfers')
        .select('id')
        .eq('tenant_id', tid)
        .eq('transfer_number', num)
        .maybeSingle();
      if (!existing) return num;
    }
    return `TR-${Date.now().toString().slice(-8)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function openCreate() {
    const baseCode = currencies.find((c) => c.is_base)?.code ?? 'SAR';
    setForm({ sender_name: '', sender_phone: '', beneficiary_name: '', beneficiary_phone: '', amount: 0, currency: 'USD', commission: 0, commission_currency: 'USD', commission_type: 'fixed', commission_bearer: 'sender', direction: 'outgoing', cash_currency: baseCode, exchange_rate: 0, agent_id: '', shift_id: '', date: new Date().toISOString().slice(0, 10), notes: '' });
    setError('');
    setModalOpen(true);
  }

  function getCurrentRate(from: string, to: string): number | null {
    if (from === to) return 1;
    const direct = exchangeRates.find(
      (r) => r.from_currency === from && r.to_currency === to,
    );
    if (direct) return Number(direct.rate);
    const inverse = exchangeRates.find(
      (r) => r.from_currency === to && r.to_currency === from,
    );
    if (inverse && Number(inverse.rate) !== 0) return 1 / Number(inverse.rate);
    return null;
  }

  async function handleSaveRate() {
    if (!profile?.tenant_id) return;
    if (!rateForm.from_currency || !rateForm.to_currency) {
      setRateError(lang === 'ar' ? 'العملتان مطلوبتان' : 'Both currencies required');
      return;
    }
    if (rateForm.rate <= 0) {
      setRateError(lang === 'ar' ? 'السعر يجب أن يكون أكبر من صفر' : 'Rate must be > 0');
      return;
    }
    setRateSaving(true);
    setRateError('');
    try {
      const { error: e } = await supabase.from('exchange_rates').insert({
        tenant_id: profile.tenant_id,
        from_currency: rateForm.from_currency,
        to_currency: rateForm.to_currency,
        rate: Number(rateForm.rate),
        date: rateForm.date,
        created_by: profile.id,
      });
      if (e) throw e;
      setRateModalOpen(false);
      loadData();
    } catch (err) {
      setRateError(err instanceof Error ? err.message : t('error.generic'));
    } finally {
      setRateSaving(false);
    }
  }

  const currentRate = form.exchange_rate || getCurrentRate(form.currency, form.cash_currency) || 0;
  const amountInCashCurrency = (Number(form.amount) || 0) * currentRate;
  const commissionAmount = form.commission_type === 'percentage'
    ? (Number(form.amount) || 0) * (Number(form.commission) || 0) / 100
    : Number(form.commission) || 0;
  const commissionInCash = form.commission_currency === form.cash_currency
    ? commissionAmount
    : commissionAmount * (getCurrentRate(form.commission_currency, form.cash_currency) || currentRate);
  const netAmount = form.commission_bearer === 'sender'
    ? amountInCashCurrency - commissionInCash
    : amountInCashCurrency;

  async function handleSave() {
    if (!profile?.tenant_id) return;
    if (!form.sender_name.trim() || !form.beneficiary_name.trim()) { setError(lang === 'ar' ? 'اسم المرسل والمستفيد مطلوبان' : 'Sender and beneficiary names required'); return; }
    if (form.amount <= 0) { setError(lang === 'ar' ? 'المبلغ يجب أن يكون أكبر من صفر' : 'Amount must be > 0'); return; }
    if (form.currency !== form.cash_currency && (!currentRate || currentRate <= 0)) {
      setError(lang === 'ar' ? 'سعر الصرف مطلوب ويجب أن يكون أكبر من صفر' : 'Exchange rate is required and must be > 0');
      return;
    }
    if (form.commission < 0) { setError(lang === 'ar' ? 'العمولة لا يمكن أن تكون سالبة' : 'Commission cannot be negative'); return; }
    setSaving(true); setError('');
    try {
      const num = await generateTransferNumber(profile.tenant_id);
      const rate = form.currency === form.cash_currency ? 1 : currentRate;
      const amountBase = (Number(form.amount) || 0) * rate;
      const { error: e } = await supabase.from('exchange_transfers').insert({
        tenant_id: profile.tenant_id,
        transfer_number: num,
        sender_name: form.sender_name.trim(),
        sender_phone: form.sender_phone.trim() || null,
        beneficiary_name: form.beneficiary_name.trim(),
        beneficiary_phone: form.beneficiary_phone.trim() || null,
        amount: Number(form.amount),
        currency: form.currency,
        commission: commissionAmount,
        commission_currency: form.commission_currency,
        exchange_rate: rate,
        amount_base: amountBase,
        cash_currency: form.cash_currency,
        commission_type: form.commission_type,
        commission_bearer: form.commission_bearer,
        direction: form.direction,
        agent_id: form.agent_id || null,
        shift_id: form.shift_id || null,
        date: form.date,
        status: 'pending',
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

  async function updateStatus(tr: ExchangeTransfer, status: TransferStatus) {
    const tid = profile?.tenant_id;
    if (!tid) return;
    const updates: Partial<ExchangeTransfer> = { status };
    if (status === 'delivered') updates.delivery_date = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from('exchange_transfers').update(updates).eq('id', tr.id).eq('tenant_id', tid);
    if (!error) loadData();
  }

  const filtered = transfers.filter((tr) => {
    const ms = !search || tr.transfer_number.toLowerCase().includes(search.toLowerCase()) || tr.sender_name.toLowerCase().includes(search.toLowerCase()) || tr.beneficiary_name.toLowerCase().includes(search.toLowerCase());
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

  const currencyOptions = currencies.length > 0
    ? currencies.map((c) => <option key={c.id} value={c.code}>{c.code}{c.is_base ? (lang === 'ar' ? ' (أساسية)' : ' (base)') : ''}</option>)
    : <option value="SAR">SAR</option>;

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center"><ArrowLeftRight className="w-5 h-5 text-white" /></div>
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text)]">{t('nav.exchange')}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'الحوالات والصرافة' : 'Money transfers and exchange'}</p>
          </div>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2"><Plus className="w-4 h-4" />{lang === 'ar' ? 'حوالة جديدة' : 'New Transfer'}</button>
        <button onClick={() => { exportToCSV(lang === 'ar' ? 'الحوالات' : 'transfers', lang === 'ar' ? ['رقم','مرسل','مستفيد','مبلغ','عملة','مقابل','عمولة','الصافي','الحالة'] : ['Number','Sender','Beneficiary','Amount','Currency','Base Amount','Commission','Net','Status'], transfers.map((tr) => [tr.transfer_number, tr.sender_name, tr.beneficiary_name, tr.amount.toFixed(2), tr.currency, (tr.amount_base ?? tr.amount).toFixed(2), tr.commission.toFixed(2), tr.commission_currency, tr.status])); }} disabled={transfers.length === 0} className="btn-secondary flex items-center gap-2"><Download className="w-4 h-4" />{lang === 'ar' ? 'تصدير' : 'Export'}</button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-[var(--color-text-muted)]" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('common.search')} className="input-field ps-10" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as TransferStatus | 'all')} className="input-field !w-auto">
          <option value="all">{lang === 'ar' ? 'الكل' : 'All'}</option>
          <option value="pending">{lang === 'ar' ? 'معلقة' : 'Pending'}</option>
          <option value="sent">{lang === 'ar' ? 'مرسلة' : 'Sent'}</option>
          <option value="delivered">{lang === 'ar' ? 'مسلمة' : 'Delivered'}</option>
          <option value="cancelled">{lang === 'ar' ? 'ملغاة' : 'Cancelled'}</option>
        </select>
        <button onClick={() => { setRateForm({ from_currency: 'SAR', to_currency: 'USD', rate: 0, date: new Date().toISOString().slice(0, 10) }); setRateError(''); setRateModalOpen(true); }} className="btn-secondary flex items-center gap-2">
          {lang === 'ar' ? 'أسعار الصرف' : 'Exchange Rates'}
        </button>
      </div>

      {exchangeRates.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">{lang === 'ar' ? 'أسعار الصرف الحالية' : 'Current Exchange Rates'}</h3>
          <div className="flex gap-3 flex-wrap">
            {exchangeRates.slice(0, 8).map((r) => (
              <div key={r.id} className="px-3 py-2 rounded-lg bg-[var(--color-bg)] text-sm">
                <span className="font-mono font-medium text-[var(--color-text)]">{r.from_currency} → {r.to_currency}</span>
                <span className="ms-2 text-primary-600 dark:text-primary-400 font-bold">{Number(r.rate).toFixed(4)}</span>
                <span className="ms-1 text-xs text-[var(--color-text-muted)]">{r.date}</span>
              </div>
            ))}
          </div>
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
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'المرسل' : 'Sender'}</th>
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'المستفيد' : 'Beneficiary'}</th>
                <th className="text-end py-2 px-3 font-medium">{t('common.amount')}</th>
                <th className="text-end py-2 px-3 font-medium">{lang === 'ar' ? 'العمولة' : 'Commission'}</th>
                <th className="text-start py-2 px-3 font-medium">{t('common.status')}</th>
                <th className="text-end py-2 px-3 font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tr) => (
                <tr key={tr.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                  <td className="py-2 px-3 font-mono text-[var(--color-text)]">{tr.transfer_number}</td>
                  <td className="py-2 px-3 text-[var(--color-text)]">{tr.sender_name}</td>
                  <td className="py-2 px-3 text-[var(--color-text)]">{tr.beneficiary_name}</td>
                  <td className="py-2 px-3 text-end font-medium text-[var(--color-text)]">{tr.amount.toFixed(2)} {tr.currency}{tr.exchange_rate && tr.exchange_rate !== 1 ? <div className="text-xs text-[var(--color-text-muted)]">≈ {(tr.amount_base ?? 0).toFixed(2)} {tr.cash_currency ?? ''}</div> : null}</td>
                  <td className="py-2 px-3 text-end text-[var(--color-text-muted)]">{tr.commission.toFixed(2)} {tr.commission_currency}</td>
                  <td className="py-2 px-3"><span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[tr.status]}`}>{tr.status}</span></td>
                  <td className="py-2 px-3 text-end">
                    <div className="flex gap-1 justify-end">
                      {tr.status === 'pending' && <button onClick={() => updateStatus(tr, 'sent')} className="btn-secondary !p-1.5 text-secondary-600" title={lang === 'ar' ? 'إرسال' : 'Send'}><Send className="w-3.5 h-3.5" /></button>}
                      {tr.status === 'sent' && <button onClick={() => updateStatus(tr, 'delivered')} className="btn-secondary !p-1.5 text-success-600" title={lang === 'ar' ? 'تسليم' : 'Deliver'}><Check className="w-3.5 h-3.5" /></button>}
                      {(tr.status === 'pending' || tr.status === 'sent') && <button onClick={() => updateStatus(tr, 'cancelled')} className="btn-secondary !p-1.5 text-error-500" title={t('common.cancel')}><XCircle className="w-3.5 h-3.5" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={lang === 'ar' ? 'حوالة جديدة' : 'New Transfer'} size="lg">
        {error && <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg px-3 py-2 mb-4"><AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span></div>}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الاتجاه' : 'Direction'}</label>
              <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as 'outgoing' | 'incoming' })} className="input-field">
                <option value="outgoing">{lang === 'ar' ? 'صادرة' : 'Outgoing'}</option>
                <option value="incoming">{lang === 'ar' ? 'واردة' : 'Incoming'}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'التاريخ' : 'Date'}</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input-field" />
              <p className="text-xs text-[var(--color-text-muted)] mt-1">{formatDualDate(form.date, lang)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'اسم المرسل' : 'Sender Name'} *</label>
              <input type="text" value={form.sender_name} onChange={(e) => setForm({ ...form, sender_name: e.target.value })} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'هاتف المرسل' : 'Sender Phone'}</label>
              <input type="text" value={form.sender_phone} onChange={(e) => setForm({ ...form, sender_phone: e.target.value })} className="input-field" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'اسم المستفيد' : 'Beneficiary Name'} *</label>
              <input type="text" value={form.beneficiary_name} onChange={(e) => setForm({ ...form, beneficiary_name: e.target.value })} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'هاتف المستفيد' : 'Beneficiary Phone'}</label>
              <input type="text" value={form.beneficiary_phone} onChange={(e) => setForm({ ...form, beneficiary_phone: e.target.value })} className="input-field" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'المبلغ' : 'Amount'} *</label>
              <input type="number" step="0.01" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'عملة الحوالة' : 'Transfer Currency'}</label>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="input-field">{currencyOptions}</select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'عملة الصندوق' : 'Cash Currency'}</label>
              <select value={form.cash_currency} onChange={(e) => setForm({ ...form, cash_currency: e.target.value })} className="input-field">{currencyOptions}</select>
            </div>
          </div>
          {form.currency !== form.cash_currency && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? `سعر الصرف (${form.currency} → ${form.cash_currency})` : `Rate (${form.currency} → ${form.cash_currency})`} *</label>
                <input type="number" step="0.0001" min="0.0001" value={form.exchange_rate || (getCurrentRate(form.currency, form.cash_currency) ?? '')} onChange={(e) => setForm({ ...form, exchange_rate: Number(e.target.value) })} className="input-field" />
                {currentRate > 0 && <p className="text-xs text-[var(--color-text-muted)] mt-1">{lang === 'ar' ? 'السعر المخزن:' : 'Stored rate:'} {currentRate.toFixed(4)}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'المقابل بعملة الصندوق' : 'Amount in Cash Currency'}</label>
                <div className="input-field bg-[var(--color-bg)] font-bold text-[var(--color-text)]">{amountInCashCurrency.toFixed(2)} {form.cash_currency}</div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'نوع العمولة' : 'Commission Type'}</label>
              <select value={form.commission_type} onChange={(e) => setForm({ ...form, commission_type: e.target.value as 'fixed' | 'percentage' })} className="input-field">
                <option value="fixed">{lang === 'ar' ? 'ثابتة' : 'Fixed'}</option>
                <option value="percentage">{lang === 'ar' ? 'نسبة %' : 'Percentage'}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? form.commission_type === 'percentage' ? 'النسبة %' : 'العمولة' : form.commission_type === 'percentage' ? 'Percentage %' : 'Commission'}</label>
              <input type="number" step="0.01" min="0" value={form.commission || ''} onChange={(e) => setForm({ ...form, commission: Number(e.target.value) })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'يتحمل العمولة' : 'Commission Bearer'}</label>
              <select value={form.commission_bearer} onChange={(e) => setForm({ ...form, commission_bearer: e.target.value as 'sender' | 'beneficiary' })} className="input-field">
                <option value="sender">{lang === 'ar' ? 'المرسل' : 'Sender'}</option>
                <option value="beneficiary">{lang === 'ar' ? 'المستفيد' : 'Beneficiary'}</option>
              </select>
            </div>
          </div>
          <div className="space-y-2 p-4 rounded-lg bg-[var(--color-bg)]">
            <div className="flex justify-between text-sm"><span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'المبلغ الأصلي' : 'Original Amount'}</span><span className="font-medium text-[var(--color-text)]">{(Number(form.amount) || 0).toFixed(2)} {form.currency}</span></div>
            {form.currency !== form.cash_currency && <div className="flex justify-between text-sm"><span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'المقابل بعملة الصندوق' : 'Amount in Cash Currency'}</span><span className="font-medium text-[var(--color-text)]">{amountInCashCurrency.toFixed(2)} {form.cash_currency}</span></div>}
            <div className="flex justify-between text-sm"><span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'العمولة' : 'Commission'}</span><span className="font-medium text-warning-600">{commissionAmount.toFixed(2)} {form.commission_currency}</span></div>
            <div className="flex justify-between text-sm"><span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'العمولة بعملة الصندوق' : 'Commission in Cash'}</span><span className="font-medium text-warning-600">{commissionInCash.toFixed(2)} {form.cash_currency}</span></div>
            <div className="flex justify-between pt-2 border-t border-[var(--color-border)]"><span className="font-bold text-[var(--color-text)]">{lang === 'ar' ? 'صافي المبلغ' : 'Net Amount'}</span><span className="text-lg font-bold text-primary-600">{netAmount.toFixed(2)} {form.cash_currency}</span></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {agents.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الوكيل' : 'Agent'}</label>
                <select value={form.agent_id} onChange={(e) => setForm({ ...form, agent_id: e.target.value })} className="input-field">
                  <option value="">{lang === 'ar' ? 'بدون' : 'None'}</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{lang === 'ar' ? a.name_ar ?? a.name : a.name}</option>)}
                </select>
              </div>
            )}
            {shifts.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الوردية' : 'Shift'}</label>
                <select value={form.shift_id} onChange={(e) => setForm({ ...form, shift_id: e.target.value })} className="input-field">
                  <option value="">{lang === 'ar' ? 'بدون' : 'None'}</option>
                  {shifts.map((s) => <option key={s.id} value={s.id}>{s.start_time.slice(0, 16).replace('T', ' ')}</option>)}
                </select>
              </div>
            )}
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

      <Modal open={rateModalOpen} onClose={() => setRateModalOpen(false)} title={lang === 'ar' ? 'إضافة سعر صرف' : 'Add Exchange Rate'}>
        {rateError && <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg px-3 py-2 mb-4"><AlertCircle className="w-4 h-4 shrink-0" /><span>{rateError}</span></div>}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'من عملة' : 'From Currency'}</label>
              <select value={rateForm.from_currency} onChange={(e) => setRateForm({ ...rateForm, from_currency: e.target.value })} className="input-field">
                {currencyOptions}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'إلى عملة' : 'To Currency'}</label>
              <select value={rateForm.to_currency} onChange={(e) => setRateForm({ ...rateForm, to_currency: e.target.value })} className="input-field">
                {currencyOptions}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'السعر' : 'Rate'}</label>
              <input type="number" step="0.0001" value={rateForm.rate || ''} onChange={(e) => setRateForm({ ...rateForm, rate: Number(e.target.value) })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{t('common.date')}</label>
              <input type="date" value={rateForm.date} onChange={(e) => setRateForm({ ...rateForm, date: e.target.value })} className="input-field" />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--color-border)]">
            <button onClick={() => setRateModalOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button onClick={handleSaveRate} disabled={rateSaving} className="btn-primary flex items-center gap-2">{rateSaving && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
