import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n-context';
import { useAuth } from '../lib/auth-context';
import { useTheme } from '../lib/theme-context';
import { supabase } from '../lib/supabase';
import type { Tenant } from './types/database';
import {
  Settings, Building2, MapPin, Coins, Save, Loader2,
  AlertCircle, CheckCircle2, Sun, Moon, Contrast, Globe,
} from 'lucide-react';

type Tab = 'company' | 'branches' | 'warehouses' | 'currencies' | 'appearance';

export default function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const { mode, setMode } = useTheme();
  const { tenant, refreshProfile } = useAuth();
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
    if (!tenant) {
      setError(lang === 'ar' ? 'تعذر تحديد المؤسسة الحالية. لم يتم حفظ التغييرات.' : 'The current organization could not be resolved. Changes were not saved.');
      return;
    }
    const name = companyForm.name.trim();
    if (!name) {
      setError(lang === 'ar' ? 'اسم الشركة مطلوب.' : 'Company name is required.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { data: savedCompany, error: saveError } = await supabase.rpc(
        'update_current_tenant_company_settings',
        {
          p_tenant_id: tenant.id,
          p_name: name,
          p_name_ar: companyForm.name_ar.trim() || null,
          p_phone: companyForm.phone,
          p_address: companyForm.address,
          p_base_currency: companyForm.base_currency,
        }
      );
      if (saveError) throw saveError;
      if (!savedCompany || typeof savedCompany !== 'object' || !('id' in savedCompany)) {
        throw new Error(lang === 'ar'
          ? 'لم تؤكد قاعدة البيانات حفظ بيانات المؤسسة.'
          : 'The database did not confirm that company settings were saved.');
      }
      await refreshProfile();
      setSuccess(lang === 'ar'
        ? 'تم حفظ بيانات المؤسسة والتحقق من قاعدة البيانات.'
        : 'Company settings saved and confirmed by the database.');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.generic'));
    } finally {
      setSaving(false);
    }
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
  const { tenant } = useAuth();
  type CurrencyRecord = {
    id: string;
    tenant_id: string | null;
    code: string;
    name: string;
    name_ar: string | null;
    symbol: string | null;
    is_base: boolean;
    is_active: boolean;
    decimals: number;
  };
  const [currencies, setCurrencies] = useState<CurrencyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<CurrencyRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', name_ar: '', symbol: '', decimals: '2', is_active: true });

  useEffect(() => { void load(); }, [tenant?.id]);

  async function load() {
    setLoading(true);
    setError('');
    const tid = tenant?.id;
    if (!tid) {
      setCurrencies([]);
      setError(lang === 'ar' ? 'تعذر تحديد المؤسسة الحالية.' : 'The current organization could not be resolved.');
      setLoading(false);
      return;
    }
    const { data, error: loadError } = await supabase
      .from('currencies')
      .select('*')
      .or(`tenant_id.eq.${tid},tenant_id.is.null`)
      .order('code');
    if (loadError) {
      setError(loadError.message);
      setCurrencies([]);
    } else {
      setCurrencies((data as CurrencyRecord[]) ?? []);
    }
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setForm({ code: '', name: '', name_ar: '', symbol: '', decimals: '2', is_active: true });
    setError('');
    setFormOpen(true);
  }

  function openEdit(currency: CurrencyRecord) {
    if (!tenant?.id || currency.tenant_id !== tenant.id) return;
    setEditing(currency);
    setForm({
      code: currency.code,
      name: currency.name,
      name_ar: currency.name_ar ?? '',
      symbol: currency.symbol ?? '',
      decimals: String(currency.decimals ?? 2),
      is_active: currency.is_active,
    });
    setError('');
    setFormOpen(true);
  }

  async function saveCurrency() {
    if (!tenant?.id) {
      setError(lang === 'ar' ? 'تعذر تحديد المؤسسة الحالية.' : 'The current organization could not be resolved.');
      return;
    }
    const code = form.code.trim().toUpperCase();
    const name = form.name.trim();
    if (!code || !name) {
      setError(lang === 'ar' ? 'رمز العملة واسمها مطلوبان.' : 'Currency code and name are required.');
      return;
    }
    const decimals = Number(form.decimals);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) {
      setError(lang === 'ar' ? 'عدد المنازل العشرية يجب أن يكون بين 0 و6.' : 'Decimal places must be an integer from 0 to 6.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        tenant_id: tenant.id,
        code,
        name,
        name_ar: form.name_ar.trim() || null,
        symbol: form.symbol.trim() || null,
        decimals,
        is_active: form.is_active,
        is_base: editing?.is_base ?? false,
      };
      if (editing) {
        const { data, error: updateError } = await supabase
          .from('currencies')
          .update(payload)
          .eq('id', editing.id)
          .eq('tenant_id', tenant.id)
          .select('*')
          .maybeSingle();
        if (updateError) throw updateError;
        if (!data) throw new Error(lang === 'ar'
          ? 'لم يتم حفظ العملة: لا توجد صلاحية لتعديل هذا السجل أو لم يُعثر عليه.'
          : 'Currency was not saved: update was not authorized or no matching row was found.');
      } else {
        const { data, error: insertError } = await supabase
          .from('currencies')
          .insert(payload)
          .select('*')
          .single();
        if (insertError) throw insertError;
        if (!data) throw new Error(lang === 'ar' ? 'لم تُرجع قاعدة البيانات العملة المحفوظة.' : 'The database did not return the saved currency.');
      }
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error.generic'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-muted)]" /></div>;

  return (
    <div className="space-y-4 max-w-2xl">
      {error && <div role="alert" className="flex items-start gap-2 rounded-lg bg-error-50 dark:bg-error-900/30 p-3 text-sm text-error-700 dark:text-error-300"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span></div>}
      <div className="flex justify-end">
        <button type="button" onClick={openCreate} className="btn-primary">{lang === 'ar' ? 'إضافة عملة' : 'Add currency'}</button>
      </div>
      {formOpen && (
        <div className="card space-y-3">
          <h3 className="font-semibold text-[var(--color-text)]">{editing ? (lang === 'ar' ? 'تعديل العملة' : 'Edit currency') : (lang === 'ar' ? 'عملة جديدة' : 'New currency')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="block text-sm mb-1">{lang === 'ar' ? 'رمز العملة *' : 'Currency code *'}</label><input maxLength={8} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="input-field uppercase" /></div>
            <div><label className="block text-sm mb-1">{lang === 'ar' ? 'الاسم *' : 'Name *'}</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm mb-1">{lang === 'ar' ? 'الاسم بالعربية' : 'Arabic name'}</label><input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} className="input-field" dir="rtl" /></div>
            <div><label className="block text-sm mb-1">{lang === 'ar' ? 'الرمز المختصر' : 'Symbol'}</label><input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} className="input-field" /></div>
            <div><label className="block text-sm mb-1">{lang === 'ar' ? 'المنازل العشرية (0–6)' : 'Decimal places (0–6)'}</label><input type="number" min="0" max="6" step="1" value={form.decimals} onChange={(e) => setForm({ ...form, decimals: e.target.value })} className="input-field" /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />{lang === 'ar' ? 'عملة نشطة' : 'Active currency'}</label>
          </div>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setFormOpen(false)} className="btn-secondary">{t('common.cancel')}</button><button type="button" onClick={() => void saveCurrency()} disabled={saving} className="btn-primary">{saving ? (lang === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : t('common.save')}</button></div>
        </div>
      )}
      {currencies.length === 0 ? <div className="card text-center py-8 text-[var(--color-text-muted)]">{t('common.no_data')}</div> : (
        <div className="space-y-2">
          {currencies.map((currency) => (
            <div key={currency.id} className="card flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0"><Coins className="w-5 h-5 text-primary-600 dark:text-primary-400" /></div>
                <div className="min-w-0"><div className="font-medium text-[var(--color-text)]">{currency.code} {currency.symbol ? `· ${currency.symbol}` : ''}</div><div className="text-xs text-[var(--color-text-muted)]">{lang === 'ar' ? currency.name_ar ?? currency.name : currency.name}</div></div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {currency.is_base && <span className="text-xs px-2 py-1 rounded-full bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400">{lang === 'ar' ? 'أساسية' : 'Base'}</span>}
                <span className={`text-xs px-2 py-1 rounded-full ${currency.is_active ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400'}`}>{currency.is_active ? (lang === 'ar' ? 'نشط' : 'Active') : (lang === 'ar' ? 'متوقف' : 'Inactive')}</span>
                {currency.tenant_id === tenant?.id && <button type="button" onClick={() => openEdit(currency)} className="btn-secondary !p-2">{lang === 'ar' ? 'تعديل' : 'Edit'}</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}