import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n-context';
import { useAuth } from '../lib/auth-context';
import { supabase } from './supabase';
import type { ChartOfAccount, JournalEntry, JournalLine, AccountType } from './database';
import Modal from './Modal';
import {
  Calculator, Plus, Search, Pencil, Trash2, Loader2,
  AlertCircle, BookOpen, FileText, CheckCircle2, XCircle, Lock,
} from 'lucide-react';

type Tab = 'accounts' | 'journals';

export default function AccountingPage() {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('accounts');
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    const tenantId = profile?.tenant_id;
    if (!tenantId) { setLoading(false); return; }

    const [{ data: accData }, { data: jourData }] = await Promise.all([
      supabase.from('chart_of_accounts').select('*').eq('tenant_id', tenantId).order('code'),
      supabase.from('journal_entries').select('*').eq('tenant_id', tenantId).order('date', { ascending: false }),
    ]);

    setAccounts((accData as ChartOfAccount[]) ?? []);
    setJournals((jourData as JournalEntry[]) ?? []);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center">
          <Calculator className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">{t('nav.accounting')}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            {lang === 'ar' ? 'دليل الحسابات والقيود المحاسبية' : 'Chart of accounts and journal entries'}
          </p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-[var(--color-border)]">
        <button
          onClick={() => setTab('accounts')}
          className={`nav-item !rounded-lg ${tab === 'accounts' ? 'nav-item-active' : ''}`}
        >
          <BookOpen className="w-4 h-4" />
          {lang === 'ar' ? 'دليل الحسابات' : 'Chart of Accounts'}
        </button>
        <button
          onClick={() => setTab('journals')}
          className={`nav-item !rounded-lg ${tab === 'journals' ? 'nav-item-active' : ''}`}
        >
          <FileText className="w-4 h-4" />
          {lang === 'ar' ? 'القيود' : 'Journal Entries'}
        </button>
      </div>

      {tab === 'accounts' && <AccountsTab accounts={accounts} onChange={loadAll} />}
      {tab === 'journals' && <JournalsTab journals={journals} accounts={accounts} onChange={loadAll} />}
    </div>
  );
}

function AccountsTab({ accounts, onChange }: { accounts: ChartOfAccount[]; onChange: () => void }) {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ChartOfAccount | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    code: '', name: '', name_ar: '', type: 'asset' as AccountType,
    sub_type: '', is_postable: true, opening_balance: 0, opening_balance_type: 'debit' as 'debit' | 'credit',
  });

  function openCreate() {
    setEditing(null);
    setForm({ code: '', name: '', name_ar: '', type: 'asset', sub_type: '', is_postable: true, opening_balance: 0, opening_balance_type: 'debit' });
    setError('');
    setModalOpen(true);
  }

  function openEdit(acc: ChartOfAccount) {
    setEditing(acc);
    setForm({
      code: acc.code, name: acc.name, name_ar: acc.name_ar ?? '',
      type: acc.type, sub_type: acc.sub_type ?? '',
      is_postable: acc.is_postable, opening_balance: acc.opening_balance,
      opening_balance_type: acc.opening_balance_type ?? 'debit',
    });
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.code.trim() || !form.name.trim()) {
      setError(lang === 'ar' ? 'الكود والاسم مطلوبان' : 'Code and name are required');
      return;
    }
    if (!profile?.tenant_id) return;
    setSaving(true);
    setError('');

    try {
      const payload = {
        tenant_id: profile.tenant_id,
        code: form.code.trim(),
        name: form.name.trim(),
        name_ar: form.name_ar.trim() || null,
        type: form.type,
        sub_type: form.sub_type.trim() || null,
        is_postable: form.is_postable,
        opening_balance: form.opening_balance,
        opening_balance_type: form.opening_balance_type,
      };

      if (editing) {
        const { error: e } = await supabase.from('chart_of_accounts').update(payload).eq('id', editing.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from('chart_of_accounts').insert(payload);
        if (e) throw e;
      }

      setModalOpen(false);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.generic'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(acc: ChartOfAccount) {
    if (!confirm(lang === 'ar' ? 'هل أنت متأكد؟' : 'Are you sure?')) return;
    const { error } = await supabase.from('chart_of_accounts').delete().eq('id', acc.id);
    if (!error) onChange();
  }

  const filtered = accounts.filter((a) =>
    !search || a.code.includes(search) || a.name.toLowerCase().includes(search.toLowerCase()) || (a.name_ar ?? '').includes(search)
  );

  const typeLabels: Record<AccountType, { ar: string; en: string }> = {
    asset: { ar: 'أصول', en: 'Asset' },
    liability: { ar: 'خصوم', en: 'Liability' },
    equity: { ar: 'حقوق ملكية', en: 'Equity' },
    revenue: { ar: 'إيرادات', en: 'Revenue' },
    expense: { ar: 'مصروفات', en: 'Expense' },
  };

  const typeColors: Record<AccountType, string> = {
    asset: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400',
    liability: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400',
    equity: 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400',
    revenue: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400',
    expense: 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400',
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between flex-wrap gap-3">
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
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          {lang === 'ar' ? 'حساب جديد' : 'New Account'}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-12 text-[var(--color-text-muted)]">
          {t('common.no_data')}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'الكود' : 'Code'}</th>
                <th className="text-start py-2 px-3 font-medium">{t('common.name')}</th>
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'النوع' : 'Type'}</th>
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'قابل للترحيل' : 'Postable'}</th>
                <th className="text-end py-2 px-3 font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((acc) => (
                <tr key={acc.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                  <td className="py-2 px-3 font-mono text-[var(--color-text)]">{acc.code}</td>
                  <td className="py-2 px-3">
                    <div className="font-medium text-[var(--color-text)]">
                      {lang === 'ar' ? acc.name_ar ?? acc.name : acc.name}
                    </div>
                  </td>
                  <td className="py-2 px-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${typeColors[acc.type]}`}>
                      {lang === 'ar' ? typeLabels[acc.type].ar : typeLabels[acc.type].en}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    {acc.is_postable ? (
                      <CheckCircle2 className="w-4 h-4 text-success-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-[var(--color-text-muted)]" />
                    )}
                  </td>
                  <td className="py-2 px-3 text-end">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(acc)} className="btn-secondary !p-1.5">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(acc)} className="btn-secondary !p-1.5 text-error-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t('common.edit') : lang === 'ar' ? 'حساب جديد' : 'New Account'}
      >
        {error && (
          <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg px-3 py-2 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الكود' : 'Code'} *</label>
              <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="input-field font-mono" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'النوع' : 'Type'}</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })} className="input-field">
                <option value="asset">{lang === 'ar' ? 'أصول' : 'Asset'}</option>
                <option value="liability">{lang === 'ar' ? 'خصوم' : 'Liability'}</option>
                <option value="equity">{lang === 'ar' ? 'حقوق ملكية' : 'Equity'}</option>
                <option value="revenue">{lang === 'ar' ? 'إيرادات' : 'Revenue'}</option>
                <option value="expense">{lang === 'ar' ? 'مصروفات' : 'Expense'}</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{t('common.name')} *</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الاسم بالعربية' : 'Arabic Name'}</label>
            <input type="text" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} className="input-field" dir="rtl" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="postable" checked={form.is_postable} onChange={(e) => setForm({ ...form, is_postable: e.target.checked })} className="w-4 h-4" />
            <label htmlFor="postable" className="text-sm text-[var(--color-text)]">
              {lang === 'ar' ? 'قابل للترحيل' : 'Postable'}
            </label>
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
    </div>
  );
}

function JournalsTab({ journals, accounts, onChange }: { journals: JournalEntry[]; accounts: ChartOfAccount[]; onChange: () => void }) {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [lines, setLines] = useState<JournalLine[]>([]);

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    description: '',
    lines: [
      { account_id: '', debit: 0, credit: 0, description: '' },
      { account_id: '', debit: 0, credit: 0, description: '' },
    ],
  });

  async function viewLines(entry: JournalEntry) {
    setSelectedEntry(entry);
    const { data } = await supabase
      .from('journal_lines')
      .select('*')
      .eq('journal_entry_id', entry.id)
      .order('line_order');
    setLines((data as JournalLine[]) ?? []);
  }

  function openCreate() {
    setForm({
      date: new Date().toISOString().slice(0, 10),
      description: '',
      lines: [
        { account_id: '', debit: 0, credit: 0, description: '' },
        { account_id: '', debit: 0, credit: 0, description: '' },
      ],
    });
    setError('');
    setModalOpen(true);
  }

  function updateLine(idx: number, field: string, value: string | number) {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) => {
        if (i !== idx) return line;
        if (field === 'debit' && Number(value) > 0) {
          return { ...line, debit: Number(value), credit: 0 };
        }
        if (field === 'credit' && Number(value) > 0) {
          return { ...line, credit: Number(value), debit: 0 };
        }
        return { ...line, [field]: value };
      }),
    }));
  }

  function addLine() {
    setForm((prev) => ({ ...prev, lines: [...prev.lines, { account_id: '', debit: 0, credit: 0, description: '' }] }));
  }

  function removeLine(idx: number) {
    if (form.lines.length <= 2) return;
    setForm((prev) => ({ ...prev, lines: prev.lines.filter((_, i) => i !== idx) }));
  }

  const totalDebit = form.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = form.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.001 && totalDebit > 0;

  async function handleSave() {
    if (!profile?.tenant_id) return;
    if (!isBalanced) {
      setError(lang === 'ar' ? 'القيد غير متوازن - مجموع المدين يجب أن يساوي مجموع الدائن' : 'Entry not balanced — total debit must equal total credit');
      return;
    }
    const validLines = form.lines.filter(l => l.account_id && (l.debit > 0 || l.credit > 0));
    if (validLines.length < 2) {
      setError(lang === 'ar' ? 'يجب اختيار حساب وإدخال قيمة لسطرين على الأقل' : 'Each line must have an account and an amount');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const entryNumber = `JE-${Date.now().toString().slice(-8)}`;
      const { data: entry, error: entryErr } = await supabase
        .from('journal_entries')
        .insert({
          tenant_id: profile.tenant_id,
          entry_number: entryNumber,
          date: form.date,
          description: form.description.trim() || null,
          reference_type: 'manual',
          status: 'draft',
          created_by: profile.id,
        })
        .select()
        .single();

      if (entryErr) throw entryErr;
      const entryId = (entry as JournalEntry).id;

      const linePayloads = validLines.map((l, i) => ({
        journal_entry_id: entryId,
        tenant_id: profile.tenant_id,
        account_id: l.account_id,
        description: l.description || null,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        currency: 'SAR',
        exchange_rate: 1,
        line_order: i,
      }));

      const { error: linesErr } = await supabase.from('journal_lines').insert(linePayloads);
      if (linesErr) throw linesErr;

      setModalOpen(false);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.generic'));
    } finally {
      setSaving(false);
    }
  }

  async function postEntry(entry: JournalEntry) {
    if (!profile) return;
    const { data, error } = await supabase.rpc('post_journal_entry', { p_entry_id: entry.id });
    if (error) {
      alert((error as Error).message);
      return;
    }
    const result = data as { success: boolean; error?: string };
    if (!result.success) {
      alert(result.error || (lang === 'ar' ? 'فشل الترحيل' : 'Posting failed'));
      return;
    }
    onChange();
  }

  async function cancelEntry(entry: JournalEntry) {
    if (!confirm(lang === 'ar' ? 'إلغاء القيد؟' : 'Cancel entry?')) return;
    const { error } = await supabase
      .from('journal_entries')
      .update({ status: 'cancelled' })
      .eq('id', entry.id);
    if (!error) onChange();
  }

  async function reverseEntry(entry: JournalEntry) {
    const reason = prompt(lang === 'ar' ? 'سبب عكس القيد:' : 'Reversal reason:');
    if (!reason) return;
    const { data, error } = await supabase.rpc('reverse_journal_entry', {
      p_entry_id: entry.id,
      p_reason: reason,
    });
    if (error) {
      alert((error as Error).message);
      return;
    }
    const result = data as { success: boolean; error?: string };
    if (!result.success) {
      alert(result.error || (lang === 'ar' ? 'فشل العكس' : 'Reversal failed'));
      return;
    }
    onChange();
  }

  const statusIcons: Record<string, typeof CheckCircle2> = {
    draft: FileText,
    posted: CheckCircle2,
    cancelled: XCircle,
    reversed: Lock,
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          {lang === 'ar' ? 'قيد جديد' : 'New Entry'}
        </button>
      </div>

      {journals.length === 0 ? (
        <div className="card text-center py-12 text-[var(--color-text-muted)]">
          {t('common.no_data')}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'رقم' : 'Number'}</th>
                <th className="text-start py-2 px-3 font-medium">{t('common.date')}</th>
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'الوصف' : 'Description'}</th>
                <th className="text-start py-2 px-3 font-medium">{t('common.status')}</th>
                <th className="text-end py-2 px-3 font-medium">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {journals.map((entry) => {
                const StatusIcon = statusIcons[entry.status] ?? FileText;
                return (
                  <tr key={entry.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] cursor-pointer" onClick={() => viewLines(entry)}>
                    <td className="py-2 px-3 font-mono text-[var(--color-text)]">{entry.entry_number}</td>
                    <td className="py-2 px-3 text-[var(--color-text-muted)]">{entry.date}</td>
                    <td className="py-2 px-3 text-[var(--color-text)]">{entry.description ?? '—'}</td>
                    <td className="py-2 px-3">
                      <span className="flex items-center gap-1">
                        <StatusIcon className={`w-4 h-4 ${entry.status === 'posted' ? 'text-success-500' : entry.status === 'cancelled' ? 'text-error-500' : 'text-[var(--color-text-muted)]'}`} />
                        <span className="text-xs">{entry.status}</span>
                      </span>
                    </td>
                    <td className="py-2 px-3 text-end" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1 justify-end">
                        {entry.status === 'draft' && (
                          <>
                            <button onClick={() => postEntry(entry)} className="btn-secondary !p-1.5 text-success-600" title={lang === 'ar' ? 'ترحيل' : 'Post'}>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => cancelEntry(entry)} className="btn-secondary !p-1.5 text-error-500" title={t('common.cancel')}>
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {entry.status === 'posted' && (
                          <button onClick={() => reverseEntry(entry)} className="btn-secondary !p-1.5 text-accent-600" title={lang === 'ar' ? 'عكس القيد' : 'Reverse'}>
                            <Lock className="w-3.5 h-3.5" />
                          </button>
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

      {/* View lines modal */}
      <Modal open={!!selectedEntry} onClose={() => setSelectedEntry(null)} title={selectedEntry?.entry_number ?? ''} size="lg">
        {selectedEntry && (
          <div className="space-y-3">
            <div className="text-sm text-[var(--color-text-muted)]">
              {selectedEntry.date} — {selectedEntry.description}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                  <th className="text-start py-2 font-medium">{lang === 'ar' ? 'الحساب' : 'Account'}</th>
                  <th className="text-start py-2 font-medium">{lang === 'ar' ? 'الوصف' : 'Description'}</th>
                  <th className="text-end py-2 font-medium">{lang === 'ar' ? 'مدين' : 'Debit'}</th>
                  <th className="text-end py-2 font-medium">{lang === 'ar' ? 'دائن' : 'Credit'}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const acc = accounts.find((a) => a.id === line.account_id);
                  return (
                    <tr key={line.id} className="border-b border-[var(--color-border)]">
                      <td className="py-2 font-mono text-[var(--color-text)]">{acc ? `${acc.code} - ${lang === 'ar' ? acc.name_ar ?? acc.name : acc.name}` : line.account_id}</td>
                      <td className="py-2 text-[var(--color-text-muted)]">{line.description ?? '—'}</td>
                      <td className="py-2 text-end text-[var(--color-text)]">{line.debit > 0 ? line.debit.toFixed(2) : '—'}</td>
                      <td className="py-2 text-end text-[var(--color-text)]">{line.credit > 0 ? line.credit.toFixed(2) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Create journal modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={lang === 'ar' ? 'قيد جديد' : 'New Journal Entry'} size="lg">
        {error && (
          <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg px-3 py-2 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{t('common.date')}</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الوصف' : 'Description'}</label>
              <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--color-text-muted)]">{lang === 'ar' ? 'سطور القيد' : 'Entry Lines'}</span>
              <button onClick={addLine} className="btn-secondary text-sm flex items-center gap-1">
                <Plus className="w-3 h-3" />
                {lang === 'ar' ? 'سطر' : 'Line'}
              </button>
            </div>

            {form.lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <select
                  value={line.account_id}
                  onChange={(e) => updateLine(idx, 'account_id', e.target.value)}
                  className="input-field col-span-5"
                >
                  <option value="">{lang === 'ar' ? 'اختر حساب' : 'Select account'}</option>
                  {accounts.filter((a) => a.is_postable).map((a) => (
                    <option key={a.id} value={a.id}>{a.code} — {lang === 'ar' ? a.name_ar ?? a.name : a.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  placeholder={lang === 'ar' ? 'مدين' : 'Debit'}
                  value={line.debit || ''}
                  onChange={(e) => updateLine(idx, 'debit', e.target.value)}
                  className="input-field col-span-3"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder={lang === 'ar' ? 'دائن' : 'Credit'}
                  value={line.credit || ''}
                  onChange={(e) => updateLine(idx, 'credit', e.target.value)}
                  className="input-field col-span-3"
                />
                <button onClick={() => removeLine(idx)} className="btn-secondary !p-1.5 col-span-1 text-error-500">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-bg)]">
            <span className="font-medium text-[var(--color-text)]">{lang === 'ar' ? 'التوازن' : 'Balance'}</span>
            <div className="flex items-center gap-4">
              <span className="text-sm text-[var(--color-text-muted)]">
                {lang === 'ar' ? 'مدين' : 'Dr'}: <b className="text-[var(--color-text)]">{totalDebit.toFixed(2)}</b>
              </span>
              <span className="text-sm text-[var(--color-text-muted)]">
                {lang === 'ar' ? 'دائن' : 'Cr'}: <b className="text-[var(--color-text)]">{totalCredit.toFixed(2)}</b>
              </span>
              {isBalanced ? (
                <CheckCircle2 className="w-5 h-5 text-success-500" />
              ) : (
                <XCircle className="w-5 h-5 text-error-500" />
              )}
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t border-[var(--color-border)]">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">{t('common.cancel')}</button>
            <button onClick={handleSave} disabled={saving || !isBalanced} className="btn-primary flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {t('common.save')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
