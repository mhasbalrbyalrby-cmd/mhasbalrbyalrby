import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Tenant, SubscriptionPlan, AuditLog, PrepaidCard, SystemSetting } from '@/types/database';
import {
  Building2, CreditCard, FileBarChart, Users, Settings,
  BookOpen, Shield, Loader2, AlertCircle, Plus, XCircle,
  CheckCircle2, Ban, RefreshCw, Save, Eye, Boxes, Puzzle,
} from 'lucide-react';
import Modal from '@/components/Modal';

type Tab = 'tenants' | 'users' | 'modules' | 'plans' | 'cards' | 'audit' | 'settings';

export default function OwnerPanelPage() {
  const { t, lang } = useI18n();
  const { isOwner, profile } = useAuth();
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
      const [{ data: tenantsData, error: te }, { data: plansData, error: pe }, { data: logsData, error: le }] = await Promise.all([
        supabase.from('tenants').select('*').order('created_at', { ascending: false }),
        supabase.from('subscription_plans').select('*').order('sort_order'),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100),
      ]);
      if (te) throw te;
      if (pe) throw pe;
      if (le) throw le;
      setTenants((tenantsData as Tenant[]) ?? []);
      setPlans((plansData as SubscriptionPlan[]) ?? []);
      setLogs((logsData as AuditLog[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.generic'));
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
    { code: 'tenants', icon: Building2, label: lang === 'ar' ? 'المستأجرون' : 'Tenants' },
    { code: 'users', icon: Users, label: lang === 'ar' ? 'المستخدمون' : 'Users' },
    { code: 'modules', icon: Boxes, label: lang === 'ar' ? 'الإضافات' : 'Modules' },
    { code: 'plans', icon: FileBarChart, label: lang === 'ar' ? 'الخطط' : 'Plans' },
    { code: 'cards', icon: CreditCard, label: lang === 'ar' ? 'الكروت المدفوعة' : 'Prepaid Cards' },
    { code: 'audit', icon: Shield, label: lang === 'ar' ? 'سجل التدقيق' : 'Audit Log' },
    { code: 'settings', icon: Settings, label: lang === 'ar' ? 'إعدادات النظام' : 'System Settings' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">{lang === 'ar' ? 'لوحة المالك' : 'Owner Panel'}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            {lang === 'ar' ? 'إدارة شاملة للنظام' : 'Full system management'}
          </p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2 border-b border-[var(--color-border)]">
        {tabs.map((tabItem) => {
          const Icon = tabItem.icon;
          return (
            <button
              key={tabItem.code}
              onClick={() => setTab(tabItem.code)}
              className={`nav-item !rounded-lg whitespace-nowrap ${tab === tabItem.code ? 'nav-item-active' : ''}`}
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
        <div className="card text-center text-error-500 flex items-center justify-center gap-2 py-6">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      ) : (
        <>
          {tab === 'tenants' && <TenantsTab tenants={tenants} plans={plans} lang={lang} onRefresh={loadData} userId={profile?.id ?? null} />}
          {tab === 'users' && <UsersTab lang={lang} />}
          {tab === 'modules' && <ModulesTab lang={lang} tenants={tenants} userId={profile?.id ?? null} />}
          {tab === 'plans' && <PlansTab plans={plans} lang={lang} />}
          {tab === 'cards' && <CardsTab lang={lang} />}
          {tab === 'audit' && <AuditTab logs={logs} lang={lang} onRefresh={loadData} />}
          {tab === 'settings' && <SystemSettingsTab lang={lang} />}
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Tenants Tab — with activate / suspend / change plan
// ──────────────────────────────────────────────────────────────
function TenantsTab({
  tenants, plans, lang, onRefresh, userId,
}: { tenants: Tenant[]; plans: SubscriptionPlan[]; lang: string; onRefresh: () => void; userId: string | null }) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [newPlanId, setNewPlanId] = useState('');
  const [newStatus, setNewStatus] = useState<string>('active');
const [newTenantName, setNewTenantName] = useState('');
const [newTenantNameAr, setNewTenantNameAr] = useState('');
  async function handleStatusChange(tenant: Tenant, status: string) {
    
  async functionconst [newTenantNameAr, setNewTenantNameAr] = useState('');

  async function handleStatusChange(tenant: Tenant, status: string) {
    if (tenant.is_owner) {
      setError(
        lang === 'ar'
          ? 'لا يمكن تعديل حالة مؤسسة مالك النظام.'
          : 'The system owner tenant cannot be modified.'
      );
      return;
    }

    setActionLoading(tenant.id);
    setError('');

    try {
      const { data, error: updateError } = await supabase
        .from('tenants')
        .update({ status })
        .eq('id', tenant.id)
        .eq('is_owner', false)
        .select('id')
        .maybeSingle();

      if (updateError) throw updateError;

      if (!data) {
        throw new Error(
          lang === 'ar'
            ? 'لم يتم تحديث المؤسسة. تحقق من الصلاحيات.'
            : 'Tenant was not updated. Check permissions.'
        );
      }

      const { error: auditError } = await supabase
        .from('audit_logs')
        .insert({
          action: 'update_tenant_status',
          entity_type: 'tenant',
          entity_id: tenant.id,
          entity_name: tenant.name,
          old_values: { status: tenant.status },
          new_values: { status },
          user_id: userId,
        });

      await onRefresh();

      if (auditError) {
        setError(
          lang === 'ar'
            ? 'تم تحديث الحالة، لكن تعذر تسجيل العملية في سجل التدقيق.'
            : 'Status updated, but the audit log could not be saved.'
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setActionLoading(null);
    }
  }

  function openPlanModal(tenant: Tenant) {
    if (tenant.is_owner) {
      setError(
        lang === 'ar'
          ? 'لا يمكن تعديل مؤسسة مالك النظام.'
          : 'The system owner tenant cannot be modified.'
      );
      return;
    }

    setSelectedTenant(tenant);
    setNewTenantName(tenant.name ?? '');
    setNewTenantNameAr(tenant.name_ar ?? '');
    setNewPlanId(tenant.plan_id ?? '');
    setNewStatus(tenant.status);
    setError('');
    setPlanModalOpen(true);
  }  (tenant: Tenant) {
    setSelectedTenant(tenant);
    setNewPlanId(tenant.plan_id ?? '');
    setNewStatus(tenant.status);
    setError('');
    setPlanModalOpen(true);
  }

  const statusColors: Record<string, string> = {
    active: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400',
    trial: 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400',
    expired: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400',
    suspended: 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400',
    pending: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400',
    cancelled: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400',
  };

  const statusLabels: Record<string, string> = {
    active: lang === 'ar' ? 'نشط' : 'Active',
    trial: lang === 'ar' ? 'تجريبي' : 'Trial',
    expired: lang === 'ar' ? 'منتهي' : 'Expired',
    suspended: lang === 'ar' ? 'موقوف' : 'Suspended',
    pending: lang === 'ar' ? 'معلق' : 'Pending',
    cancelled: lang === 'ar' ? 'ملغى' : 'Cancelled',
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(['active', 'trial', 'suspended', 'expired'] as const).map((s) => (
          <div key={s} className="card">
            <div className={`text-2xl font-bold ${s === 'active' ? 'text-success-500' : s === 'trial' ? 'text-accent-500' : s === 'suspended' ? 'text-warning-500' : 'text-error-500'}`}>
              {tenants.filter((t) => t.status === s).length}
            </div>
            <div className="text-sm text-[var(--color-text-muted)]">{statusLabels[s]}</div>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
              <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'الاسم' : 'Name'}</th>
              <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
              <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'الخطة' : 'Plan'}</th>
              <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'الحد الأقصى' : 'Max Users'}</th>
              <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'تاريخ الإنشاء' : 'Created'}</th>
              <th className="text-end py-2 px-3 font-medium">{lang === 'ar' ? 'إجراءات' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => {
              const plan = plans.find((p) => p.id === tenant.plan_id);
              const isBusy = actionLoading === tenant.id;
              return (
                <tr key={tenant.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                  <td className="py-2 px-3">
                    <div className="font-medium text-[var(--color-text)]">
                      {lang === 'ar' ? tenant.name_ar ?? tenant.name : tenant.name}
                      {tenant.is_owner && (
                        <span className="ms-2 text-xs bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 px-1.5 py-0.5 rounded-full">
                          {lang === 'ar' ? 'المالك' : 'Owner'}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)]">{tenant.slug}</div>
                  </td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[tenant.status] ?? ''}`}>
                      {statusLabels[tenant.status] ?? tenant.status}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-[var(--color-text-muted)]">
                    {plan ? (lang === 'ar' ? plan.name_ar ?? plan.name : plan.name) : '—'}
                  </td>
                  <td className="py-2 px-3 text-[var(--color-text-muted)]">{tenant.max_users}</td>
                  <td className="py-2 px-3 text-[var(--color-text-muted)]">
                    {new Date(tenant.created_at).toLocaleDateString(lang === 'ar' ? 'ar' : 'en')}
                  </td>
                  <td className="py-2 px-3 text-end">
                    {tenant.is_owner ? (
                      <span className="text-xs text-[var(--color-text-muted)]">—</span>
                    ) : (
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => openPlanModal(tenant)}
                          disabled={isBusy}
                          className="btn-secondary !p-1.5"
                          title={lang === 'ar' ? 'تعديل' : 'Edit'}
                        >
                          {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        {tenant.status === 'suspended' ? (
                          <button
                            onClick={() => handleStatusChange(tenant, 'active')}
                            disabled={isBusy}
                            className="btn-secondary !p-1.5 text-success-600"
                            title={lang === 'ar' ? 'تفعيل' : 'Activate'}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleStatusChange(tenant, 'suspended')}
                            disabled={isBusy}
                            className="btn-secondary !p-1.5 text-warning-600"
                            title={lang === 'ar' ? 'تعليق' : 'Suspend'}
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={planModalOpen}
        onClose={() => setPlanModalOpen(false)}
        title={lang === 'ar' ? 'تعديل المستأجر' : 'Edit Tenant'}
      >
        {error && (
          <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg px-3 py-2 mb-4">
            <AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span>
          </div>
        )}
        {selectedTenant && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-[var(--color-text)] mb-1">{lang === 'ar' ? 'المستأجر' : 'Tenant'}</div>
              <div className="text-[var(--color-text-muted)]">{selectedTenant.name}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الحالة' : 'Status'}</label>
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} className="input-field">
                {['active', 'trial', 'suspended', 'expired', 'cancelled'].map((s) => (
                  <option key={s} value={s}>{statusLabels[s] ?? s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الخطة' : 'Plan'}</label>
              <select value={newPlanId} onChange={(e) => setNewPlanId(e.target.value)} className="input-field">
                <option value="">{lang === 'ar' ? 'بدون خطة' : 'No plan'}</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{lang === 'ar' ? p.name_ar ?? p.name : p.name}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setPlanModalOpen(false)} className="btn-secondary">{lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
              <button
                onClick={handlePlanChange}
                disabled={actionLoading === selectedTenant.id}
                className="btn-primary flex items-center gap-2"
              >
                {actionLoading === selectedTenant.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {lang === 'ar' ? 'حفظ' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Plans Tab
// ──────────────────────────────────────────────────────────────
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
              <span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'المستخدمون' : 'Max Users'}</span>
              <span className="font-medium text-[var(--color-text)]">{plan.max_users}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">{lang === 'ar' ? 'الحالة' : 'Status'}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${plan.is_active ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'}`}>
                {plan.is_active ? (lang === 'ar' ? 'نشطة' : 'Active') : (lang === 'ar' ? 'معطلة' : 'Inactive')}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Cards Tab
// ──────────────────────────────────────────────────────────────
function CardsTab({ lang }: { lang: string }) {
  const [cards, setCards] = useState<PrepaidCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genForm, setGenForm] = useState({
    count: 1,
    duration_type: 'monthly' as 'monthly' | 'yearly' | 'custom',
    duration_days: 30,
    value: 0,
    currency: 'SAR',
  });

  useEffect(() => { loadCards(); }, []);

  async function loadCards() {
    setLoading(true);
    setError('');
    try {
      const { data, error: e } = await supabase.from('prepaid_cards').select('*').order('created_at', { ascending: false }).limit(100);
      if (e) throw e;
      setCards((data as PrepaidCard[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر تحميل الكروت' : 'Failed to load cards'));
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (genForm.count <= 0 || genForm.count > 100) {
      setError(lang === 'ar' ? 'العدد يجب أن يكون بين 1 و 100' : 'Count must be 1-100');
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const payloads = Array.from({ length: genForm.count }, () => ({
        code: `PC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        duration_type: genForm.duration_type,
        duration_days: genForm.duration_days,
        value: genForm.value,
        currency: genForm.currency,
        status: 'active' as const,
      }));
      const { error: e } = await supabase.from('prepaid_cards').insert(payloads);
      if (e) throw e;
      setGenForm({ count: 1, duration_type: 'monthly', duration_days: 30, value: 0, currency: 'SAR' });
      loadCards();
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'فشل توليد الكروت' : 'Failed to generate cards'));
    } finally {
      setGenerating(false);
    }
  }

  async function handleCancelCard(card: PrepaidCard) {
    if (card.status !== 'active') return;
    if (!confirm(lang === 'ar' ? 'إلغاء الكرت؟' : 'Cancel card?')) return;
    const { error: e } = await supabase.from('prepaid_cards').update({ status: 'cancelled' }).eq('id', card.id);
    if (!e) loadCards();
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" /></div>;

  const statusColors: Record<string, string> = {
    active: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400',
    used: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400',
    cancelled: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400',
    expired: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400',
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span>
        </div>
      )}
      <div className="card">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">{lang === 'ar' ? 'توليد كروت جديدة' : 'Generate New Cards'}</h3>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{lang === 'ar' ? 'العدد' : 'Count'}</label>
            <input type="number" min="1" max="100" value={genForm.count} onChange={(e) => setGenForm({ ...genForm, count: Number(e.target.value) })} className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{lang === 'ar' ? 'المدة' : 'Duration'}</label>
            <select value={genForm.duration_type} onChange={(e) => {
              const dt = e.target.value as 'monthly' | 'yearly' | 'custom';
              const days = dt === 'monthly' ? 30 : dt === 'yearly' ? 365 : genForm.duration_days;
              setGenForm({ ...genForm, duration_type: dt, duration_days: days });
            }} className="input-field">
              <option value="monthly">{lang === 'ar' ? 'شهري' : 'Monthly'}</option>
              <option value="yearly">{lang === 'ar' ? 'سنوي' : 'Yearly'}</option>
              <option value="custom">{lang === 'ar' ? 'مخصص' : 'Custom'}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{lang === 'ar' ? 'أيام' : 'Days'}</label>
            <input type="number" value={genForm.duration_days} onChange={(e) => setGenForm({ ...genForm, duration_days: Number(e.target.value) })} className="input-field" disabled={genForm.duration_type !== 'custom'} />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">{lang === 'ar' ? 'القيمة' : 'Value'}</label>
            <input type="number" step="0.01" value={genForm.value || ''} onChange={(e) => setGenForm({ ...genForm, value: Number(e.target.value) })} className="input-field" />
          </div>
          <div className="flex items-end">
            <button onClick={handleGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {lang === 'ar' ? 'توليد' : 'Generate'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card"><div className="text-2xl font-bold text-[var(--color-text)]">{cards.length}</div><div className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'إجمالي الكروت' : 'Total'}</div></div>
        <div className="card"><div className="text-2xl font-bold text-success-500">{cards.filter((c) => c.status === 'active').length}</div><div className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'نشطة' : 'Active'}</div></div>
        <div className="card"><div className="text-2xl font-bold text-primary-500">{cards.filter((c) => c.status === 'used').length}</div><div className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'مستخدمة' : 'Used'}</div></div>
        <div className="card"><div className="text-2xl font-bold text-error-500">{cards.filter((c) => c.status === 'cancelled' || c.status === 'expired').length}</div><div className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'ملغاة/منتهية' : 'Cancelled/Expired'}</div></div>
      </div>

      {cards.length === 0 ? (
        <div className="card text-center py-12 text-[var(--color-text-muted)]">{lang === 'ar' ? 'لا توجد كروت بعد' : 'No cards yet'}</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'الكود' : 'Code'}</th>
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'المدة' : 'Duration'}</th>
                <th className="text-end py-2 px-3 font-medium">{lang === 'ar' ? 'القيمة' : 'Value'}</th>
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'تاريخ الإنشاء' : 'Created'}</th>
                <th className="text-end py-2 px-3 font-medium">{lang === 'ar' ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((card) => (
                <tr key={card.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                  <td className="py-2 px-3 font-mono text-xs text-[var(--color-text)]">{card.code}</td>
                  <td className="py-2 px-3 text-[var(--color-text-muted)]">{card.duration_days} {lang === 'ar' ? 'يوم' : 'days'}</td>
                  <td className="py-2 px-3 text-end font-medium text-[var(--color-text)]">{card.value} {card.currency}</td>
                  <td className="py-2 px-3"><span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[card.status] ?? ''}`}>{card.status}</span></td>
                  <td className="py-2 px-3 text-[var(--color-text-muted)]">{new Date(card.created_at).toLocaleDateString(lang === 'ar' ? 'ar' : 'en')}</td>
                  <td className="py-2 px-3 text-end">
                    {card.status === 'active' && (
                      <button onClick={() => handleCancelCard(card)} className="btn-secondary !p-1.5 text-error-500" title={lang === 'ar' ? 'إلغاء' : 'Cancel'}>
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Audit Log Tab — with refresh + richer display
// ──────────────────────────────────────────────────────────────
function AuditTab({ logs, lang, onRefresh }: { logs: AuditLog[]; lang: string; onRefresh: () => void }) {
  const actionColors: Record<string, string> = {
    insert: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400',
    update: 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400',
    delete: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400',
  };

  function actionColor(action: string) {
    const prefix = action.split('_')[0];
    return actionColors[prefix] ?? 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400';
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-[var(--color-text-muted)]">
          {lang === 'ar' ? `${logs.length} سجل (آخر 100)` : `${logs.length} records (last 100)`}
        </p>
        <button onClick={onRefresh} className="btn-secondary flex items-center gap-2 !py-1.5">
          <RefreshCw className="w-4 h-4" />
          {lang === 'ar' ? 'تحديث' : 'Refresh'}
        </button>
      </div>
      <div className="card overflow-x-auto">
        {logs.length === 0 ? (
          <div className="text-center py-8 text-[var(--color-text-muted)]">
            {lang === 'ar' ? 'لا توجد سجلات بعد — سيتم تسجيل العمليات تلقائياً' : 'No logs yet — operations will be logged automatically'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'العملية' : 'Action'}</th>
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'الكيان' : 'Entity'}</th>
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'الاسم' : 'Name'}</th>
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'الوقت' : 'Time'}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                  <td className="py-2 px-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${actionColor(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-[var(--color-text-muted)]">{log.entity_type ?? '—'}</td>
                  <td className="py-2 px-3 text-[var(--color-text)]">{log.entity_name ?? '—'}</td>
                  <td className="py-2 px-3 text-[var(--color-text-muted)]">
                    {new Date(log.created_at).toLocaleString(lang === 'ar' ? 'ar' : 'en')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Users Tab — all profiles + tenant memberships
// ──────────────────────────────────────────────────────────────
function UsersTab({ lang }: { lang: string }) {
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null; email: string | null; tenant_id: string | null; is_active: boolean }[]>([]);
  const [members, setMembers] = useState<{ id: string; tenant_id: string; user_id: string; role_id: string | null; status: string; joined_at: string | null }[]>([]);
  const [tenants, setTenants] = useState<{ id: string; name: string; is_owner: boolean }[]>([]);
  const [roles, setRoles] = useState<{ id: string; name: string; name_ar: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteTenantId, setInviteTenantId] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [inviting, setInviting] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [{ data: p }, { data: m }, { data: t }, { data: r }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, tenant_id, is_active').order('created_at', { ascending: false }),
        supabase.from('tenant_members').select('id, tenant_id, user_id, role_id, status, joined_at').order('created_at', { ascending: false }),
        supabase.from('tenants').select('id, name, is_owner').order('name'),
        supabase.from('roles').select('id, name, name_ar').eq('is_system', true).order('sort_order'),
      ]);
      setProfiles(p ?? []);
      setMembers(m ?? []);
      setTenants(t ?? []);
      setRoles(r ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'تعذر تحميل البيانات' : 'Failed to load'));
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim() || !inviteTenantId) return;
    setInviting(true);
    setError('');
    try {
      const { error: e } = await supabase.rpc('invite_user_to_tenant', {
        p_tenant_id: inviteTenantId,
        p_email: inviteEmail.trim(),
        p_role_id: inviteRoleId || null,
      });
      if (e) throw e;
      setInviteEmail('');
      setInviteTenantId('');
      setInviteRoleId('');
      setInviteModal(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'ar' ? 'فشلت الدعوة' : 'Invite failed'));
    } finally {
      setInviting(false);
    }
  }

  async function toggleMembershipStatus(memberId: string, currentStatus: string) {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    const { error: e } = await supabase.from('tenant_members').update({ status: newStatus }).eq('id', memberId);
    if (e) { setError(e.message); return; }
    load();
  }

  async function updateMemberRole(memberId: string, roleId: string) {
    const { error: e } = await supabase.from('tenant_members').update({ role_id: roleId || null }).eq('id', memberId);
    if (e) { setError(e.message); return; }
    load();
  }

  const tenantName = (tid: string | null) => tenants.find((t) => t.id === tid)?.name ?? '—';
  const roleName = (rid: string | null) => {
    if (!rid) return '—';
    const r = roles.find((r) => r.id === rid);
    return r ? (lang === 'ar' ? r.name_ar ?? r.name : r.name) : '—';
  };
  const memberForUser = (uid: string) => members.find((m) => m.user_id === uid);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" /></div>;

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="card"><div className="text-2xl font-bold text-[var(--color-text)]">{profiles.length}</div><div className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'إجمالي المستخدمين' : 'Total Users'}</div></div>
        <div className="card"><div className="text-2xl font-bold text-success-500">{members.filter((m) => m.status === 'active').length}</div><div className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'أعضاء نشطون' : 'Active Members'}</div></div>
        <div className="card"><div className="text-2xl font-bold text-accent-500">{members.filter((m) => m.status === 'invited').length}</div><div className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'دعوات معلقة' : 'Pending Invites'}</div></div>
      </div>

      <button onClick={() => setInviteModal(true)} className="btn-primary flex items-center gap-2 w-fit">
        <Plus className="w-4 h-4" />{lang === 'ar' ? 'دعوة مستخدم' : 'Invite User'}
      </button>

      <div className="card overflow-x-auto">
        {profiles.length === 0 ? (
          <div className="text-center py-8 text-[var(--color-text-muted)]">{lang === 'ar' ? 'لا يوجد مستخدمون' : 'No users'}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'الاسم' : 'Name'}</th>
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'البريد' : 'Email'}</th>
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'المؤسسة' : 'Tenant'}</th>
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'الدور' : 'Role'}</th>
                <th className="text-start py-2 px-3 font-medium">{lang === 'ar' ? 'الحالة' : 'Status'}</th>
                <th className="text-end py-2 px-3 font-medium">{lang === 'ar' ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => {
                const m = memberForUser(p.id);
                return (
                  <tr key={p.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                    <td className="py-2 px-3 font-medium text-[var(--color-text)]">{p.full_name ?? '—'}</td>
                    <td className="py-2 px-3 text-[var(--color-text-muted)]">{p.email ?? '—'}</td>
                    <td className="py-2 px-3 text-[var(--color-text-muted)]">{tenantName(p.tenant_id)}</td>
                    <td className="py-2 px-3">
                      {m ? (
                        <select value={m.role_id ?? ''} onChange={(e) => updateMemberRole(m.id, e.target.value)} className="input-field !py-1 !text-xs">
                          <option value="">{lang === 'ar' ? 'بدون دور' : 'No role'}</option>
                          {roles.map((r) => <option key={r.id} value={r.id}>{lang === 'ar' ? r.name_ar ?? r.name : r.name}</option>)}
                        </select>
                      ) : <span className="text-[var(--color-text-muted)]">—</span>}
                    </td>
                    <td className="py-2 px-3">
                      {m ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.status === 'active' ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' : m.status === 'invited' ? 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'}`}>
                          {m.status === 'active' ? (lang === 'ar' ? 'نشط' : 'Active') : m.status === 'invited' ? (lang === 'ar' ? 'مدعو' : 'Invited') : m.status === 'suspended' ? (lang === 'ar' ? 'موقوف' : 'Suspended') : m.status}
                        </span>
                      ) : <span className="text-xs text-[var(--color-text-muted)]">{lang === 'ar' ? 'غير عضو' : 'No membership'}</span>}
                    </td>
                    <td className="py-2 px-3 text-end">
                      {m && (
                        <button onClick={() => toggleMembershipStatus(m.id, m.status)} disabled={tenants.find((t) => t.id === m.tenant_id)?.is_owner} className="btn-secondary !p-1.5 text-xs" title={m.status === 'active' ? (lang === 'ar' ? 'إيقاف' : 'Suspend') : (lang === 'ar' ? 'تفعيل' : 'Activate')}>
                          {m.status === 'active' ? <Ban className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={inviteModal} onClose={() => setInviteModal(false)} title={lang === 'ar' ? 'دعوة مستخدم لمؤسسة' : 'Invite User to Tenant'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'البريد الإلكتروني' : 'Email'} *</label>
            <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="input-field" placeholder="user@example.com" />
            <p className="text-xs text-[var(--color-text-muted)] mt-1">{lang === 'ar' ? 'يجب أن يكون المستخدم مسجلاً في النظام' : 'User must be registered in the system'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'المؤسسة' : 'Tenant'} *</label>
            <select value={inviteTenantId} onChange={(e) => setInviteTenantId(e.target.value)} className="input-field">
              <option value="">{lang === 'ar' ? 'اختر...' : 'Select...'}</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_owner ? (lang === 'ar' ? ' (مالك النظام)' : ' (System Owner)') : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الدور' : 'Role'}</label>
            <select value={inviteRoleId} onChange={(e) => setInviteRoleId(e.target.value)} className="input-field">
              <option value="">{lang === 'ar' ? 'بدون دور' : 'No role'}</option>
              {roles.filter((r) => r.name !== 'owner').map((r) => <option key={r.id} value={r.id}>{lang === 'ar' ? r.name_ar ?? r.name : r.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
            <button onClick={() => setInviteModal(false)} className="btn-secondary">{lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
            <button onClick={handleInvite} disabled={inviting || !inviteEmail.trim() || !inviteTenantId} className="btn-primary flex items-center gap-2">
              {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {lang === 'ar' ? 'إرسال الدعوة' : 'Send Invite'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Modules Tab — unified module list with core/addon separation
// ──────────────────────────────────────────────────────────────
type ModuleRow = {
  id: string; code: string; name: string; name_ar: string | null;
  description: string | null; sort_order: number;
  category: string | null; is_optional: boolean | null; is_active: boolean | null;
};

function ModulesTab({ lang, tenants, userId }: { lang: string; tenants: Tenant[]; userId: string | null }) {
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [tenantModules, setTenantModules] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState('');

  const ar = lang === 'ar';

  useEffect(() => {
    if (tenants.length > 0 && !selectedTenantId) {
      const nonOwner = tenants.find((t) => !t.is_owner);
      setSelectedTenantId(nonOwner?.id ?? tenants[0].id);
    }
  }, [tenants, selectedTenantId]);

  useEffect(() => { loadModules(); }, []);
  useEffect(() => { if (selectedTenantId) loadTenantModules(selectedTenantId); }, [selectedTenantId]);

  async function loadModules() {
    const { data, error: e } = await supabase
      .from('modules')
      .select('id, code, name, name_ar, description, sort_order, category, is_optional, is_active')
      .eq('is_active', true)
      .order('sort_order');
    if (e) { setError(e.message); return; }
    setModules((data as ModuleRow[]) ?? []);
  }

  async function loadTenantModules(tid: string) {
    setLoading(true);
    const { data, error: e } = await supabase.from('tenant_modules').select('module_id, is_enabled').eq('tenant_id', tid);
    if (e) { setError(e.message); setLoading(false); return; }
    const map: Record<string, boolean> = {};
    (data ?? []).forEach((tm: { module_id: string; is_enabled: boolean }) => { map[tm.module_id] = tm.is_enabled; });
    setTenantModules((prev) => ({ ...prev, [tid]: map }));
    setLoading(false);
  }

  async function toggleModule(moduleId: string, currentEnabled: boolean) {
    if (!selectedTenantId) return;
    const tenant = tenants.find((t) => t.id === selectedTenantId);
    if (tenant?.is_owner) return;
    const key = `${selectedTenantId}-${moduleId}`;
    setToggling(key);
    setError('');
    try {
      if (moduleId in (tenantModules[selectedTenantId] ?? {})) {
        const { error: e } = await supabase
          .from('tenant_modules')
          .update({ is_enabled: !currentEnabled, enabled_at: new Date().toISOString(), enabled_by: userId })
          .eq('tenant_id', selectedTenantId)
          .eq('module_id', moduleId);
        if (e) throw e;
      } else {
        const { error: e } = await supabase
          .from('tenant_modules')
          .insert({ tenant_id: selectedTenantId, module_id: moduleId, is_enabled: true, enabled_at: new Date().toISOString(), enabled_by: userId });
        if (e) throw e;
      }
      await supabase.from('audit_logs').insert({
        action: currentEnabled ? 'disable_module' : 'enable_module',
        entity_type: 'tenant_module',
        entity_id: selectedTenantId,
        entity_name: tenant?.name ?? null,
        new_values: { module_id: moduleId, is_enabled: !currentEnabled },
        user_id: userId,
      });
      await loadTenantModules(selectedTenantId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setToggling(null);
    }
  }

  const selectedTenant = tenants.find((t) => t.id === selectedTenantId);
  const isOwnerTenant = selectedTenant?.is_owner ?? false;
  const enabledMap = tenantModules[selectedTenantId] ?? {};

  const coreModules = modules.filter((m) => m.category === 'core');
  const addonModules = modules.filter((m) => m.category === 'addon');

  function renderModuleCard(m: ModuleRow) {
    const isCore = m.category === 'core';
    const isEnabled = isCore || isOwnerTenant || enabledMap[m.id] === true;
    const key = `${selectedTenantId}-${m.id}`;
    const isBusy = toggling === key;
    const statusLabel = isEnabled
      ? (ar ? 'مفعّل' : 'Enabled')
      : (ar ? 'معطّل' : 'Disabled');
    const statusClass = isEnabled
      ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400'
      : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400';

    return (
      <div key={m.id} className={`card ${isEnabled ? 'border-success-300 dark:border-success-700' : ''}`}>
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-[var(--color-text)]">{ar ? m.name_ar ?? m.name : m.name}</h4>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{m.description}</p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${statusClass}`}>
            {statusLabel}
          </span>
        </div>
        {isCore ? (
          <div className="text-xs text-[var(--color-text-muted)] flex items-center gap-1.5 py-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-success-500" />
            {ar ? 'وحدة أساسية — مفعّلة دائمًا' : 'Core module — always enabled'}
          </div>
        ) : !isOwnerTenant ? (
          <button
            onClick={() => toggleModule(m.id, isEnabled)}
            disabled={isBusy}
            className={`w-full text-sm py-2 rounded-lg flex items-center justify-center gap-2 ${isEnabled ? 'btn-secondary text-error-500' : 'btn-primary'}`}
          >
            {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : isEnabled
              ? <XCircle className="w-4 h-4" />
              : <CheckCircle2 className="w-4 h-4" />}
            {isEnabled ? (ar ? 'تعطيل' : 'Disable') : (ar ? 'تفعيل' : 'Enable')}
          </button>
        ) : (
          <div className="text-xs text-[var(--color-text-muted)] flex items-center gap-1.5 py-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-success-500" />
            {ar ? 'مفعّل لمالك النظام' : 'Enabled for system owner'}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Puzzle className="w-5 h-5 text-primary-500" />
        <select value={selectedTenantId} onChange={(e) => setSelectedTenantId(e.target.value)} className="input-field !w-auto">
          {tenants.map((t) => <option key={t.id} value={t.id}>{ar ? t.name_ar ?? t.name : t.name}{t.is_owner ? (ar ? ' (مالك النظام)' : ' (System Owner)') : ''}</option>)}
        </select>
        {isOwnerTenant && (
          <span className="text-xs text-[var(--color-text-muted)]">{ar ? 'جميع الوحدات مفعلة لمالك النظام' : 'All modules enabled for system owner'}</span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" /></div>
      ) : (
        <>
          <div>
            <h3 className="text-sm font-bold text-[var(--color-text)] mb-3 flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-primary-500" />
              {ar ? 'الوحدات الأساسية' : 'Core Modules'}
              <span className="text-xs font-normal text-[var(--color-text-muted)]">({coreModules.length})</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {coreModules.map(renderModuleCard)}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-[var(--color-text)] mb-3 flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-accent-500" />
              {ar ? 'الإضافات الاختيارية' : 'Optional Add-ons'}
              <span className="text-xs font-normal text-[var(--color-text-muted)]">({addonModules.length})</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {addonModules.map(renderModuleCard)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// System Settings Tab — real data from system_settings table
// ──────────────────────────────────────────────────────────────
function SystemSettingsTab({ lang }: { lang: string }) {
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    setLoading(true);
    const { data, error: e } = await supabase.from('system_settings').select('*').order('key');
    if (!e && data) {
      setSettings(data as SystemSetting[]);
      const initial: Record<string, string> = {};
      (data as SystemSetting[]).forEach((s) => {
        initial[s.id] = typeof s.value === 'string' ? s.value : JSON.stringify(s.value);
      });
      setEdits(initial);
    }
    setLoading(false);
  }

  async function handleSave(setting: SystemSetting) {
    setSaving(setting.id);
    setError('');
    setSuccess('');
    try {
      let val: unknown = edits[setting.id];
      try { val = JSON.parse(edits[setting.id]); } catch { /* keep as string */ }
      const { error: e } = await supabase.from('system_settings').update({ value: val }).eq('id', setting.id);
      if (e) throw e;
      setSuccess(lang === 'ar' ? 'تم الحفظ' : 'Saved');
      setTimeout(() => setSuccess(''), 2000);
      loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" /></div>;

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 bg-success-50 dark:bg-success-900/30 text-success-600 dark:text-success-400 text-sm rounded-lg px-3 py-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" /><span>{success}</span>
        </div>
      )}
      <div className="card divide-y divide-[var(--color-border)]">
        {settings.map((setting) => (
          <div key={setting.id} className="py-4 first:pt-0 last:pb-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium text-[var(--color-text)]">{setting.key}</span>
                  {setting.is_public && (
                    <span className="text-xs bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 px-1.5 py-0.5 rounded-full">
                      {lang === 'ar' ? 'عام' : 'Public'}
                    </span>
                  )}
                </div>
                {setting.description && (
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{setting.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 sm:w-64">
                <input
                  type="text"
                  value={edits[setting.id] ?? ''}
                  onChange={(e) => setEdits({ ...edits, [setting.id]: e.target.value })}
                  className="input-field flex-1"
                />
                <button
                  onClick={() => handleSave(setting)}
                  disabled={saving === setting.id}
                  className="btn-primary !px-3 !py-2 flex items-center gap-1"
                >
                  {saving === setting.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
