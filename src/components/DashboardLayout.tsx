import { useState, useEffect, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import {
  LayoutDashboard, Users, FileText, Receipt, Calculator,
  Package, ArrowLeftRight, BarChart3, Clock, Settings,
  Shield, BookOpen, Brain, Menu, X, Sun, Moon, Contrast, Globe,
  LogOut, ChevronDown, HelpCircle, HandCoins, ScrollText, Fuel, Building, AlertCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface NavItem {
  code: string;
  icon: typeof LayoutDashboard;
  labelKey: string;
  ownerOnly?: boolean;
}

const navItems: NavItem[] = [
  { code: 'dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { code: 'contacts', icon: Users, labelKey: 'nav.contacts' },
  { code: 'invoices', icon: FileText, labelKey: 'nav.invoices' },
  { code: 'receipts', icon: Receipt, labelKey: 'nav.receipts' },
  { code: 'accounting', icon: Calculator, labelKey: 'nav.accounting' },
  { code: 'inventory', icon: Package, labelKey: 'nav.inventory' },
  { code: 'exchange', icon: ArrowLeftRight, labelKey: 'nav.exchange' },
  { code: 'reports', icon: BarChart3, labelKey: 'nav.reports' },
  { code: 'shifts', icon: Clock, labelKey: 'nav.shifts' },
  { code: 'zakat', icon: HandCoins, labelKey: 'nav.zakat' },
  { code: 'fuel', icon: Fuel, labelKey: 'nav.fuel' },
  { code: 'inheritance', icon: ScrollText, labelKey: 'nav.inheritance' },
  { code: 'fixed_assets', icon: Building, labelKey: 'nav.fixed_assets' },
  { code: 'settings', icon: Settings, labelKey: 'nav.settings' },
  { code: 'knowledge', icon: BookOpen, labelKey: 'nav.knowledge_center' },
  { code: 'help', icon: HelpCircle, labelKey: 'nav.user_guide' },
  { code: 'owner', icon: Shield, labelKey: 'nav.owner_panel', ownerOnly: true },
  { code: 'memory', icon: Brain, labelKey: 'nav.project_memory', ownerOnly: true },
];

interface DashboardLayoutProps {
  activeModule: string;
  onNavigate: (code: string) => void;
  children: ReactNode;
}

export default function DashboardLayout({ activeModule, onNavigate, children }: DashboardLayoutProps) {
  const { t, lang, setLang } = useI18n();
  const { mode, setMode } = useTheme();
  const { profile, tenant, isOwner, role, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [enabledAddons, setEnabledAddons] = useState<Set<string>>(new Set());
  const [logoutError, setLogoutError] = useState('');
  const [logoutBusy, setLogoutBusy] = useState(false);

  useEffect(() => {
    if (!profile?.tenant_id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('tenant_modules')
        .select('module_id, is_enabled, modules!inner(code)')
        .eq('tenant_id', profile.tenant_id!)
        .eq('is_enabled', true);
      if (cancelled || !data) return;
      const rows = (data ?? []) as { module_id: string; is_enabled: boolean; modules: { code: string }[] | { code: string } }[];
      const codes = new Set<string>();
      rows.forEach((tm) => {
        const mod = Array.isArray(tm.modules) ? tm.modules[0] : tm.modules;
        if (mod?.code) codes.add(mod.code);
      });
      setEnabledAddons(codes);
    })();
    return () => { cancelled = true; };
  }, [profile?.tenant_id]);

  const roleName = role?.name ?? (isOwner ? 'owner' : 'employee');

  const roleModules: Record<string, string[]> = {
    owner: ['dashboard', 'contacts', 'invoices', 'receipts', 'accounting', 'inventory', 'exchange', 'reports', 'shifts', 'zakat', 'fuel', 'inheritance', 'fixed_assets', 'settings', 'knowledge', 'help', 'owner', 'memory'],
    admin: ['dashboard', 'contacts', 'invoices', 'receipts', 'accounting', 'inventory', 'exchange', 'reports', 'shifts', 'zakat', 'fuel', 'inheritance', 'fixed_assets', 'settings', 'knowledge', 'help'],
    accountant: ['dashboard', 'contacts', 'invoices', 'receipts', 'accounting', 'reports', 'zakat', 'fixed_assets', 'settings', 'knowledge', 'help'],
    manager: ['dashboard', 'contacts', 'invoices', 'receipts', 'inventory', 'exchange', 'reports', 'shifts', 'fuel', 'inheritance', 'fixed_assets', 'settings', 'knowledge', 'help'],
    sales: ['dashboard', 'contacts', 'invoices', 'receipts', 'inventory', 'shifts', 'help'],
    purchasing: ['dashboard', 'contacts', 'invoices', 'inventory', 'help'],
    warehouse: ['dashboard', 'inventory', 'help'],
    cashier: ['dashboard', 'receipts', 'shifts', 'exchange', 'help'],
    exchange_agent: ['dashboard', 'exchange', 'shifts', 'help'],
    auditor: ['dashboard', 'reports', 'accounting', 'knowledge', 'help'],
    employee: ['dashboard', 'help'],
  };

  const ADDON_CODES = new Set(['zakat', 'fuel', 'inheritance']);
  const isModuleEnabled = (code: string) => {
    if (!ADDON_CODES.has(code)) return true;
    if (isOwner) return true;
    return enabledAddons.has(code);
  };

  const allowedModules = roleModules[roleName] ?? roleModules.employee;
  const visibleItems = navItems.filter((item) =>
    (!item.ownerOnly || isOwner) && allowedModules.includes(item.code) && isModuleEnabled(item.code)
  );
  const activeItem = visibleItems.find((i) => i.code === activeModule);

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 ${lang === 'ar' ? 'right-0' : 'left-0'} bottom-0 w-64 bg-[var(--color-sidebar)] border-${lang === 'ar' ? 'l' : 'r'} border-[var(--color-border)] z-40 transform transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen
            ? 'translate-x-0'
            : lang === 'ar'
              ? 'translate-x-full'
              : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2 px-4 py-4 border-b border-[var(--color-border)]">
          <div className="w-9 h-9 rounded-lg bg-primary-600 flex items-center justify-center shrink-0">
            <Calculator className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-sm text-[var(--color-text)] truncate">
              {lang === 'ar' ? 'محاسب الربيع العربي' : 'Arab Spring Accountant'}
            </div>
            {tenant && (
              <div className="text-xs text-[var(--color-text-muted)] truncate">
                {lang === 'ar' ? tenant.name_ar ?? tenant.name : tenant.name}
              </div>
            )}
          </div>
        </div>

        <nav className="p-3 space-y-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 60px)' }}>
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.code;
            return (
              <button
                key={item.code}
                onClick={() => {
                  onNavigate(item.code);
                  setSidebarOpen(false);
                }}
                className={`nav-item w-full ${isActive ? 'nav-item-active' : ''}`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{t(item.labelKey)}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div className={lang === 'ar' ? 'lg:mr-64 min-w-0 min-h-screen' : 'lg:ml-64 min-w-0 min-h-screen'}>
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-[var(--color-surface)] border-b border-[var(--color-border)] px-3 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden btn-secondary !p-2"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="font-semibold text-[var(--color-text)] truncate min-w-0">
              {activeItem ? t(activeItem.labelKey) : ''}
            </h2>
          </div>

          <div className="flex items-center justify-end gap-1 sm:gap-2 shrink-0">
            {/* Language toggle */}
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="btn-secondary !p-2"
              title={lang === 'ar' ? 'English' : 'العربية'}
            >
              <Globe className="w-4 h-4" />
            </button>

            {/* Theme toggle */}
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

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--color-bg)] transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-sm font-medium shrink-0">
                  {(profile?.full_name ?? profile?.email ?? '?')[0].toUpperCase()}
                </div>
                <span className="text-sm font-medium text-[var(--color-text)] hidden sm:block max-w-32 truncate">
                  {profile?.full_name ?? profile?.email}
                </span>
                <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)]" />
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute top-full mt-1 end-0 w-48 card !p-2 shadow-lg z-20 animate-scale-in">
                    <div className="px-3 py-2 border-b border-[var(--color-border)] mb-1">
                      <div className="text-sm font-medium text-[var(--color-text)] truncate">
                        {profile?.full_name ?? profile?.email}
                      </div>
                      {tenant && (
                        <div className="text-xs text-[var(--color-text-muted)] truncate">
                          {lang === 'ar' ? tenant.name_ar ?? tenant.name : tenant.name}
                        </div>
                      )}
                    </div>
                    {logoutError && <div role="alert" className="mx-2 mb-2 flex gap-2 text-xs text-error-600 dark:text-error-400"><AlertCircle className="w-4 h-4 shrink-0" /><span>{logoutError}</span></div>}
                    <button
                      disabled={logoutBusy}
                      onClick={async () => {
                        setLogoutBusy(true);
                        setLogoutError('');
                        try {
                          await signOut();
                          setUserMenuOpen(false);
                        } catch (error) {
                          console.error('[DashboardLayout] Sign-out failed:', error instanceof Error ? error.message : 'Unknown error');
                          setLogoutError(lang === 'ar' ? 'تعذر إنهاء الجلسة محليًا. تحقق من إعدادات المتصفح ثم أعد المحاولة.' : 'Could not clear the local session. Check browser settings and retry.');
                        } finally {
                          setLogoutBusy(false);
                        }
                      }}
                      className="nav-item w-full text-error-600 dark:text-error-400 disabled:opacity-50"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>{logoutBusy ? (lang === 'ar' ? 'جارٍ الخروج…' : 'Signing out…') : t('auth.logout')}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
