import { useState } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { I18nProvider } from '@/lib/i18n-context';
import { ThemeProvider } from '@/lib/theme-context';
import AuthPage from '@/components/AuthPage';
import DashboardLayout from '@/components/DashboardLayout';
import DashboardPage from '@/pages/DashboardPage';
import OwnerPanelPage from '@/pages/OwnerPanelPage';
import KnowledgeCenterPage from '@/pages/KnowledgeCenterPage';
import ContactsPage from '@/pages/ContactsPage';
import AccountingPage from '@/pages/AccountingPage';
import import InvoicesPage from './pages/InvoicesPage';
import InventoryPage from '@/pages/InventoryPage';
import ReceiptsPage from '@/pages/ReceiptsPage';
import ExchangePage from '@/pages/ExchangePage';
import ShiftsPage from '@/pages/ShiftsPage';
import SettingsPage from '@/pages/SettingsPage';
import ReportsPage from '@/pages/ReportsPage';
import { BiometricCenter } from '@/components/Biometrics';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { user, loading } = useAuth();
  const [activeModule, setActiveModule] = useState('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <DashboardLayout activeModule={activeModule} onNavigate={setActiveModule}>
      {activeModule === 'dashboard' && <DashboardPage />}
      {activeModule === 'owner' && <OwnerPanelPage />}
      {activeModule === 'knowledge' && <KnowledgeCenterPage />}
      {activeModule === 'contacts' && <ContactsPage />}
      {activeModule === 'accounting' && <AccountingPage />}
      {activeModule === 'invoices' && <InvoicesPage />}
      {activeModule === 'inventory' && <InventoryPage />}
      {activeModule === 'receipts' && <ReceiptsPage />}
      {activeModule === 'exchange' && <ExchangePage />}
      {activeModule === 'shifts' && <ShiftsPage />}
      {activeModule === 'settings' && <SettingsPage />}
      {activeModule === 'reports' && <ReportsPage />}
      {activeModule === 'biometrics' && <BiometricCenter />}
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
