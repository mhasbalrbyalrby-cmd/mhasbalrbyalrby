import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Invoice, Party, InvoiceLine, InvoiceType, InvoiceStatus, Product, Warehouse, Shift } from '@/types/database';
import { exportToCSV } from '@/lib/csv';
import { formatDualDate } from '@/lib/hijri';
import Modal from '@/components/Modal';
import {
  FileText, Plus, Search, Pencil, Trash2, Loader2, AlertCircle,
  CheckCircle2, XCircle, Eye, Download,
} from 'lucide-react';

interface FormLine {
  product_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
}

interface AdditionalCostForm {
  description: string;
  amount: number;
  payment_method: 'cash' | 'credit';
  cash_account_id: string;
  party_id: string;
}

interface CashAccountOption {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  type: string;
  sub_type: string | null;
  is_active: boolean;
  is_postable: boolean;
}

export default function InvoicesPage() {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [partyRoles, setPartyRoles] = useState<Record<string, string[]>>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [currencyOptions, setCurrencyOptions] = useState<{ code: string; name: string; name_ar: string | null; tenant_id: string | null; is_base: boolean }[]>([]);
  const [exchangeRates, setExchangeRates] = useState<{ from_currency: string; to_currency: string; rate: number; date: string }[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccountOption[]>([]);
  const [baseCurrencyCode, setBaseCurrencyCode] = useState('SAR');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<InvoiceType | 'all'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [viewModal, setViewModal] = useState<Invoice | null>(null);
  const [viewLines, setViewLines] = useState<InvoiceLine[]>([]);
  const [viewCosts, setViewCosts] = useState<{ id: string; description: string; amount: number; payment_method: 'cash' | 'credit'; cash_account_id: string | null; party_id: string | null }[]>([]);
  const [invoiceSchemaReady, setInvoiceSchemaReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
    payment_method: 'credit' as 'cash' | 'credit',
    cash_account_id: '',
    tax_enabled: false,
    tax_rate: 0,
    additional_costs: [] as AdditionalCostForm[],
    lines: [{ product_id: '', description: '', quantity: 1, unit_price: 0, discount_amount: 0 }] as FormLine[],
  });

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    const tenantId = profile?.tenant_id;
    if (!tenantId) return;
    void (async () => {
      const [invoiceSchema, costSchema] = await Promise.all([
        supabase.from('invoices').select('payment_method,cash_account_id,tax_enabled,tax_rate').limit(1),
        supabase.from('invoice_additional_costs').select('id').limit(1),
      ]);
      setInvoiceSchemaReady(!invoiceSchema.error && !costSchema.error);
    })();
  }, [profile?.tenant_id]);

  useEffect(() => {
    const tenantId = profile?.tenant_id;
    if (!tenantId) return;
    void supabase.from('chart_of_accounts')
      .select('id,code,name,name_ar,type,sub_type,is_active,is_postable')
      .eq('tenant_id', tenantId).eq('type', 'asset').eq('is_active', true).eq('is_postable', true)
      .order('code')
      .then(({ data, error }) => {
        if (error) { setCashAccounts([]); return; }
        const rows = (data ?? []) as CashAccountOption[];
        // The live chart currently has 1010 (Cash) and 1020 (Bank) as separate postable assets;
        // only cash-named accounts are offered as cash drawers, never every current asset.
        setCashAccounts(rows.filter((a) => a.code === '1010' || a.sub_type === 'cash' || /cash|cashbox|cash drawer/i.test(a.name) || /نقدية|صندوق|خزينة/.test(a.name_ar ?? '')));
      });
  }, [profile?.tenant_id]);

  useEffect(() => {
    const tenantId = profile?.tenant_id;
    if (!tenantId) return;
    void supabase.from('currencies').select('code,name,name_ar,tenant_id,is_base').or(`tenant_id.eq.${tenantId},tenant_id.is.null`).eq('is_active', true).order('code').then(({ data }) => {
      const rows = (data ?? []) as { code: string; name: string; name_ar: string | null; tenant_id: string | null; is_base: boolean }[];
      const byCode = new Map<string, typeof rows[number]>();
      for (const row of rows) {
        const old = byCode.get(row.code);
        if (!old || (row.tenant_id === tenantId && old.tenant_id === null)) byCode.set(row.code, row);
      }
      setCurrencyOptions([...byCode.values()].sort((a, b) => a.code.localeCompare(b.code)));
      const base = rows.find((row) => row.tenant_id === tenantId && row.is_base)?.code;
      if (base) {
        setBaseCurrencyCode(base);
        setForm((current) => current.currency === 'SAR' ? { ...current, currency: base } : current);
      }
    });
  }, [profile?.tenant_id]);

  useEffect(() => {
    const tenantId = profile?.tenant_id;
    if (!tenantId) return;
    void supabase.from('exchange_rates').select('from_currency,to_currency,rate,date').eq('tenant_id', tenantId).order('date', { ascending: false }).limit(500).then(({ data }) => {
      setExchangeRates((data ?? []) as { from_currency: string; to_currency: string; rate: number; date: string }[]);
    });
  }, [profile?.tenant_id]);

  async function loadData() {
    setLoading(true);
    const tenantId = profile?.tenant_id;
    if (!tenantId) { setLoading(false); return; }

    const [{ data: invData }, { data: partyData }, { data: prodData }, { data: whData }, { data: shiftData }] = await Promise.all([
      supabase.from('invoices').select('*').eq('tenant_id', tenantId).order('date', { ascending: false }),
      supabase.from('parties').select('*').eq('tenant_id', tenantId),
      supabase.from('products').select('*').eq('tenant_id', tenantId).eq('is_active', true),
      supabase.from('warehouses').select('*').eq('tenant_id', tenantId).eq('is_active', true),
      supabase.from('shifts').select('*').eq('tenant_id', tenantId).eq('status', 'open').order('start_time', { ascending: false }),
    ]);

    setInvoices((invData as Invoice[]) ?? []);
    const loadedParties = (partyData as Party[]) ?? [];
    setParties(loadedParties);
    const partyIds = loadedParties.map((party) => party.id);
    if (partyIds.length > 0) {
      const { data: roleRows, error: rolesError } = await supabase
        .from('party_roles')
        .select('party_id,role')
        .in('party_id', partyIds);
      if (!rolesError && roleRows) {
        const rolesByParty: Record<string, string[]> = {};
        (roleRows as { party_id: string; role: string }[]).forEach(({ party_id, role }) => {
          (rolesByParty[party_id] ??= []).push(role);
        });
        setPartyRoles(rolesByParty);
      } else {
        setPartyRoles({});
      }
    } else {
      setPartyRoles({});
    }
    setProducts((prodData as Product[]) ?? []);
    setWarehouses((whData as Warehouse[]) ?? []);
    setShifts((shiftData as Shift[]) ?? []);
    setLoading(false);
  }

  function openCreate() {
    setForm({
      type: 'sale',
      party_id: '',
      date: new Date().toISOString().slice(0, 10),
      due_date: '',
      currency: baseCurrencyCode,
      notes: '',
      warehouse_id: '',
      shift_id: '',
      discount_amount: 0,
      payment_method: 'credit',
      cash_account_id: '',
      tax_enabled: false,
      tax_rate: 0,
      additional_costs: [],
      lines: [{ product_id: '', description: '', quantity: 1, unit_price: 0, discount_amount: 0 }],
    });
    setError('');
    setModalOpen(true);
  }

  function addLine() {
    setForm({ ...form, lines: [...form.lines, { product_id: '', description: '', quantity: 1, unit_price: 0, discount_amount: 0 }] });
  }

  function updateLine(idx: number, field: keyof FormLine, value: string | number) {
    const newLines = [...form.lines];
    (newLines[idx] as unknown as Record<string, string | number>)[field] = value;
    if (field === 'product_id' && typeof value === 'string' && value) {
      const prod = products.find((p) => p.id === value);
      if (prod) {
        newLines[idx].description = lang === 'ar' ? prod.name_ar ?? prod.name : prod.name;
        newLines[idx].unit_price = Number((form.type === 'sale' || form.type === 'return_sale' ? prod.sale_price : prod.cost_price) ?? 0);
      }
    }
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
  const taxRate = form.tax_enabled ? Math.max(0, Number(form.tax_rate) || 0) / 100 : 0;
  const taxAmount = form.tax_enabled ? afterDiscount * taxRate : 0;
  const total = afterDiscount + taxAmount;
  const additionalCostsTotal = form.type === 'purchase' ? form.additional_costs.reduce((sum, cost) => sum + Math.max(0, Number(cost.amount) || 0), 0) : 0;
  const applicableExchangeRate = form.currency === baseCurrencyCode ? null : exchangeRates
    .filter((item) => item.date <= form.date && ((item.from_currency === form.currency && item.to_currency === baseCurrencyCode) || (item.from_currency === baseCurrencyCode && item.to_currency === form.currency)))
    .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  const invoiceToBaseRate = applicableExchangeRate
    ? (applicableExchangeRate.from_currency === form.currency ? Number(applicableExchangeRate.rate) : 1 / Number(applicableExchangeRate.rate))
    : null;

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
    if (form.payment_method === 'cash' && !form.cash_account_id) {
      setError(lang === 'ar' ? 'اختر حساب الصندوق للفاتورة النقدية' : 'Select a cash account for this cash invoice');
      return;
    }
    if (form.tax_enabled && (!Number.isFinite(Number(form.tax_rate)) || Number(form.tax_rate) < 0 || Number(form.tax_rate) > 100)) {
      setError(lang === 'ar' ? 'أدخل نسبة ضريبة بين 0 و100' : 'Enter a tax rate between 0 and 100');
      return;
    }
    if (form.type === 'purchase' && form.additional_costs.some((c) => !c.description.trim() || !(Number(c.amount) > 0) || (c.payment_method === 'cash' ? !c.cash_account_id : !c.party_id))) {
      setError(lang === 'ar' ? 'أكمل وصف ومبلغ وطريقة سداد وحساب كل تكلفة إضافية' : 'Complete each additional cost description, amount, payment method, and account/party');
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
          payment_method: form.payment_method,
          cash_account_id: form.payment_method === 'cash' ? form.cash_account_id : null,
          tax_enabled: form.tax_enabled,
          tax_rate: form.tax_enabled ? Number(form.tax_rate) : 0,
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
        description: l.description || null,
        quantity: Number(l.quantity) || 1,
        unit_price: Number(l.unit_price) || 0,
        discount_amount: Number(l.discount_amount) || 0,
        line_total: (Number(l.quantity) || 1) * (Number(l.unit_price) || 0) - (Number(l.discount_amount) || 0),
        line_order: i,
      }));

      const { error: linesErr } = await supabase.from('invoice_lines').insert(linePayloads);
      if (linesErr) throw linesErr;

      if (form.type === 'purchase' && form.additional_costs.length > 0) {
        const costsPayload = form.additional_costs.map((cost, index) => ({
          tenant_id: profile.tenant_id,
          invoice_id: invId,
          description: cost.description.trim(),
          amount: Number(cost.amount),
          payment_method: cost.payment_method,
          cash_account_id: cost.payment_method === 'cash' ? cost.cash_account_id : null,
          party_id: cost.payment_method === 'credit' ? cost.party_id : null,
          line_order: index,
          created_by: profile.id,
        }));
        const { error: costsErr } = await supabase.from('invoice_additional_costs').insert(costsPayload);
        if (costsErr) {
          await supabase.from('invoice_lines').delete().eq('invoice_id', invId);
          await supabase.from('invoices').delete().eq('id', invId);
          throw costsErr;
        }
      }

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
    const [{ data: lines }, { data: costs }] = await Promise.all([
      supabase.from('invoice_lines').select('*').eq('invoice_id', inv.id).order('line_order'),
      supabase.from('invoice_additional_costs').select('id,description,amount,payment_method,cash_account_id,party_id').eq('invoice_id', inv.id).order('line_order'),
    ]);
    setViewLines((lines as InvoiceLine[]) ?? []);
    setViewCosts((costs as typeof viewCosts) ?? []);
  }

  const filtered = invoices.filter((inv) => {
    const matchSearch = !search || inv.invoice_number.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || inv.type === filterType;
    return matchSearch && matchType;
  });

  const requiredPartyRole = form.type === 'sale' || form.type === 'return_sale' ? 'customer' : 'supplier';
  const eligibleParties = parties.filter((party) => (partyRoles[party.id] ?? []).includes(requiredPartyRole));

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
        {!invoiceSchemaReady && <div className="mb-4 rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">{lang === 'ar' ? 'معاينة الواجهة فقط: ملفات Migration موجودة على الفرع لكنها لم تُطبّق على قاعدة البيانات المرتبطة. الحفظ معطّل لحماية البيانات حتى اعتماد المخطط وتطبيقه في بيئة اختبار.' : 'UI preview only: migrations are committed to this branch but are not applied to the connected database. Saving is disabled to protect data until the schema is applied in a test environment.'}</div>}
        {error && (
          <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg px-3 py-2 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span>
          </div>
        )}
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'النوع' : 'Type'}</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as InvoiceType, party_id: '' })} className="input-field">
                <option value="sale">{lang === 'ar' ? 'مبيعات' : 'Sale'}</option>
                <option value="purchase">{lang === 'ar' ? 'مشتريات' : 'Purchase'}</option>
                <option value="return_sale">{lang === 'ar' ? 'مرتجع مبيعات' : 'Return Sale'}</option>
                <option value="return_purchase">{lang === 'ar' ? 'مرتجع مشتريات' : 'Return Purchase'}</option>
              </select>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">{lang === 'ar' ? 'اختر نوع المستند أولاً؛ مرتجع المبيعات يتبع العملاء ومرتجع المشتريات يتبع الموردين.' : 'Choose the document type first; sales returns use customers and purchase returns use suppliers.'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? (requiredPartyRole === 'customer' ? 'العميل' : 'المورد') : (requiredPartyRole === 'customer' ? 'Customer' : 'Supplier')} *</label>
              <select value={form.party_id} onChange={(e) => setForm({ ...form, party_id: e.target.value })} className="input-field">
                <option value="">{lang === 'ar' ? (requiredPartyRole === 'customer' ? 'اختر العميل' : 'اختر المورد') : (requiredPartyRole === 'customer' ? 'Select customer' : 'Select supplier')}</option>
                {eligibleParties.map((p) => <option key={p.id} value={p.id}>{lang === 'ar' ? p.name_ar ?? p.name : p.name}</option>)}
              </select>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">{lang === 'ar' ? (requiredPartyRole === 'customer' ? 'تظهر هنا الجهات المسجلة بدور عميل فقط.' : 'تظهر هنا الجهات المسجلة بدور مورد فقط.') : (requiredPartyRole === 'customer' ? 'Only contacts registered with the customer role appear here.' : 'Only contacts registered with the supplier role appear here.')}</p>
              {eligibleParties.length === 0 && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{lang === 'ar' ? (requiredPartyRole === 'customer' ? 'لا يوجد عميل مسجل. أضف جهة اتصال وفعّل دور العميل أولاً.' : 'لا يوجد مورد مسجل. أضف جهة اتصال وفعّل دور المورد أولاً.') : (requiredPartyRole === 'customer' ? 'No customer is registered. Add a contact and enable the customer role first.' : 'No supplier is registered. Add a contact and enable the supplier role first.')}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{t('common.date')}</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'}</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="input-field" />
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">{lang === 'ar' ? 'اختياري؛ يترك فارغًا عند عدم وجود أجل محدد.' : 'Optional; leave blank when no due date is set.'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'طريقة الدفع' : 'Payment method'}</label>
              <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value as 'cash' | 'credit' })} className="input-field">
                <option value="credit">{lang === 'ar' ? 'آجل — ذمم الجهة' : 'Credit — party receivable/payable'}</option>
                <option value="cash">{lang === 'ar' ? 'نقدي — صندوق' : 'Cash — cash account'}</option>
              </select>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">{lang === 'ar' ? 'اختر آجلًا لإثبات ذمة على العميل أو المورد، أو نقديًا إذا تم السداد/القبض من الصندوق الآن.' : 'Choose credit to record a receivable/payable, or cash when payment/collection happens from the cash account now.'}</p>
            </div>
            {form.payment_method === 'cash' && <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'حساب الصندوق' : 'Cash account'}</label>
              <select value={form.cash_account_id} onChange={(e) => setForm({ ...form, cash_account_id: e.target.value })} className="input-field">
                <option value="">{lang === 'ar' ? 'اختر حساب الصندوق' : 'Select cash account'}</option>
                {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {lang === 'ar' ? a.name_ar ?? a.name : a.name}</option>)}
              </select>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">{lang === 'ar' ? 'اختر الصندوق الذي استلم أو دفع المبلغ فعليًا.' : 'Choose the cash account that actually received or paid the amount.'}</p>
              {cashAccounts.length === 0 && <p className="mt-1 text-xs text-error-600">{lang === 'ar' ? 'لا يوجد حساب صندوق نشط وقابل للترحيل في دليل الحسابات.' : 'No active postable cash account was found in the chart of accounts.'}</p>}
            </div>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'عملة الفاتورة' : 'Invoice currency'}</label>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="input-field">
                {(currencyOptions.length ? currencyOptions : [
                  { code: 'SAR', name: 'Saudi Riyal', name_ar: 'ريال سعودي', tenant_id: null, is_base: false },
                  { code: 'YER', name: 'Yemeni Rial', name_ar: 'ريال يمني', tenant_id: null, is_base: false },
                  { code: 'USD', name: 'US Dollar', name_ar: 'دولار أمريكي', tenant_id: null, is_base: false },
                  { code: 'AED', name: 'UAE Dirham', name_ar: 'درهم إماراتي', tenant_id: null, is_base: false },
                  { code: 'EGP', name: 'Egyptian Pound', name_ar: 'جنيه مصري', tenant_id: null, is_base: false },
                ]).map((currency) => <option key={currency.code} value={currency.code}>{currency.code} — {lang === 'ar' ? currency.name_ar ?? currency.name : currency.name}</option>)}
              </select>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">{lang === 'ar' ? 'تُحفظ عملة الفاتورة مع الفاتورة. راجع تبويب العملات وأسعار الصرف لإدارة الأسعار.' : 'The invoice currency is saved with the invoice. Manage rates in Settings → Currencies.'}</p>
              {form.currency !== baseCurrencyCode && (
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {invoiceToBaseRate !== null && Number.isFinite(invoiceToBaseRate)
                    ? (lang === 'ar' ? 'سعر إرشادي بتاريخ ' + (applicableExchangeRate?.date ?? '') + ': 1 ' + form.currency + ' = ' + invoiceToBaseRate.toLocaleString(undefined, { maximumFractionDigits: 8 }) + ' ' + baseCurrencyCode : 'Indicative rate on ' + (applicableExchangeRate?.date ?? '') + ': 1 ' + form.currency + ' = ' + invoiceToBaseRate.toLocaleString(undefined, { maximumFractionDigits: 8 }) + ' ' + baseCurrencyCode)
                    : (lang === 'ar' ? 'لا يوجد سعر صرف مسجل لهذه العملة بتاريخ الفاتورة أو قبله.' : 'No exchange rate is recorded for this currency on or before the invoice date.')}
                  <span className="block">{lang === 'ar' ? 'تنبيه: سعر العرض لا يُحفظ كسعر تاريخي داخل الفاتورة؛ الفاتورة تحفظ رمز العملة فقط.' : 'Note: this rate is informational only and is not saved historically on the invoice; only the currency code is stored.'}</span>
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'المخزن' : 'Warehouse'}</label>
              <select value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })} className="input-field">
                <option value="">{lang === 'ar' ? 'بدون' : 'None'}</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{lang === 'ar' ? w.name_ar ?? w.name : w.name}</option>)}
              </select>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">{lang === 'ar' ? 'اختر المخزن الذي ستُسجل عليه حركة البضاعة، أو اتركه فارغًا إذا لم ينطبق.' : 'Choose the warehouse for stock activity, or leave blank if not applicable.'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الوردية' : 'Shift'}</label>
              <select value={form.shift_id} onChange={(e) => setForm({ ...form, shift_id: e.target.value })} className="input-field">
                <option value="">{lang === 'ar' ? 'بدون' : 'None'}</option>
                {shifts.map((s) => <option key={s.id} value={s.id}>{s.start_time.slice(0, 16).replace('T', ' ')}</option>)}
              </select>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">{lang === 'ar' ? 'اربط الفاتورة بالوردية المفتوحة عند تنفيذها ضمن وردية؛ وإلا اتركه فارغًا.' : 'Link the invoice to the open shift if it belongs to one; otherwise leave blank.'}</p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs text-[var(--color-text-muted)]">{lang === 'ar' ? 'اختر منتجًا أو خدمة لملء الوصف والسعر تلقائيًا، أو اختر الإدخال اليدوي واكتب التفاصيل بنفسك.' : 'Choose a product or service to fill description and price, or use manual entry and type the details yourself.'}</p>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[var(--color-text-muted)]">{lang === 'ar' ? 'سطور الفاتورة' : 'Invoice Lines'}</span>
              <button onClick={addLine} className="btn-secondary text-sm flex items-center gap-1"><Plus className="w-3 h-3" />{lang === 'ar' ? 'سطر' : 'Line'}</button>
            </div>
            {form.lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center mb-2">
                <select
                  value={line.product_id}
                  onChange={(e) => updateLine(idx, 'product_id', e.target.value)}
                  className="input-field col-span-3 !text-xs"
                >
                  <option value="">{lang === 'ar' ? 'منتج/خدمة/يدوي' : 'Product/Service/Manual'}</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{lang === 'ar' ? p.name_ar ?? p.name : p.name}{p.type === 'service' ? (lang === 'ar' ? ' (خدمة)' : ' (service)') : ''}</option>)}
                </select>
                <input type="text" placeholder={lang === 'ar' ? 'الوصف' : 'Description'} value={line.description} onChange={(e) => updateLine(idx, 'description', e.target.value)} className="input-field col-span-3" />
                <input type="number" step="0.01" placeholder={lang === 'ar' ? 'كمية' : 'Qty'} value={line.quantity || ''} onChange={(e) => updateLine(idx, 'quantity', e.target.value)} className="input-field col-span-1" />
                <input type="number" step="0.01" placeholder={lang === 'ar' ? 'سعر' : 'Price'} value={line.unit_price || ''} onChange={(e) => updateLine(idx, 'unit_price', e.target.value)} className="input-field col-span-2" />
                <input type="number" step="0.01" placeholder={lang === 'ar' ? 'خصم' : 'Disc'} value={line.discount_amount || ''} onChange={(e) => updateLine(idx, 'discount_amount', e.target.value)} className="input-field col-span-1" />
                <div className="col-span-1 text-end text-sm text-[var(--color-text-muted)]">{lineTotals[idx]?.toFixed(2)}</div>
                <button onClick={() => removeLine(idx)} className="btn-secondary !p-1.5 col-span-1 text-error-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
          <p className="text-xs text-[var(--color-text-muted)] -mt-2">{lang === 'ar' ? 'ملاحظة: الخدمات لا تؤثر على المخزون ولا تنشئ تكلفة بيع مخزنية. إيرادات الخدمات ترتبط بالحساب المناسب وفق إعدادات المؤسسة.' : 'Note: Services do not affect inventory or create stock COGS. Service revenue links to the appropriate account per settings.'}</p>

          {form.type === 'purchase' && <div className="space-y-3 rounded-lg border border-[var(--color-border)] p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-[var(--color-text)]">{lang === 'ar' ? 'تكاليف الشراء الإضافية' : 'Additional purchase costs'}</h3>
              <button type="button" onClick={() => setForm({ ...form, additional_costs: [...form.additional_costs, { description: '', amount: 0, payment_method: 'cash', cash_account_id: '', party_id: '' }] })} className="btn-secondary text-sm flex items-center gap-1"><Plus className="w-3 h-3" />{lang === 'ar' ? 'إضافة تكلفة' : 'Add cost'}</button>
            </div>
            {form.additional_costs.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'لا توجد تكاليف إضافية.' : 'No additional costs.'}</p>}
            {form.additional_costs.map((cost, index) => <div key={index} className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-md bg-[var(--color-bg)] p-2">
              <input aria-label={lang === 'ar' ? 'وصف التكلفة' : 'Cost description'} value={cost.description} onChange={(e) => setForm({ ...form, additional_costs: form.additional_costs.map((c, i) => i === index ? { ...c, description: e.target.value } : c) })} placeholder={lang === 'ar' ? 'الوصف (نقل، تحميل...)' : 'Description (freight, loading...)'} className="input-field" />
              <input aria-label={lang === 'ar' ? 'مبلغ التكلفة' : 'Cost amount'} type="number" min="0.01" step="0.01" value={cost.amount || ''} onChange={(e) => setForm({ ...form, additional_costs: form.additional_costs.map((c, i) => i === index ? { ...c, amount: Number(e.target.value) } : c) })} placeholder={lang === 'ar' ? 'المبلغ' : 'Amount'} className="input-field" />
              <select aria-label={lang === 'ar' ? 'طريقة سداد التكلفة' : 'Cost payment method'} value={cost.payment_method} onChange={(e) => setForm({ ...form, additional_costs: form.additional_costs.map((c, i) => i === index ? { ...c, payment_method: e.target.value as 'cash' | 'credit', cash_account_id: '', party_id: '' } : c) })} className="input-field">
                <option value="cash">{lang === 'ar' ? 'نقداً من صندوق' : 'Cash from cash account'}</option><option value="credit">{lang === 'ar' ? 'آجل — على ذمة جهة' : 'Credit — payable to party'}</option>
              </select>
              {cost.payment_method === 'cash' ? <select aria-label={lang === 'ar' ? 'صندوق سداد التكلفة' : 'Cost cash account'} value={cost.cash_account_id} onChange={(e) => setForm({ ...form, additional_costs: form.additional_costs.map((c, i) => i === index ? { ...c, cash_account_id: e.target.value } : c) })} className="input-field">
                <option value="">{lang === 'ar' ? 'اختر الصندوق' : 'Select cash account'}</option>{cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {lang === 'ar' ? a.name_ar ?? a.name : a.name}</option>)}
              </select> : <select aria-label={lang === 'ar' ? 'الجهة صاحبة الذمة' : 'Creditor party'} value={cost.party_id} onChange={(e) => setForm({ ...form, additional_costs: form.additional_costs.map((c, i) => i === index ? { ...c, party_id: e.target.value } : c) })} className="input-field">
                <option value="">{lang === 'ar' ? 'اختر الجهة' : 'Select party'}</option>{parties.map((p) => <option key={p.id} value={p.id}>{lang === 'ar' ? p.name_ar ?? p.name : p.name}</option>)}
              </select>}
              <button type="button" onClick={() => setForm({ ...form, additional_costs: form.additional_costs.filter((_, i) => i !== index) })} className="btn-secondary text-error-500 justify-self-start">{lang === 'ar' ? 'حذف التكلفة' : 'Remove cost'}</button>
            </div>)}
            <div className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'تُرسمل هذه التكاليف على المخزون عند الترحيل، وتُوزّع على سطور المنتجات بحسب قيمتها.' : 'These costs are capitalized into inventory at posting and allocated across product lines by value.'}</div>
          </div>}

          <div className="space-y-1 p-3 rounded-lg bg-[var(--color-bg)]">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'المجموع الفرعي' : 'Subtotal'}</span>
              <span className="text-[var(--color-text)]">{subtotal.toFixed(2)} {form.currency}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-text-muted)]">{lang === 'ar' ? (form.type === 'sale' || form.type === 'return_sale' ? 'الخصم المسموح به (مبيعات)' : 'الخصم المكتسب (مشتريات)') : (form.type === 'sale' || form.type === 'return_sale' ? 'Discount Allowed (Sales)' : 'Discount Earned (Purchases)')}</span>
              <input type="number" step="0.01" value={form.discount_amount || ''} onChange={(e) => setForm({ ...form, discount_amount: Number(e.target.value) })} className="input-field !w-32 !py-1 text-end" />
            </div>
            <div className="space-y-2 border-t border-[var(--color-border)] pt-2">
              <label className="flex items-center gap-2 text-sm text-[var(--color-text)]"><input type="checkbox" checked={form.tax_enabled} onChange={(e) => setForm({ ...form, tax_enabled: e.target.checked })} />{lang === 'ar' ? 'تفعيل ضريبة القيمة المضافة' : 'Enable VAT'}</label>
              {form.tax_enabled && <div className="flex items-center justify-between gap-3 text-sm"><label className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'النسبة %' : 'Tax rate %'}</label><input type="number" min="0" max="100" step="0.01" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: Number(e.target.value) })} className="input-field !w-28 !py-1 text-end" /><span className="text-[var(--color-text)]">{taxAmount.toFixed(2)} {form.currency}</span></div>}
            </div>
            {form.type === 'purchase' && additionalCostsTotal > 0 && <div className="flex items-center justify-between text-sm"><span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'تكاليف إضافية (ترسمل على المخزون)' : 'Additional costs (capitalized to inventory)'}</span><span className="text-[var(--color-text)]">{additionalCostsTotal.toFixed(2)} {form.currency}</span></div>}
            <div className="flex items-center justify-between pt-1 border-t border-[var(--color-border)]">
              <span className="font-medium text-[var(--color-text)]">{lang === 'ar' ? 'الإجمالي' : 'Total'}</span>
              <span className="text-lg font-bold text-[var(--color-text)]">{total.toFixed(2)} {form.currency}</span>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--color-border)]">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button onClick={handleSave} disabled={saving || !invoiceSchemaReady} className="btn-primary flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}
            </button>
          </div>
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
              <div><span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'طريقة الدفع' : 'Payment'}: </span><span className="font-medium text-[var(--color-text)]">{(viewModal as Invoice & { payment_method?: 'cash' | 'credit' }).payment_method === 'cash' ? (lang === 'ar' ? 'نقدي' : 'Cash') : (lang === 'ar' ? 'آجل' : 'Credit')}</span></div>
              {viewModal.discount_amount > 0 && <div><span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'الخصم' : 'Discount'}: </span><span className="font-medium text-[var(--color-text)]">{viewModal.discount_amount.toFixed(2)}</span></div>}
            </div>
            {viewCosts.length > 0 && <div className="rounded-lg border border-[var(--color-border)] p-3"><h3 className="mb-2 font-semibold text-[var(--color-text)]">{lang === 'ar' ? 'التكاليف الإضافية' : 'Additional costs'}</h3>{viewCosts.map((cost) => <div key={cost.id} className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] py-1 text-sm"><span>{cost.description} · {cost.payment_method === 'cash' ? (lang === 'ar' ? 'نقداً' : 'Cash') : (lang === 'ar' ? 'آجل' : 'Credit')}</span><span>{Number(cost.amount).toFixed(2)} {viewModal.currency}</span></div>)}</div>}
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
