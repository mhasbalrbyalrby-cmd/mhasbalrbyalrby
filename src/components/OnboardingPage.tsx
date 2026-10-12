import { useState, type FormEvent } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Calculator, Loader2, AlertCircle, Building2, CheckCircle2, Sun, Moon, Contrast, Globe } from 'lucide-react';

export default function OnboardingPage() {
  const { t, lang, setLang } = useI18n();
  const { mode, setMode } = useTheme();
  const { user, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError(lang === 'ar' ? 'اسم المؤسسة مطلوب' : 'Organization name is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { error: rpcError } = await supabase.rpc('create_tenant_for_user', {
        p_name: name.trim(),
        p_name_ar: nameAr.trim() || null,
        p_phone: phone.trim() || null,
        p_address: address.trim() || null,
      });
      if (rpcError) throw rpcError;
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.generic'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-bg)]">
      <div className="flex justify-between items-center px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center">
            <Calculator className="w-6 h-6 text-white" />
          </div>
          <span className="font-bold text-lg text-[var(--color-text)]">
            {lang === 'ar' ? 'محاسب الربيع العربي' : 'Arab Spring Accountant'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="btn-secondary !p-2" title={lang === 'ar' ? 'English' : 'العربية'}>
            <Globe className="w-4 h-4" />
          </button>
          {mode === 'light' && <button onClick={() => setMode('dark')} className="btn-secondary !p-2"><Moon className="w-4 h-4" /></button>}
          {mode === 'dark' && <button onClick={() => setMode('high-contrast')} className="btn-secondary !p-2"><Contrast className="w-4 h-4" /></button>}
          {mode === 'high-contrast' && <button onClick={() => setMode('light')} className="btn-secondary !p-2"><Sun className="w-4 h-4" /></button>}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg animate-slide-up">
          <div className="card shadow-lg">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-primary-600 flex items-center justify-center mx-auto mb-3">
                <Building2 className="w-9 h-9 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-[var(--color-text)]">
                {lang === 'ar' ? 'إنشاء مؤسستك' : 'Create Your Organization'}
              </h1>
              <p className="text-sm text-[var(--color-text-muted)] mt-2">
                {lang === 'ar'
                  ? 'مرحبًا! لإكمال إعداد حسابك، أنشئ مؤسستك وستصبح مالكها تلقائيًا.'
                  : 'Welcome! To complete your account setup, create your organization and become its owner.'}
              </p>
            </div>

            <div className="bg-accent-50 dark:bg-accent-900/20 text-accent-700 dark:text-accent-300 text-sm rounded-lg px-4 py-3 mb-4 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {lang === 'ar'
                  ? 'ستحصل على صلاحيات مالك المؤسسة لإدارة فريقك وبياناتك. لا يمكن لأي مستأجر الاطلاع على بيانات مؤسسة أخرى.'
                  : "You'll get owner privileges to manage your team and data. No tenant can access another tenant's data."}
              </span>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg px-3 py-2 mb-4">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
                  {lang === 'ar' ? 'اسم المؤسسة' : 'Organization Name'} *
                </label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" required placeholder={lang === 'ar' ? 'مؤسسة التجارة' : 'Acme Trading'} />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
                  {lang === 'ar' ? 'الاسم بالعربية' : 'Arabic Name'}
                </label>
                <input type="text" value={nameAr} onChange={(e) => setNameAr(e.target.value)} className="input-field" dir="rtl" placeholder="مؤسسة التجارة" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
                    {lang === 'ar' ? 'الهاتف' : 'Phone'}
                  </label>
                  <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
                    {lang === 'ar' ? 'العنوان' : 'Address'}
                  </label>
                  <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="input-field" />
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
                {lang === 'ar' ? 'إنشاء المؤسسة' : 'Create Organization'}
              </button>
            </form>

            <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
              <button onClick={() => signOut()} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
                {t('auth.logout')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
