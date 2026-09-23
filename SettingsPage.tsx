import { useEffect, useState } from 'react';
import { useI18n } from './i18n-context';
import { useAuth } from './auth-context';
import { useTheme } from './theme-context';
import { supabase } from './supabase';
import type { Tenant } from './types/database';
import {
  Settings, Building2, MapPin, Coins, Save, Loader2,
  AlertCircle, CheckCircle2, Sun, Moon, Contrast, Globe,
} from 'lucide-react';

type Tab = 'company' | 'branches' | 'warehouses' | 'currencies' | 'appearance';

export default function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const { mode, setMode } = useTheme();
  const { profile, tenant } = useAuth();
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
    if (!profile?.tenant_id || !tenant) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      const { error: e } = await supabase.from('tenants').update({
        name: companyForm.name.trim(),
        name_ar: companyForm.name_ar.trim() || null,
        settings: { ...tenant.settings, phone: companyForm.phone, address: companyForm.address, base_currency: companyForm.base_currency },
      }).eq('id', tenant.id);
      if (e) throw e;
      setSuccess(lang === 'ar' ? 'تم الحفظ بنجاح' : 'Saved successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.generic'));
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
  const { profile } = useAuth();
  const [currencies, setCurrencies] = useState<{ id: string; code: string; name: string; name_ar: string | null; is_base: boolean; is_active: boolean }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    const tid = profile?.tenant_id;
    if (!tid) { setLoading(false); return; }
    const { data } = await supabase.from('currencies').select('*').or(`tenant_id.eq.${tid},tenant_id.is.null`).order('code');
    setCurrencies(data ?? []);
    setLoading(false);
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" /></div>;

  return (
    <div className="space-y-4 max-w-2xl">
      {currencies.length === 0 ? <div className="card text-center py-8 text-[var(--color-text-muted)]">{t('common.no_data')}</div> : (
        <div className="space-y-2">
          {currencies.map((c) => (
            <div key={c.id} className="card flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center"><Coins className="w-5 h-5 text-primary-600 dark:text-primary-400" /></div>
                <div><div className="font-medium text-[var(--color-text)]">{c.code}</div><div className="text-xs text-[var(--color-text-muted)]">{lang === 'ar' ? c.name_ar ?? c.name : c.name}</div></div>
              </div>
              <div className="flex gap-1">
                {c.is_base && <span className="text-xs px-2 py-1 rounded-full bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400">{lang === 'ar' ? 'أساسية' : 'Base'}</span>}
                <span className={`text-xs px-2 py-1 rounded-full ${c.is_active ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400'}`}>{c.is_active ? (lang === 'ar' ? 'نشط' : 'Active') : (lang === 'ar' ? 'متوقف' : 'Inactive')}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
