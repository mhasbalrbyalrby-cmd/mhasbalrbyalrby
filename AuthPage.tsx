import { useState, type FormEvent } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { useTheme } from '@/lib/theme-context';
import { supabase } from '@/lib/supabase';
import { Calculator, Sun, Moon, Contrast, Globe, Loader2, AlertCircle } from 'lucide-react';

export default function AuthPage() {
  const { t, lang, setLang } = useI18n();
  const { mode, setMode } = useTheme();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!isLogin && password !== confirmPassword) {
      setError(t('auth.password_mismatch'));
      return;
    }

    if (password.length < 6) {
      setError(t('auth.password_too_short'));
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        setSuccess(t('auth.signup_success'));
        setIsLogin(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.invalid_credentials'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-bg)]">
      {/* Top bar */}
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
          <button
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            className="btn-secondary !p-2"
            title={lang === 'ar' ? 'English' : 'العربية'}
          >
            <Globe className="w-4 h-4" />
          </button>
          {mode === 'light' && (
            <button onClick={() => setMode('dark')} className="btn-secondary !p-2" title={t('theme.dark')}>
              <Moon className="w-4 h-4" />
            </button>
          )}
          {mode === 'dark' && (
            <button onClick={() => setMode('high-contrast')} className="btn-secondary !p-2" title={t('theme.high_contrast')}>
              <Contrast className="w-4 h-4" />
            </button>
          )}
          {mode === 'high-contrast' && (
            <button onClick={() => setMode('light')} className="btn-secondary !p-2" title={t('theme.light')}>
              <Sun className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Center */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md animate-slide-up">
          <div className="card shadow-lg">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-primary-600 flex items-center justify-center mx-auto mb-3">
                <Calculator className="w-9 h-9 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-[var(--color-text)]">
                {isLogin ? t('auth.login') : t('auth.signup')}
              </h1>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                {t('app.tagline')}
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-error-50 dark:bg-error-900/30 text-error-600 dark:text-error-400 text-sm rounded-lg px-3 py-2 mb-4 animate-fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="bg-success-50 dark:bg-success-900/30 text-success-600 dark:text-success-400 text-sm rounded-lg px-3 py-2 mb-4 animate-fade-in">
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
                    {t('auth.full_name')}
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="input-field"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
                  {t('auth.email')}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
                  {t('auth.password')}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field"
                  required
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                />
              </div>

              {!isLogin && (
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1.5">
                    {t('auth.confirm_password')}
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input-field"
                    required
                    autoComplete="new-password"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {isLogin ? t('auth.login_button') : t('auth.signup_button')}
              </button>
            </form>

            <div className="text-center mt-4 text-sm">
              <span className="text-[var(--color-text-muted)]">
                {isLogin ? t('auth.no_account') : t('auth.have_account')}
              </span>
              <button
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError('');
                  setSuccess('');
                }}
                className="text-primary-600 dark:text-primary-400 font-medium ms-1 hover:underline"
              >
                {isLogin ? t('auth.create_account_link') : t('auth.login_link')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <footer className="text-center text-xs text-[var(--color-text-muted)] py-4">
        {lang === 'ar' ? 'محاسب الربيع العربي - نظام ERP متكامل' : 'Arab Spring Accountant - Complete ERP System'}
      </footer>
    </div>
  );
}
