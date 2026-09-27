import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { ChartOfAccount } from '@/types/database';
import {
  BarChart3, Loader2, FileText, Scale, Wallet, TrendingUp, BookOpen, Printer, AlertCircle,
} from 'lucide-react';

type ReportType = 'trial_balance' | 'income_statement' | 'balance_sheet' | 'general_ledger' | 'account_statement';

interface ReportRow {
  code: string;
  name: string;
  name_ar: string | null;
  type: string;
  debit: number;
  credit: number;
  balance: number;
}

export default function ReportsPage() {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const [reportType, setReportType] = useState<ReportType>('trial_balance');
  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    const tid = profile?.tenant_id;
    if (!tid) return;
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .eq('tenant_id', tid)
      .order('code');
    setAccounts((data as ChartOfAccount[]) ?? []);
  }

  async function runReport() {
    const tid = profile?.tenant_id;
    if (!tid) return;

    setLoading(true);
    setReportData([]);
    setErrorMessage('');

    try {
      let query = supabase.from('journal_lines').select(`
        debit, credit, account_id,
        journal_entries!inner(status, date)
      `).eq('tenant_id', tid).eq('journal_entries.status', 'posted');

      if (fromDate) query = query.gte('journal_entries.date', fromDate);
      if (toDate) query = query.lte('journal_entries.date', toDate);

      const { data, error } = await query;
      if (error) throw error;

      const lines = (data as unknown as { debit: number; credit: number; account_id: string; journal_entries: { status: string; date: string } }[]) || [];

      const byAccount = new Map<string, { debit: number; credit: number }>();

      const filteredLines = (reportType === 'general_ledger' || reportType === 'account_statement') && selectedAccount
        ? lines.filter((l) => l.account_id === selectedAccount)
        : lines;

      filteredLines.forEach((l) => {
        const cur = byAccount.get(l.account_id) ?? { debit: 0, credit: 0 };
        cur.debit += Number(l.debit) || 0;
        cur.credit += Number(l.credit) || 0;
        byAccount.set(l.account_id, cur);
      });

      const rows: ReportRow[] = [];
      byAccount.forEach((vals, accId) => {
        const acc = accounts.find((a) => a.id === accId);
        if (acc) {
          if (reportType === 'income_statement' && !['revenue', 'expense'].includes(acc.type)) return;
          if (reportType === 'balance_sheet' && !['asset', 'liability', 'equity'].includes(acc.type)) return;

          // احتساب طبيعة الرصيد المحاسبي
          const isCreditNature = ['liability', 'equity', 'revenue'].includes(acc.type);
          const balance = isCreditNature ? vals.credit - vals.debit : vals.debit - vals.credit;

          rows.push({
            code: acc.code,
            name: acc.name,
            name_ar: acc.name_ar,
            type: acc.type,
            debit: vals.debit,
            credit: vals.credit,
            balance,
          });
        }
      });

      rows.sort((a, b) => a.code.localeCompare(b.code));
      setReportData(rows);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('error.generic'));
      setReportData([]);
    } finally {
      setLoading(false);
    }
  }

  const handlePrint = () => {
    window.print();
  };

  const reportTypes: { code: ReportType; icon: typeof Scale; label: string }[] = [
    { code: 'trial_balance', icon: Scale, label: lang === 'ar' ? 'ميزان المراجعة' : 'Trial Balance' },
    { code: 'income_statement', icon: TrendingUp, label: lang === 'ar' ? 'قائمة الدخل' : 'Income Statement' },
    { code: 'balance_sheet', icon: Wallet, label: lang === 'ar' ? 'المركز المالي' : 'Balance Sheet' },
    { code: 'general_ledger', icon: BookOpen, label: lang === 'ar' ? 'الأستاذ العام' : 'General Ledger' },
    { code: 'account_statement', icon: FileText, label: lang === 'ar' ? 'كشف حساب' : 'Account Statement' },
  ];

  const totalDebit = reportData.reduce((s, r) => s + r.debit, 0);
  const totalCredit = reportData.reduce((s, r) => s + r.credit, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text)]">{t('nav.reports')}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              {lang === 'ar' ? 'تقارير مالية مبنية على القيود المرحلة' : 'Financial reports based on posted journal entries'}
            </p>
          </div>
        </div>

        {reportData.length > 0 && (
          <button onClick={handlePrint} className="btn-secondary flex items-center gap-2">
            <Printer className="w-4 h-4" />
            {lang === 'ar' ? 'طباعة التقرير' : 'Print Report'}
          </button>
        )}
      </div>

      {/* Report Selection Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 border-b border-[var(--color-border)] print:hidden">
        {reportTypes.map((rt) => {
          const Icon = rt.icon;
          return (
            <button
              key={rt.code}
              onClick={() => {
                setReportType(rt.code);
                setReportData([]);
              }}
              className={`nav-item !rounded-lg whitespace-nowrap ${reportType === rt.code ? 'nav-item-active' : ''}`}
            >
              <Icon className="w-4 h-4" />
              <span>{rt.label}</span>
            </button>
          );
        })}
      </div>

      {/* Filters Form */}
      <div className="card flex flex-wrap gap-3 items-end print:hidden">
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
            {lang === 'ar' ? 'من تاريخ' : 'From Date'}
          </label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input-field" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
            {lang === 'ar' ? 'إلى تاريخ' : 'To Date'}
          </label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="input-field" />
        </div>

        {(reportType === 'general_ledger' || reportType === 'account_statement') && (
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
              {lang === 'ar' ? 'الحساب' : 'Account'}
            </label>
            <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} className="input-field min-w-[200px]">
              <option value="">{lang === 'ar' ? 'الكل' : 'All Accounts'}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {lang === 'ar' ? a.name_ar ?? a.name : a.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <button onClick={runReport} disabled={loading} className="btn-primary flex items-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
          {lang === 'ar' ? 'تشغيل التقرير' : 'Run Report'}
        </button>
      </div>

      {/* Error View */}
      {errorMessage && (
        <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg p-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Printable Title Header */}
      <div className="hidden print:block mb-4 text-center">
        <h1 className="text-xl font-bold">{reportTypes.find((r) => r.code === reportType)?.label}</h1>
        {(fromDate || toDate) && (
          <p className="text-sm text-gray-500">
            {fromDate && `${lang === 'ar' ? 'من' : 'From'}: ${fromDate}`} {toDate && `${lang === 'ar' ? 'إلى' : 'To'}: ${toDate}`}
          </p>
        )}
      </div>

      {/* Report Table */}
      {reportData.length > 0 && (
        <div className="card overflow-x-auto print:shadow-none print:border-none">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'الكود' : 'Code'}</th>
                <th className="text-start py-2 px-3 font-medium">{t('common.name')}</th>
                <th className="text-end py-2 px-3 font-medium">{lang === 'ar' ? 'مدين' : 'Debit'}</th>
                <th className="text-end py-2 px-3 font-medium">{lang === 'ar' ? 'دائن' : 'Credit'}</th>
                <th className="text-end py-2 px-3 font-medium">{lang === 'ar' ? 'الرصيد' : 'Balance'}</th>
              </tr>
            </thead>
            <tbody>
              {reportData.map((row, i) => (
                <tr key={i} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                  <td className="py-2 px-3 font-mono text-[var(--color-text)]">{row.code}</td>
                  <td className="py-2 px-3 text-[var(--color-text)]">{lang === 'ar' ? row.name_ar ?? row.name : row.name}</td>
                  <td className="py-2 px-3 text-end text-[var(--color-text)]">{row.debit > 0 ? row.debit.toFixed(2) : '—'}</td>
                  <td className="py-2 px-3 text-end text-[var(--color-text)]">{row.credit > 0 ? row.credit.toFixed(2) : '—'}</td>
                  <td className="py-2 px-3 text-end font-medium text-[var(--color-text)]">{row.balance.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--color-border)] font-bold">
                <td colSpan={2} className="py-2 px-3 text-end">
                  {lang === 'ar' ? 'الإجمالي' : 'Total'}
                </td>
                <td className="py-2 px-3 text-end text-[var(--color-text)]">{totalDebit.toFixed(2)}</td>
                <td className="py-2 px-3 text-end text-[var(--color-text)]">{totalCredit.toFixed(2)}</td>
                <td className="py-2 px-3 text-end text-[var(--color-text)]">{(totalDebit - totalCredit).toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Empty State */}
      {reportData.length === 0 && !loading && !errorMessage && (
        <div className="card text-center py-12 text-[var(--color-text-muted)]">
          {lang === 'ar' ? 'اختر خيارات التقرير المطلوبة واضغط تشغيل التقرير' : 'Select report criteria and click Run Report'}
        </div>
      )}
    </div>
  );
}
