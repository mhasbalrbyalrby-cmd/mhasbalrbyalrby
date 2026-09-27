import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { BiometricLog } from '@/types/database';
import {
  Fingerprint,
  RefreshCw,
  Search,
  LogIn,
  LogOut,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  SlidersHorizontal,
} from 'lucide-react';

export default function BiometricCenter() {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const [logs, setLogs] = useState<BiometricLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [error, setError] = useState('');

  useEffect(() => {
    loadLogs();
  }, []);

  async function loadLogs() {
    setLoading(true);
    setError('');
    const tenantId = profile?.tenant_id;
    if (!tenantId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchErr } = await supabase
        .from('biometric_logs')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('timestamp', { ascending: false });

      if (fetchErr) throw fetchErr;
      setLogs((data as BiometricLog[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.generic'));
    } finally {
      setLoading(false);
    }
  }

  async function syncDevices() {
    setSyncing(true);
    try {
      // هنا يمكنك استدعاء Edge Function أو API المزامنة الخاصة بالأجهزة
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await loadLogs();
    } finally {
      setSyncing(false);
    }
  }

  const punchTypeLabels: Record<BiometricLog['punch_type'], { ar: string; en: string; icon: typeof LogIn; color: string }> = {
    check_in: { ar: 'تسجيل دخول', en: 'Check In', icon: LogIn, color: 'text-success-600 bg-success-50 dark:bg-success-900/30' },
    check_out: { ar: 'تسجيل خروج', en: 'Check Out', icon: LogOut, color: 'text-error-600 bg-error-50 dark:bg-error-900/30' },
    shift_start: { ar: 'بداية وردية', en: 'Shift Start', icon: Clock, color: 'text-primary-600 bg-primary-50 dark:bg-primary-900/30' },
    shift_end: { ar: 'نهاية وردية', en: 'Shift End', icon: Clock, color: 'text-accent-600 bg-accent-50 dark:bg-accent-900/30' },
    verify_action: { ar: 'تأكيد إجراء', en: 'Verify Action', icon: CheckCircle2, color: 'text-neutral-600 bg-neutral-100 dark:bg-neutral-800' },
  };

  const filteredLogs = logs.filter((log) => {
    const matchSearch =
      !search ||
      log.biometric_user_id.toLowerCase().includes(search.toLowerCase()) ||
      log.device_id.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === 'all' || log.punch_type === filterType;
    return matchSearch && matchType;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center">
            <Fingerprint className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--color-text)]">
              {lang === 'ar' ? 'مركز سجلات البصمة' : 'Biometric Log Center'}
            </h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              {lang === 'ar' ? 'متابعة سجلات الحضور والانصراف من أجهزة البصمة' : 'Track attendance and logs from biometric devices'}
            </p>
          </div>
        </div>

        <button onClick={syncDevices} disabled={syncing} className="btn-primary flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {lang === 'ar' ? 'مزامنة الأجهزة' : 'Sync Devices'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lang === 'ar' ? 'بحث برقم المستخدم أو الجهاز...' : 'Search by Biometric ID or Device ID...'}
            className="input-field ps-10"
          />
        </div>

        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-[var(--color-text-muted)]" />
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input-field !w-auto">
            <option value="all">{lang === 'ar' ? 'جميع الحركات' : 'All Punches'}</option>
            <option value="check_in">{lang === 'ar' ? 'تسجيل دخول' : 'Check In'}</option>
            <option value="check_out">{lang === 'ar' ? 'تسجيل خروج' : 'Check Out'}</option>
            <option value="shift_start">{lang === 'ar' ? 'بداية وردية' : 'Shift Start'}</option>
            <option value="shift_end">{lang === 'ar' ? 'نهاية وردية' : 'Shift End'}</option>
            <option value="verify_action">{lang === 'ar' ? 'تأكيد إجراء' : 'Verify Action'}</option>
          </select>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 text-sm rounded-lg p-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Logs Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="card text-center py-12 text-[var(--color-text-muted)]">
          {lang === 'ar' ? 'لا توجد سجلات بصمة مطابقة' : 'No biometric logs found'}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'رقم المستخدم في البصمة' : 'Biometric User ID'}</th>
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'نوع الحركة' : 'Punch Type'}</th>
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'التاريخ والوقت' : 'Timestamp'}</th>
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'معرف الجهاز' : 'Device ID'}</th>
                <th className="text-start py-2 px-3 font-medium">{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => {
                const typeInfo = punchTypeLabels[log.punch_type] || punchTypeLabels.verify_action;
                const Icon = typeInfo.icon;

                return (
                  <tr key={log.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                    <td className="py-2.5 px-3 font-mono font-medium text-[var(--color-text)]">
                      {log.biometric_user_id}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md font-medium ${typeInfo.color}`}>
                        <Icon className="w-3.5 h-3.5" />
                        {lang === 'ar' ? typeInfo.ar : typeInfo.en}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[var(--color-text)] font-mono text-xs">
                      {new Date(log.timestamp).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-xs text-[var(--color-text-muted)]">
                      {log.device_id}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-[var(--color-text-muted)]">
                        {log.status || 'Success'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
