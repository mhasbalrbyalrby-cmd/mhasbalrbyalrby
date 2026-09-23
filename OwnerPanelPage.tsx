import { useEffect, useState } from 'react';
import { useI18n } from './lib/i18n-context';
import { useAuth } from './lib/auth-context';
import { supabase } from './lib/supabase';
import type { Tenant, SubscriptionPlan, AuditLog } from './types/database';
import {
  Building2, CreditCard, FileBarChart, Users, Settings,
  BookOpen, Shield, Loader2, AlertCircle,
} from 'lucide-react';

type Tab = 'tenants' | 'plans' | 'cards' | 'audit' | 'settings' | 'knowledge';

export default function OwnerPanelPage() {
  const { t, lang } = useI18n();
  const { isOwner } = useAuth();
  const [tab, setTab] = useState<Tab>('tenants');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOwner) return;
    loadData();
  }, [isOwner]);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [{ data: tenantsData }, { data: plansData }, { data: logsData }] = await Promise.all([
        supabase.from('tenants').select('*').order('created_at', { ascending: false }),
        supabase.from('subscription_plans').select('*').order('sort_order'),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(50),
      ]);
      setTenants((tenantsData as Tenant[]) ?? []);
      setPlans((plansData as SubscriptionPlan[]) ?? []);
      setLogs((logsData as AuditLog[]) ?? []);
    } catch {
      setError(t('error.generic'));
    } finally {
      setLoading(false);
    }
  }

  if (!isOwner) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-error-500 mx-auto mb-3" />
          <p className="text-[var(--color-text-muted)]">{t('error.unauthorized')}</p>
        </div>
      </div>
    );
  }

  const tabs: { code: Tab; icon: typeof Building2; label: string }[] = [
    { code: 'tenants', icon: Building2, label: t('owner.tenants') },
    { code: 'plans', icon: FileBarChart, label: t('owner.plans') },
    { code: 'cards', icon: CreditCard, label: t('owner.prepaid_cards') },
    { code: 'audit', icon: Shield, label: t('owner.audit_logs') },
    { code: 'settings', icon: Settings, label: t('owner.system_settings') },
    { code: 'knowledge', icon: BookOpen, label: t('owner.knowledge_base') },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">{t('owner.title')}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            {lang === 'ar' ? 'إدارة شاملة للنظام' : 'Full system management'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 border-b border-[var(--color-border)]">
        {tabs.map((tabItem) => {
          const Icon = tabItem.icon;
          return (
            <button
              key={tabItem.code}
              onClick={() => setTab(tabItem.code)}
              className={`nav-item !rounded-lg whitespace-nowrap ${
                tab === tabItem.code ? 'nav-item-active' : ''
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tabItem.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" />
        </div>
      ) : error ? (
        <div className="card text-center text-error-500">{error}</div>
      ) : (
        <>
          {tab === 'tenants' && <TenantsTab tenants={tenants} lang={lang} />}
          {tab === 'plans' && <PlansTab plans={plans} lang={lang} />}
          {tab === 'cards' && <CardsTab lang={lang} />}
          {tab === 'audit' && <AuditTab logs={logs} lang={lang} />}
          {tab === 'settings' && <SettingsTab lang={lang} />}
          {tab === 'knowledge' && <KnowledgeTab lang={lang} />}
        </>
      )}
    </div>
  );
}

function TenantsTab({ tenants, lang }: { tenants: Tenant[]; lang: string }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <div className="text-2xl font-bold text-[var(--color-text)]">{tenants.length}</div>
          <div className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'إجمالي المستأجرين' : 'Total Tenants'}</div>
        </div>
        <div className="card">
          <div className="text-2xl font-bold text-success-500">
            {tenants.filter((t) => t.status === 'active').length}
          </div>
          <div className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'نشط' : 'Active'}</div>
        </div>
        <div className="card">
          <div className="text-2xl font-bold text-accent-500">
            {tenants.filter((t) => t.status === 'trial').length}
          </div>
          <div className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'تجريبي' : 'Trial'}</div>
        </div>
        <div className="card">
          <div className="text-2xl font-bold text-error-500">
            {tenants.filter((t) => t.status === 'expired' || t.status === 'suspended').length}
          </div>
          <div className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'منتهي/موقوف' : 'Expired/Suspended'}</div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
              <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'الاسم' : 'Name'}</th>
              <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
              <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'المستخدمون' : 'Users'}</th>
              <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'تاريخ الإنشاء' : 'Created'}</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                <td className="py-2 px-3">
                  <div className="font-medium text-[var(--color-text)]">
                    {lang === 'ar' ? tenant.name_ar ?? tenant.name : tenant.name}
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)]">{tenant.slug}</div>
                </td>
                <td className="py-2 px-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    tenant.status === 'active' ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' :
                    tenant.status === 'trial' ? 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400' :
                    tenant.status === 'expired' ? 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400' :
                    'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400'
                  }`}>
                    {tenant.status}
                  </span>
                </td>
                <td className="py-2 px-3 text-[var(--color-text-muted)]">{tenant.max_users}</td>
                <td className="py-2 px-3 text-[var(--color-text-muted)]">
                  {new Date(tenant.created_at).toLocaleDateString(lang === 'ar' ? 'ar' : 'en')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlansTab({ plans, lang }: { plans: SubscriptionPlan[]; lang: string }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {plans.map((plan) => (
        <div key={plan.id} className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-[var(--color-text)]">
              {lang === 'ar' ? plan.name_ar ?? plan.name : plan.name}
            </h3>
            <span className="text-xs text-[var(--color-text-muted)] uppercase">{plan.code}</span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'شهري' : 'Monthly'}</span>
              <span className="font-medium text-[var(--color-text)]">{plan.price_monthly} {plan.currency}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'سنوي' : 'Yearly'}</span>
              <span className="font-medium text-[var(--color-text)]">{plan.price_yearly} {plan.currency}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'مدة التجربة' : 'Trial Days'}</span>
              <span className="font-medium text-[var(--color-text)]">{plan.trial_days}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'المستخدمون' : 'Users'}</span>
              <span className="font-medium text-[var(--color-text)]">{plan.max_users}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CardsTab({ lang }: { lang: string }) {
  return (
    <div className="card text-center py-12">
      <CreditCard className="w-12 h-12 text-[var(--color-text-muted)] mx-auto mb-3" />
      <p className="text-[var(--color-text-muted)]">
        {lang === 'ar'
          ? 'نظام الكروت مسبقة الدفع - سيتم تنفيذه في المرحلة التالية'
          : 'Prepaid cards system - to be implemented in the next phase'}
      </p>
    </div>
  );
}

function AuditTab({ logs, lang }: { logs: AuditLog[]; lang: string }) {
  return (
    <div className="card overflow-x-auto">
      {logs.length === 0 ? (
        <div className="text-center py-8 text-[var(--color-text-muted)]">
          {lang === 'ar' ? 'لا توجد سجلات بعد' : 'No logs yet'}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
              <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'العملية' : 'Action'}</th>
              <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'الكيان' : 'Entity'}</th>
              <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'الوقت' : 'Time'}</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                <td className="py-2 px-3 font-medium text-[var(--color-text)]">{log.action}</td>
                <td className="py-2 px-3 text-[var(--color-text-muted)]">
                  {log.entity_type ? `${log.entity_type}${log.entity_name ? ': ' + log.entity_name : ''}` : '—'}
                </td>
                <td className="py-2 px-3 text-[var(--color-text-muted)]">
                  {new Date(log.created_at).toLocaleString(lang === 'ar' ? 'ar' : 'en')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SettingsTab({ lang }: { lang: string }) {
  return (
    <div className="card text-center py-12">
      <Settings className="w-12 h-12 text-[var(--color-text-muted)] mx-auto mb-3" />
      <p className="text-[var(--color-text-muted)]">
        {lang === 'ar'
          ? 'إعدادات النظام - متاحة في المرحلة التالية'
          : 'System settings - available in the next phase'}
      </p>
    </div>
  );
}

function KnowledgeTab({ lang }: { lang: string }) {
  return (
    <div className="card text-center py-12">
      <BookOpen className="w-12 h-12 text-[var(--color-text-muted)] mx-auto mb-3" />
      <p className="text-[var(--color-text-muted)]">
        {lang === 'ar'
          ? 'مركز المعرفة - متاح من القائمة الجانبية'
          : 'Knowledge center - accessible from the sidebar'}
      </p>
    </div>
  );
}
