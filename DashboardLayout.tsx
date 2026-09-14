import { useState, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import {
  LayoutDashboard, Users, FileText, Receipt, Calculator,
  Package, ArrowLeftRight, BarChart3, Clock, Settings,
  Shield, BookOpen, Menu, X, Sun, Moon, Contrast, Globe,
  LogOut, ChevronDown,
} from 'lucide-react';

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
  { code: 'settings', icon: Settings, labelKey: 'nav.settings' },
  { code: 'knowledge', icon: BookOpen, labelKey: 'nav.knowledge_center' },
  { code: 'owner', icon: Shield, labelKey: 'nav.owner_panel', ownerOnly: true },
];

interface DashboardLayoutProps {
  activeModule: string;
  onNavigate: (code: string) => void;
  children: ReactNode;
}

export default function DashboardLayout({ activeModule, onNavigate, children }: DashboardLayoutProps) {
  const { t, lang, setLang } = useI18n();
  const { mode, setMode } = useTheme();
  const { profile, tenant, isOwner, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const visibleItems = navItems.filter((item) => !item.ownerOnly || isOwner);
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
      <div className={`lg:${lang === 'ar' ? 'mr' : 'ml'}-64`}>
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-[var(--color-surface)] border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden btn-secondary !p-2"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="font-semibold text-[var(--color-text)]">
              {activeItem ? t(activeItem.labelKey) : ''}
            </h2>
          </div>

          <div className="flex items-center gap-2">
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
                    <button
                      onClick={() => {
                        signOut();
                        setUserMenuOpen(false);
                      }}
                      className="nav-item w-full text-error-600 dark:text-error-400"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>{t('auth.logout')}</span>
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
