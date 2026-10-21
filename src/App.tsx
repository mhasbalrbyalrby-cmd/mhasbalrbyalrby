import { useState } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import GuestTour from '@/components/GuestTour';
import { I18nProvider } from '@/lib/i18n-context';
import { ThemeProvider } from '@/lib/theme-context';
import AuthPage from '@/components/AuthPage';
import OnboardingPage from '@/components/OnboardingPage';
import DashboardLayout from '@/components/DashboardLayout';
import DashboardPage from '@/pages/DashboardPage';
import OwnerPanelPage from '@/pages/OwnerPanelPage';
import ProjectMemoryPage from '@/pages/ProjectMemoryPage';
import KnowledgeCenterPage from '@/pages/KnowledgeCenterPage';
import ContactsPage from '@/pages/ContactsPage';
import AccountingPage from '@/pages/AccountingPage';
import InvoicesPage from '@/pages/InvoicesPage';
import InventoryPage from '@/pages/InventoryPage';
import ReceiptsPage from '@/pages/ReceiptsPage';
import ExchangePage from '@/pages/ExchangePage';
import ShiftsPage from '@/pages/ShiftsPage';
import SettingsPage from '@/pages/SettingsPage';
import ReportsPage from '@/pages/ReportsPage';
import HelpGuidePage from '@/pages/HelpGuidePage';
import ZakatPage from '@/pages/ZakatPage';
import InheritancePage from '@/pages/InheritancePage';
import FuelPage from '@/pages/FuelPage';
import FixedAssetsPage from '@/pages/FixedAssetsPage';
import { Loader2, AlertCircle, UserX, LogOut } from 'lucide-react';

import { canAccessModule, normalizeRoleName } from '@/lib/module-access';

function AppContent() {
  const { user, loading, configError, authError, authReady, signOut, isOwner, role } = useAuth();
  const [activeModule, setActiveModule] = useState('dashboard');
  const [guestTour, setGuestTour] = useState(false);

  const roleName = normalizeRoleName(role?.name, role?.name_ar, isOwner);
  const safeActiveModule = canAccessModule(activeModule, roleName, isOwner) ? activeModule : 'dashboard';
  const navigateToAllowedModule = (moduleCode: string) => {
    setActiveModule(canAccessModule(moduleCode, roleName, isOwner) ? moduleCode : 'dashboard');
  };

  if (guestTour) {
    return <GuestTour onExit={() => setGuestTour(false)} />;
  }

  if (configError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] p-4">
        <div className="card max-w-md text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-error-100 flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-error-600" />
          </div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">
            خطأ في إعدادات الاتصال
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">{configError}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage onGuestTour={() => setGuestTour(true)} />;
  }

  if (authError === 'no_tenant' && !authReady) {
    return <OnboardingPage />;
  }

  if (authError && !authReady) {
    const errorMessages: Record<string, { title: string; desc: string; icon: typeof UserX }> = {
      profile_not_found: {
        title: 'لم يتم العثور على ملفك الشخصي',
        desc: 'قد يكون هناك تأخير في إنشاء حسابك. حاول تسجيل الدخول مرة أخرى، أو تواصل مع الإدارة.',
        icon: UserX,
      },
      no_membership: {
        title: 'عضويتك غير مفعلة',
        desc: 'لم يتم العثور على عضويتك في المؤسسة. تواصل مع مدير المؤسسة لتفعيل حسابك.',
        icon: UserX,
      },
      load_failed: {
        title: 'تعذر تحميل بيانات الحساب',
        desc: 'حدث خطأ أثناء تحميل بياناتك. تحقق من الاتصال بالإنترنت وحاول مرة أخرى.',
        icon: AlertCircle,
      },
      session_failed: {
        title: 'تعذر استرداد الجلسة',
        desc: 'حدث خطأ في الاتصال بالخادم. تحقق من الاتصال بالإنترنت وحاول مرة أخرى.',
        icon: AlertCircle,
      },
    };
    const info = errorMessages[authError] ?? errorMessages.load_failed;
    const Icon = info.icon;

    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] p-4">
        <div className="card max-w-md text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-warning-100 flex items-center justify-center mx-auto">
            <Icon className="w-8 h-8 text-warning-600" />
          </div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">{info.title}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">{info.desc}</p>
          <button onClick={() => signOut()} className="btn-secondary flex items-center gap-2 mx-auto">
            <LogOut className="w-4 h-4" />
            تسجيل الخروج
          </button>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout activeModule={safeActiveModule} onNavigate={navigateToAllowedModule}>
      {safeActiveModule === 'dashboard' && <DashboardPage onNavigate={navigateToAllowedModule} />}
      {safeActiveModule === 'owner' && <OwnerPanelPage />}
      {safeActiveModule === 'memory' && <ProjectMemoryPage />}
      {safeActiveModule === 'knowledge' && <KnowledgeCenterPage />}
      {safeActiveModule === 'contacts' && <ContactsPage />}
      {safeActiveModule === 'accounting' && <AccountingPage />}
      {safeActiveModule === 'invoices' && <InvoicesPage />}
      {safeActiveModule === 'inventory' && <InventoryPage />}
      {safeActiveModule === 'receipts' && <ReceiptsPage />}
      {safeActiveModule === 'exchange' && <ExchangePage />}
      {safeActiveModule === 'shifts' && <ShiftsPage />}
      {safeActiveModule === 'settings' && <SettingsPage />}
      {safeActiveModule === 'reports' && <ReportsPage />}
      {safeActiveModule === 'help' && <HelpGuidePage onNavigate={navigateToAllowedModule} />}
      {safeActiveModule === 'zakat' && <ZakatPage />}
      {safeActiveModule === 'inheritance' && <InheritancePage />}
      {safeActiveModule === 'fuel' && <FuelPage />}
      {safeActiveModule === 'fixed_assets' && <FixedAssetsPage />}
    </DashboardLayout>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
