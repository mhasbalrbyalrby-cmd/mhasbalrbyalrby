import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n-context';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabaseClient'; // أو '../lib/supabase' حسب الاسم لديك
import {
  FileText, Receipt, Users, Package, ArrowLeftRight,
  Clock, TrendingUp, AlertCircle, CheckCircle2, Loader2,
} from 'lucide-react';

function statusAr(status: string): string {
  const map: Record<string, string> = { active: 'نشط', trial: 'تجريبي', suspended: 'موقوف', expired: 'منتهي', cancelled: 'ملغي', pending: 'معلّق' };
  return map[status] ?? status;
}

export default function DashboardPage() {
  const { t, lang } = useI18n();
  const { profile, tenant, isOwner } = useAuth();
  const [stats, setStats] = useState({ invoices: '—', receipts: '—', customers: '—', products: '—' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      const tid = profile?.tenant_id;
      if (!tid) { setLoading(false); return; }
      const today = new Date().toISOString().slice(0, 10);
      const [
        { count: invCount },
        { count: rcCount },
        { count: custCount },
        { count: prodCount },
      ] = await Promise.all([
        supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('tenant_id', tid).eq('date', today),
        supabase.from('receipts').select('*', { count: 'exact', head: true }).eq('tenant_id', tid).eq('date', today),
        supabase.from('party_roles').select('*', { count: 'exact', head: true }).eq('role', 'customer').in('party_id', (await supabase.from('parties').select('id').eq('tenant_id', tid)).data?.map((p: { id: string }) => p.id) ?? []),
        supabase.from('products').select('*', { count: 'exact', head: true }).eq('tenant_id', tid),
      ]);
      setStats({
        invoices: String(invCount ?? 0),
        receipts: String(rcCount ?? 0),
        customers: String(custCount ?? 0),
        products: String(prodCount ?? 0),
      });
      setLoading(false);
    }
    loadStats();
  }, [profile?.tenant_id]);

  const statItems = [
    { icon: FileText, label: lang === 'ar' ? 'فواتير اليوم' : "Today's Invoices", value: stats.invoices, color: 'primary' },
    { icon: Receipt, label: lang === 'ar' ? 'سندات اليوم' : "Today's Receipts", value: stats.receipts, color: 'secondary' },
    { icon: Users, label: lang === 'ar' ? 'العملاء' : 'Customers', value: stats.customers, color: 'accent' },
    { icon: Package, label: lang === 'ar' ? 'الأصناف' : 'Items', value: stats.products, color: 'success' },
  ];

  const quickActions = [
    { icon: FileText, label: lang === 'ar' ? 'فاتورة جديدة' : 'New Invoice', color: 'primary' },
    { icon: Receipt, label: lang === 'ar' ? 'سند قبض' : 'Receipt', color: 'secondary' },
    { icon: ArrowLeftRight, label: lang === 'ar' ? 'حوالة جديدة' : 'New Transfer', color: 'accent' },
    { icon: Clock, label: lang === 'ar' ? 'فتح وردية' : 'Open Shift', color: 'success' },
  ];

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="card bg-gradient-to-r from-primary-600 to-primary-700 !border-0 text-white">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-bold">
              {t('dashboard.welcome')}, {profile?.full_name ?? profile?.email}
            </h2>
            <p className="text-primary-100 text-sm mt-1">
              {tenant ? (lang === 'ar' ? tenant.name_ar ?? tenant.name : tenant.name) : t('app.tagline')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              tenant?.status === 'active' ? 'bg-success-400/20 text-success-100' :
              tenant?.status === 'trial' ? 'bg-accent-400/20 text-accent-100' :
              'bg-white/10 text-white'
            }`}>
              {tenant?.status ? (lang === 'ar' ? statusAr(tenant.status) : tenant.status) : ''}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statItems.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="card">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-lg bg-${stat.color}-100 dark:bg-${stat.color}-900/30 flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 text-${stat.color}-600 dark:text-${stat.color}-400`} />
                </div>
              </div>
              <div className="text-2xl font-bold text-[var(--color-text)]">{stat.value}</div>
              <div className="text-sm text-[var(--color-text-muted)]">{stat.label}</div>
            </div>
          );
        })}
      </div>

      <div>
        <h3 className="font-semibold text-[var(--color-text)] mb-3">{t('dashboard.quick_actions')}</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action, i) => {
            const Icon = action.icon;
            return (
              <button key={i} className="card flex flex-col items-center gap-2 hover:border-primary-400 transition-colors group">
                <div className={`w-12 h-12 rounded-xl bg-${action.color}-100 dark:bg-${action.color}-900/30 flex items-center justify-center group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-6 h-6 text-${action.color}-600 dark:text-${action.color}-400`} />
                </div>
                <span className="text-sm font-medium text-[var(--color-text)]">{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {!tenant?.is_owner && tenant?.status === 'trial' && (
        <div className="card flex items-start gap-3 border-accent-300 bg-accent-50 dark:bg-accent-900/20">
          <AlertCircle className="w-5 h-5 text-accent-600 dark:text-accent-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-[var(--color-text)]">{lang === 'ar' ? 'فترة تجريبية' : 'Trial Period'}</div>
            <div className="text-sm text-[var(--color-text-muted)]">
              {lang === 'ar' ? 'حسابك في فترة تجريبية. يمكنك الترقية إلى خطة مدفوعة للاستمرار في استخدام النظام.' : 'Your account is on a trial period. Upgrade to a paid plan to continue using the system.'}
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-success-500" />
          {lang === 'ar' ? 'حالة النظام' : 'System Status'}
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between py-2 border-b border-[var(--color-border)]">
            <span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'قاعدة البيانات' : 'Database'}</span>
            <span className="text-success-600 dark:text-success-400 font-medium">{lang === 'ar' ? 'متصل' : 'Connected'}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-[var(--color-border)]">
            <span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'المصادقة' : 'Authentication'}</span>
            <span className="text-success-600 dark:text-success-400 font-medium">{lang === 'ar' ? 'نشط' : 'Active'}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-[var(--color-border)]">
            <span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'عزل المستأجرين (RLS)' : 'Tenant Isolation (RLS)'}</span>
            <span className="text-success-600 dark:text-success-400 font-medium">{lang === 'ar' ? 'مفعّل' : 'Enabled'}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-[var(--color-border)]">
            <span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'نظام الصلاحيات' : 'RBAC System'}</span>
            <span className="text-success-600 dark:text-success-400 font-medium">{lang === 'ar' ? 'مفعّل' : 'Enabled'}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'سجل التدقيق' : 'Audit Logging'}</span>
            <span className="text-success-600 dark:text-success-400 font-medium">{lang === 'ar' ? 'مفعّل' : 'Enabled'}</span>
          </div>
        </div>
      </div>

      {isOwner && (
        <div className="card border-primary-300 bg-primary-50 dark:bg-primary-900/20">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            <span className="font-medium text-[var(--color-text)]">{lang === 'ar' ? 'صلاحية المالك' : 'Owner Access'}</span>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">
            {lang === 'ar' ? 'يمكنك الوصول إلى لوحة تحكم المالك لإدارة المستأجرين والخطط والكروت مسبقة الدفع وإعدادات النظام.' : 'You have access to the Owner Control Center to manage tenants, plans, prepaid cards, and system settings.'}
          </p>
        </div>
      )}
    </div>
  );
}
