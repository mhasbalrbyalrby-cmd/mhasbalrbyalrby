import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { ChartOfAccount, JournalLine } from '@/types/database';
import {
  BarChart3, Loader2, FileText, Scale, Wallet, TrendingUp, BookOpen,
} from 'lucide-react';

type ReportType = 'trial_balance' | 'income_statement' | 'balance_sheet' | 'general_ledger' | 'account_statement';

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

  interface ReportRow {
    code: string;
    name: string;
    name_ar: string | null;
    type: string;
    debit: number;
    credit: number;
    balance: number;
  }

  useEffect(() => { loadAccounts(); }, []);

  async function loadAccounts() {
    const tid = profile?.tenant_id;
    if (!tid) return;
    const { data } = await supabase.from('chart_of_accounts').select('*').eq('tenant_id', tid).order('code');
    setAccounts((data as ChartOfAccount[]) ?? []);
  }

  async function runReport() {
    const tid = profile?.tenant_id;
    if (!tid) return;
    setLoading(true);
    setReportData([]);

    try {
      let query = supabase.from('journal_lines').select(`
        debit, credit, account_id,
        journal_entries!inner(status, date)
      `).eq('tenant_id', tid).eq('journal_entries.status', 'posted');

      if (fromDate) query = query.gte('journal_entries.date', fromDate);
      if (toDate) query = query.lte('journal_entries.date', toDate);

      const { data, error } = await query;
      if (error) throw error;

      const lines = data as unknown as { debit: number; credit: number; account_id: string; journal_entries: { status: string; date: string } }[];

      if (reportType === 'general_ledger' || reportType === 'account_statement') {
        const filtered = selectedAccount ? lines.filter((l) => l.account_id === selectedAccount) : lines;
        const byAccount = new Map<string, { debit: number; credit: number }>();
        filtered.forEach((l) => {
          const cur = byAccount.get(l.account_id) ?? { debit: 0, credit: 0 };
          cur.debit += Number(l.debit) || 0;
          cur.credit += Number(l.credit) || 0;
          byAccount.set(l.account_id, cur);
        });

        const rows: ReportRow[] = [];
        byAccount.forEach((vals, accId) => {
          const acc = accounts.find((a) => a.id === accId);
          if (acc) {
            rows.push({
              code: acc.code, name: acc.name, name_ar: acc.name_ar, type: acc.type,
              debit: vals.debit, credit: vals.credit,
              balance: vals.debit - vals.credit,
            });
          }
        });
        setReportData(rows);
      } else {
        const byAccount = new Map<string, { debit: number; credit: number }>();
        lines.forEach((l) => {
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
            rows.push({
              code: acc.code, name: acc.name, name_ar: acc.name_ar, type: acc.type,
              debit: vals.debit, credit: vals.credit,
              balance: vals.debit - vals.credit,
            });
          }
        });
        rows.sort((a, b) => a.code.localeCompare(b.code));
        setReportData(rows);
      }
    } catch {
      setReportData([]);
    } finally {
      setLoading(false);
    }
  }

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
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center"><BarChart3 className="w-5 h-5 text-white" /></div>
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">{t('nav.reports')}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'تقارير مالية مبنية على القيود المرحلة' : 'Financial reports based on posted journal entries'}</p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2 border-b border-[var(--color-border)]">
        {reportTypes.map((rt) => {
          const Icon = rt.icon;
          return (
            <button key={rt.code} onClick={() => setReportType(rt.code)} className={`nav-item !rounded-lg whitespace-nowrap ${reportType === rt.code ? 'nav-item-active' : ''}`}>
              <Icon className="w-4 h-4" /><span>{rt.label}</span>
            </button>
          );
        })}
      </div>

      <div className="card flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{lang === 'ar' ? 'من تاريخ' : 'From'}</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input-field" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{lang === 'ar' ? 'إلى تاريخ' : 'To'}</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="input-field" />
        </div>
        {(reportType === 'general_ledger' || reportType === 'account_statement') && (
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{lang === 'ar' ? 'الحساب' : 'Account'}</label>
            <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} className="input-field">
              <option value="">{lang === 'ar' ? 'الكل' : 'All'}</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {lang === 'ar' ? a.name_ar ?? a.name : a.name}</option>)}
            </select>
          </div>
        )}
        <button onClick={runReport} disabled={loading} className="btn-primary flex items-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
          {lang === 'ar' ? 'تشغيل التقرير' : 'Run Report'}
        </button>
      </div>

      {reportData.length > 0 && (
        <div className="card overflow-x-auto">
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
                <td colSpan={2} className="py-2 px-3 text-end">{lang === 'ar' ? 'الإجمالي' : 'Total'}</td>
                <td className="py-2 px-3 text-end text-[var(--color-text)]">{totalDebit.toFixed(2)}</td>
                <td className="py-2 px-3 text-end text-[var(--color-text)]">{totalCredit.toFixed(2)}</td>
                <td className="py-2 px-3 text-end text-[var(--color-text)]">{(totalDebit - totalCredit).toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {reportData.length === 0 && !loading && (
        <div className="card text-center py-12 text-[var(--color-text-muted)]">
          {lang === 'ar' ? 'اختر تقريرًا واضغط تشغيل' : 'Select a report and click Run'}
        </div>
      )}
    </div>
  );
}
