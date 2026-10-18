import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n-context';
import { useAuth } from '../lib/auth-context';
import { useTheme } from '../lib/theme-context';
import { supabase } from '../lib/supabase';
import type { Tenant } from '@/types/database';
import {
  Settings, Building2, MapPin, Coins, Save, Loader2,
  AlertCircle, CheckCircle2, Sun, Moon, Contrast, Globe, Pencil, Trash2, Star, Plus, X,
} from 'lucide-react';

type Tab = 'company' | 'branches' | 'warehouses' | 'currencies' | 'appearance';

export default function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const { mode, setMode } = useTheme();
  const { profile, tenant, refreshProfile } = useAuth();
  const [tab, setTab] = useState<Tab>('company');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [companyForm, setCompanyForm] = useState({
    name: '', name_ar: '', phone: '', address: '', base_currency: 'SAR',
  });

  useEffect(() => {
    if (tenant) {
      setCompanyForm({
        name: tenant.name,
        name_ar: tenant.name_ar ?? '',
        phone: (tenant.settings as Record<string, string>)?.phone ?? '',
        address: (tenant.settings as Record<string, string>)?.address ?? '',
        base_currency: (tenant.settings as Record<string, string>)?.base_currency ?? 'SAR',
      });
    }
  }, [tenant]);

  async function saveCompany() {
    if (!profile?.tenant_id || !tenant) {
      setError(lang === 'ar' ? 'تعذر تحديد المؤسسة المرتبطة بحسابك.' : 'Could not identify the tenant linked to your account.');
      return;
    }
    if (!companyForm.name.trim()) {
      setError(lang === 'ar' ? 'اسم الشركة مطلوب.' : 'Company name is required.');
      return;
    }
    setSaving(true); setError(''); setSuccess('');
    try {
      const rpcResult = await supabase.rpc('update_tenant_company_settings', {
        p_tenant_id: tenant.id,
        p_name: companyForm.name.trim(),
        p_name_ar: companyForm.name_ar.trim() || null,
        p_phone: companyForm.phone,
        p_address: companyForm.address,
        p_base_currency: companyForm.base_currency,
      });

      if (rpcResult.error && !['PGRST202', '42883'].includes(rpcResult.error.code ?? '')) {
        throw rpcResult.error;
      }

      // Compatibility while the reviewed migration is still unapplied:
      // use the existing RLS-protected update only if the RPC does not exist.
      if (rpcResult.error) {
        const { data, error: fallbackError } = await supabase.from('tenants').update({
          name: companyForm.name.trim(),
          name_ar: companyForm.name_ar.trim() || null,
          settings: { ...(tenant.settings ?? {}), phone: companyForm.phone, address: companyForm.address, base_currency: companyForm.base_currency },
        }).eq('id', tenant.id).select('id').maybeSingle();
        if (fallbackError) throw fallbackError;
        if (!data) throw new Error(lang === 'ar'
          ? 'لم يتم تحديث بيانات المؤسسة. السياسة الحالية تمنع تعديل مؤسسات المستأجرين العاديين؛ يلزم تطبيق Migration الصلاحيات بعد اختباره.'
          : 'Tenant settings were not updated. Current RLS blocks ordinary tenant edits; the reviewed permissions migration must be tested and applied.');
      } else if (!rpcResult.data) {
        throw new Error(lang === 'ar' ? 'لم يُرجع إجراء الحفظ معرّف المؤسسة.' : 'The save procedure did not return a tenant ID.');
      }
      await refreshProfile();
      setSuccess(lang === 'ar' ? 'تم الحفظ بنجاح' : 'Saved successfully');
    } catch (err) {
      const failure = err as { code?: string; message?: string };
      if (failure?.code === '42501') {
        setError(lang === 'ar'
          ? 'رفضت قاعدة البيانات التعديل بسياسة الصلاحيات الحالية. سياسة owner_update_tenants تسمح بتعديل سجل مؤسسة مالك النظام فقط؛ يلزم اعتماد سياسة آمنة أو إجراء مقيّد للدور المخوّل قبل تمكين تعديل مؤسسات المستأجرين.'
          : 'The database rejected this update under current permissions. owner_update_tenants only permits the system-owner tenant; a role-restricted policy or RPC is required to edit tenant companies safely.');
      } else {
        setError(failure?.message ?? t('error.generic'));
      }
    } finally { setSaving(false); }
  }

  const tabs: { code: Tab; icon: typeof Building2; label: string }[] = [
    { code: 'company', icon: Building2, label: lang === 'ar' ? 'الشركة' : 'Company' },
    { code: 'branches', icon: MapPin, label: lang === 'ar' ? 'الفروع' : 'Branches' },
    { code: 'warehouses', icon: Building2, label: lang === 'ar' ? 'المخازن' : 'Warehouses' },
    { code: 'currencies', icon: Coins, label: lang === 'ar' ? 'العملات' : 'Currencies' },
    { code: 'appearance', icon: Globe, label: lang === 'ar' ? 'المظهر' : 'Appearance' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center"><Settings className="w-5 h-5 text-white" /></div>
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">{t('nav.settings')}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'إعدادات النظام' : 'System settings'}</p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-2 border-b border-[var(--color-border)]">
        {tabs.map((tabItem) => {
          const Icon = tabItem.icon;
          return (
            <button key={tabItem.code} onClick={() => setTab(tabItem.code)} className={`nav-item !rounded-lg whitespace-nowrap ${tab === tabItem.code ? 'nav-item-active' : ''}`}>
              <Icon className="w-4 h-4" /><span>{tabItem.label}</span>
            </button>
          );
        })}
      </div>

      {error && <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg px-3 py-2"><AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span></div>}
      {success && <div className="flex items-center gap-2 bg-success-50 dark:bg-success-900/30 text-success-600 dark:text-success-400 text-sm rounded-lg px-3 py-2"><CheckCircle2 className="w-4 h-4 shrink-0" /><span>{success}</span></div>}

      {tab === 'company' && (
        <div className="card space-y-4 max-w-2xl">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'اسم الشركة' : 'Company Name'}</label>
              <input type="text" value={companyForm.name} onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'الاسم بالعربية' : 'Arabic Name'}</label>
              <input type="text" value={companyForm.name_ar} onChange={(e) => setCompanyForm({ ...companyForm, name_ar: e.target.value })} className="input-field" dir="rtl" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{t('common.phone')}</label>
              <input type="text" value={companyForm.phone} onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{t('common.currency')}</label>
              <select value={companyForm.base_currency} onChange={(e) => setCompanyForm({ ...companyForm, base_currency: e.target.value })} className="input-field">
                <option value="SAR">SAR</option><option value="YER">YER</option><option value="USD">USD</option><option value="AED">AED</option><option value="EGP">EGP</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">{lang === 'ar' ? 'العنوان' : 'Address'}</label>
            <input type="text" value={companyForm.address} onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })} className="input-field" />
          </div>
          <button onClick={saveCompany} disabled={saving} className="btn-primary flex items-center gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}{t('common.save')}</button>
        </div>
      )}

      {tab === 'branches' && <BranchesTab />}
      {tab === 'warehouses' && <WarehousesTab />}
      {tab === 'currencies' && <CurrenciesTab />}
      {tab === 'appearance' && (
        <div className="card space-y-4 max-w-2xl">
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">{lang === 'ar' ? 'اللغة' : 'Language'}</label>
            <div className="flex gap-2">
              <button onClick={() => setLang('ar')} className={`btn-secondary flex items-center gap-2 ${lang === 'ar' ? '!border-primary-500 !text-primary-600' : ''}`}><Globe className="w-4 h-4" />العربية</button>
              <button onClick={() => setLang('en')} className={`btn-secondary flex items-center gap-2 ${lang === 'en' ? '!border-primary-500 !text-primary-600' : ''}`}><Globe className="w-4 h-4" />English</button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">{lang === 'ar' ? 'المظهر' : 'Theme'}</label>
            <div className="flex gap-2">
              <button onClick={() => setMode('light')} className={`btn-secondary flex items-center gap-2 ${mode === 'light' ? '!border-primary-500 !text-primary-600' : ''}`}><Sun className="w-4 h-4" />{t('theme.light')}</button>
              <button onClick={() => setMode('dark')} className={`btn-secondary flex items-center gap-2 ${mode === 'dark' ? '!border-primary-500 !text-primary-600' : ''}`}><Moon className="w-4 h-4" />{t('theme.dark')}</button>
              <button onClick={() => setMode('high-contrast')} className={`btn-secondary flex items-center gap-2 ${mode === 'high-contrast' ? '!border-primary-500 !text-primary-600' : ''}`}><Contrast className="w-4 h-4" />{t('theme.high_contrast')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BranchesTab() {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const [branches, setBranches] = useState<{ id: string; name: string; name_ar: string | null; address: string | null; phone: string | null; is_active: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    const tid = profile?.tenant_id;
    if (!tid) { setLoading(false); return; }
    const { data } = await supabase.from('branches').select('*').eq('tenant_id', tid).order('created_at', { ascending: false });
    setBranches(data ?? []);
    setLoading(false);
  }
  async function add() {
    if (!name.trim() || !profile?.tenant_id) return;
    const { error } = await supabase.from('branches').insert({ tenant_id: profile.tenant_id, name: name.trim(), name_ar: nameAr.trim() || null, is_active: true });
    if (!error) { setName(''); setNameAr(''); load(); }
  }
  async function toggle(id: string, active: boolean) {
    await supabase.from('branches').update({ is_active: !active }).eq('id', id);
    load();
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" /></div>;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="card flex gap-2">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={lang === 'ar' ? 'اسم الفرع' : 'Branch name'} className="input-field" />
        <input type="text" value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder={lang === 'ar' ? 'بالعربية' : 'Arabic'} className="input-field" dir="rtl" />
        <button onClick={add} className="btn-primary flex items-center gap-1 shrink-0"><Save className="w-4 h-4" />{t('common.save')}</button>
      </div>
      {branches.length === 0 ? <div className="card text-center py-8 text-[var(--color-text-muted)]">{t('common.no_data')}</div> : (
        <div className="space-y-2">
          {branches.map((b) => (
            <div key={b.id} className="card flex items-center justify-between">
              <div><div className="font-medium text-[var(--color-text)]">{lang === 'ar' ? b.name_ar ?? b.name : b.name}</div>{b.address && <div className="text-xs text-[var(--color-text-muted)]">{b.address}</div>}</div>
              <button onClick={() => toggle(b.id, b.is_active)} className={`text-xs px-2 py-1 rounded-full ${b.is_active ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400'}`}>{b.is_active ? (lang === 'ar' ? 'نشط' : 'Active') : (lang === 'ar' ? 'متوقف' : 'Inactive')}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WarehousesTab() {
  const { t, lang } = useI18n();
  const { profile } = useAuth();
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; name_ar: string | null; code: string | null; is_active: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    const tid = profile?.tenant_id;
    if (!tid) { setLoading(false); return; }
    const { data } = await supabase.from('warehouses').select('*').eq('tenant_id', tid).order('created_at', { ascending: false });
    setWarehouses(data ?? []);
    setLoading(false);
  }
  async function add() {
    if (!name.trim() || !profile?.tenant_id) return;
    const { error } = await supabase.from('warehouses').insert({ tenant_id: profile.tenant_id, name: name.trim(), code: code.trim() || null, is_active: true });
    if (!error) { setName(''); setCode(''); load(); }
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" /></div>;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="card flex gap-2">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={lang === 'ar' ? 'اسم المخزن' : 'Warehouse name'} className="input-field" />
        <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder={lang === 'ar' ? 'كود' : 'Code'} className="input-field font-mono" />
        <button onClick={add} className="btn-primary flex items-center gap-1 shrink-0"><Save className="w-4 h-4" />{t('common.save')}</button>
      </div>
      {warehouses.length === 0 ? <div className="card text-center py-8 text-[var(--color-text-muted)]">{t('common.no_data')}</div> : (
        <div className="space-y-2">
          {warehouses.map((w) => (
            <div key={w.id} className="card flex items-center justify-between">
              <div><div className="font-medium text-[var(--color-text)]">{lang === 'ar' ? w.name_ar ?? w.name : w.name}</div>{w.code && <div className="text-xs text-[var(--color-text-muted)] font-mono">{w.code}</div>}</div>
              <span className={`text-xs px-2 py-1 rounded-full ${w.is_active ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400'}`}>{w.is_active ? (lang === 'ar' ? 'نشط' : 'Active') : (lang === 'ar' ? 'متوقف' : 'Inactive')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CurrenciesTab() {
  const { t, lang } = useI18n();
  const { profile, isOwner, role } = useAuth();
  const canManageCurrencies = isOwner || ['owner', 'admin'].includes((role?.name ?? '').toLowerCase());
  type CurrencyRow = {
    id: string; tenant_id: string | null; code: string; name: string; name_ar: string | null;
    symbol: string | null; decimals: number; is_base: boolean; is_active: boolean;
  };
  type CurrencyForm = { code: string; name: string; name_ar: string; symbol: string; decimals: number; is_active: boolean };
  const emptyForm: CurrencyForm = { code: '', name: '', name_ar: '', symbol: '', decimals: 2, is_active: true };
  const [currencies, setCurrencies] = useState<CurrencyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [editingCurrency, setEditingCurrency] = useState<CurrencyRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CurrencyForm>(emptyForm);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => { void load(); }, [profile?.tenant_id]);

  async function load() {
    setLoading(true);
    const tid = profile?.tenant_id;
    if (!tid) { setCurrencies([]); setLoading(false); return; }
    const { data, error: loadError } = await supabase
      .from('currencies').select('*').or(`tenant_id.eq.${tid},tenant_id.is.null`).order('code');
    if (loadError) {
      setError(loadError.message);
      setCurrencies([]);
    } else {
      setCurrencies((data as CurrencyRow[]) ?? []);
    }
    setLoading(false);
  }

  function openNew() {
    setEditingCurrency(null);
    setForm({ ...emptyForm });
    setError('');
    setNotice('');
    setFormOpen(true);
  }

  function openEdit(currency: CurrencyRow) {
    if (!profile?.tenant_id || currency.tenant_id !== profile.tenant_id) {
      setError(lang === 'ar' ? 'لا يمكن تعديل عملة النظام العامة من إعدادات المؤسسة.' : 'Global system currencies cannot be edited from tenant settings.');
      return;
    }
    setEditingCurrency(currency);
    setForm({
      code: currency.code, name: currency.name, name_ar: currency.name_ar ?? '',
      symbol: currency.symbol ?? '', decimals: Number(currency.decimals ?? 2), is_active: currency.is_active,
    });
    setError('');
    setNotice('');
    setFormOpen(true);
  }

  async function saveCurrency() {
    const tid = profile?.tenant_id;
    if (!tid) return;
    const code = form.code.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,8}$/.test(code) || !form.name.trim()) {
      setError(lang === 'ar' ? 'أدخل رمز عملة من 2 إلى 8 أحرف/أرقام واسمًا مطلوبًا.' : 'Enter a 2–8 character currency code and a name.');
      return;
    }
    const duplicate = currencies.some((currency) =>
      currency.tenant_id === profile?.tenant_id &&
      currency.code.toUpperCase() === code &&
      currency.id !== editingCurrency?.id
    );
    if (duplicate) {
      setError(lang === 'ar' ? 'رمز العملة موجود بالفعل في مؤسستك.' : 'That currency code already exists for this tenant.');
      return;
    }
    if (!Number.isInteger(form.decimals) || form.decimals < 0 || form.decimals > 6) {
      setError(lang === 'ar' ? 'عدد المنازل العشرية يجب أن يكون بين 0 و6.' : 'Decimal places must be between 0 and 6.');
      return;
    }
    if (editingCurrency && editingCurrency.tenant_id !== tid) {
      setError(lang === 'ar' ? 'لا يمكن تعديل عملة عامة من هنا.' : 'A global currency cannot be edited here.');
      return;
    }
    setSaving(true); setError(''); setNotice('');
    try {
      const payload = {
        tenant_id: tid, code, name: form.name.trim(), name_ar: form.name_ar.trim() || null,
        symbol: form.symbol.trim() || null, decimals: form.decimals, is_active: form.is_active,
      };
      if (editingCurrency) {
        const { data, error: updateError } = await supabase.from('currencies').update(payload)
          .eq('id', editingCurrency.id).eq('tenant_id', tid).select('id').maybeSingle();
        if (updateError) throw updateError;
        if (!data) throw new Error(lang === 'ar' ? 'لم يتم تعديل العملة؛ تحقق من الصلاحيات.' : 'Currency was not updated; check permissions.');
      } else {
        const { error: insertError } = await supabase.from('currencies').insert({ ...payload, is_base: false });
        if (insertError) throw insertError;
      }
      setFormOpen(false);
      setNotice(lang === 'ar' ? 'تم حفظ العملة.' : 'Currency saved.');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('error.generic'));
    } finally {
      setSaving(false);
    }
  }

  async function deleteCurrency(currency: CurrencyRow) {
    const tid = profile?.tenant_id;
    if (!tid || currency.tenant_id !== tid) {
      setError(lang === 'ar' ? 'لا يمكن حذف عملة النظام العامة.' : 'Global system currencies cannot be deleted here.');
      return;
    }
    if (currency.is_base) {
      setError(lang === 'ar' ? 'عيّن عملة أخرى كافتراضية أولًا.' : 'Set another tenant currency as default first.');
      return;
    }
    const confirmed = window.confirm(lang === 'ar'
      ? `هل تريد حذف العملة ${currency.code}؟`
      : `Delete currency ${currency.code}?`);
    if (!confirmed) return;
    setDeletingId(currency.id); setError(''); setNotice('');
    const { data, error: deleteError } = await supabase.from('currencies').delete()
      .eq('id', currency.id).eq('tenant_id', tid).select('id').maybeSingle();
    if (deleteError || !data) {
      setError(deleteError?.message ?? (lang === 'ar' ? 'لم يتم حذف العملة؛ قد تكون مستخدمة في معاملات أو تمنع الصلاحيات ذلك.' : 'Currency was not deleted; it may be in use or permissions may prevent deletion.'));
    } else {
      setNotice(lang === 'ar' ? 'تم حذف العملة.' : 'Currency deleted.');
      await load();
    }
    setDeletingId('');
  }

  async function setDefaultCurrency(currency: CurrencyRow) {
    const tid = profile?.tenant_id;
    if (!tid || currency.tenant_id !== tid) {
      setError(lang === 'ar' ? 'يمكن تعيين العملة الافتراضية من العملات الخاصة بالمؤسسة فقط.' : 'Only a tenant-owned currency can be set as the default here.');
      return;
    }
    setError(''); setNotice('');
    const previousBase = currencies.find((item) => item.tenant_id === tid && item.is_base);
    const { error: clearError } = await supabase.from('currencies').update({ is_base: false }).eq('tenant_id', tid).neq('id', currency.id);
    if (clearError) {
      setError(clearError.message);
      return;
    }
    const { data, error: setErrorResult } = await supabase.from('currencies').update({ is_base: true })
      .eq('id', currency.id).eq('tenant_id', tid).select('id').maybeSingle();
    if (setErrorResult || !data) {
      if (previousBase) {
        const { error: restoreError } = await supabase.from('currencies').update({ is_base: true }).eq('id', previousBase.id).eq('tenant_id', tid);
        if (restoreError) console.error('[SettingsPage] Could not restore previous base currency:', restoreError.message);
      }
      setError(setErrorResult?.message ?? (lang === 'ar' ? 'لم يتم تعيين العملة الافتراضية.' : 'Default currency was not updated.'));
      return;
    }
    setNotice(lang === 'ar' ? 'تم تعيين العملة الافتراضية.' : 'Default currency updated.');
    await load();
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" /></div>;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'إدارة عملات المؤسسة. العملات العامة للعرض فقط.' : 'Manage tenant currencies. Global currencies are read-only here.'}</p>
        {canManageCurrencies && <button type="button" onClick={openNew} className="btn-primary flex items-center gap-2 shrink-0"><Plus className="w-4 h-4" />{lang === 'ar' ? 'إضافة عملة' : 'Add currency'}</button>}
      </div>
      {error && <div role="alert" className="flex items-start gap-2 rounded-lg bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm p-3"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span></div>}
      {notice && <div role="status" className="flex items-start gap-2 rounded-lg bg-success-50 dark:bg-success-900/30 text-success-700 dark:text-success-400 text-sm p-3"><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /><span>{notice}</span></div>}

      {formOpen && <div className="card space-y-4">
        <div className="flex items-center justify-between"><h3 className="font-semibold">{editingCurrency ? (lang === 'ar' ? 'تعديل العملة' : 'Edit currency') : (lang === 'ar' ? 'إضافة عملة' : 'Add currency')}</h3><button type="button" onClick={() => setFormOpen(false)} className="btn-secondary !p-2" aria-label={lang === 'ar' ? 'إغلاق' : 'Close'}><X className="w-4 h-4" /></button></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><label className="block text-sm mb-1">{lang === 'ar' ? 'رمز العملة' : 'Currency code'} *</label><input maxLength={8} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="input-field" required /></div>
          <div><label className="block text-sm mb-1">{lang === 'ar' ? 'الاسم' : 'Name'} *</label><input maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" required /></div>
          <div><label className="block text-sm mb-1">{lang === 'ar' ? 'الاسم بالعربية' : 'Arabic name'}</label><input maxLength={100} dir="auto" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} className="input-field" /></div>
          <div><label className="block text-sm mb-1">{lang === 'ar' ? 'الرمز المختصر' : 'Symbol'} </label><input maxLength={8} value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} className="input-field" /></div>
          <div><label className="block text-sm mb-1">{lang === 'ar' ? 'المنازل العشرية' : 'Decimal places'}</label><input type="number" min="0" max="6" step="1" value={form.decimals} onChange={(e) => setForm({ ...form, decimals: Number(e.target.value) })} className="input-field" /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />{lang === 'ar' ? 'عملة نشطة' : 'Active currency'}</label>
        </div>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setFormOpen(false)} className="btn-secondary">{t('common.cancel')}</button><button type="button" onClick={saveCurrency} disabled={saving} className="btn-primary flex items-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />}<Save className="w-4 h-4" />{t('common.save')}</button></div>
      </div>}

      {currencies.length === 0 ? <div className="card text-center py-8 text-[var(--color-text-muted)]">{t('common.no_data')}</div> : (
        <div className="space-y-2">
          {currencies.map((currency) => {
            const isTenantCurrency = currency.tenant_id === profile?.tenant_id;
            return <div key={currency.id} className="card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0"><Coins className="w-5 h-5 text-primary-600 dark:text-primary-400" /></div>
                <div className="min-w-0"><div className="font-medium text-[var(--color-text)]">{currency.code} {currency.symbol ?? ''}</div><div className="text-xs text-[var(--color-text-muted)]">{lang === 'ar' ? currency.name_ar ?? currency.name : currency.name}</div><div className="text-xs text-[var(--color-text-muted)]">{isTenantCurrency ? (lang === 'ar' ? 'عملة المؤسسة' : 'Tenant currency') : (lang === 'ar' ? 'عملة عامة' : 'Global currency')}</div></div>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {currency.is_base && <span className="text-xs px-2 py-1 rounded-full bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400">{lang === 'ar' ? 'افتراضية' : 'Default'}</span>}
                <span className={`text-xs px-2 py-1 rounded-full ${currency.is_active ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400'}`}>{currency.is_active ? (lang === 'ar' ? 'نشطة' : 'Active') : (lang === 'ar' ? 'متوقفة' : 'Inactive')}</span>
                {isTenantCurrency && canManageCurrencies && <><button type="button" onClick={() => openEdit(currency)} className="btn-secondary !p-2" title={lang === 'ar' ? 'تعديل' : 'Edit'} aria-label={lang === 'ar' ? 'تعديل' : 'Edit'}><Pencil className="w-4 h-4" /></button><button type="button" onClick={() => void setDefaultCurrency(currency)} disabled={currency.is_base || !currency.is_active} className="btn-secondary !p-2 disabled:opacity-40" title={lang === 'ar' ? 'تعيين كافتراضية' : 'Set as default'} aria-label={lang === 'ar' ? 'تعيين كافتراضية' : 'Set as default'}><Star className="w-4 h-4" /></button><button type="button" onClick={() => void deleteCurrency(currency)} disabled={currency.is_base || deletingId === currency.id} className="btn-secondary !p-2 text-error-600 disabled:opacity-40" title={lang === 'ar' ? 'حذف' : 'Delete'} aria-label={lang === 'ar' ? 'حذف' : 'Delete'}><Trash2 className="w-4 h-4" /></button></>}
              </div>
            </div>;
          })}
        </div>
      )}
    </div>
  );
}