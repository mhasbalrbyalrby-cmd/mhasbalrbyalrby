import { useState } from 'react';
import { AuthProvider, useAuth } from './auth-context';
import { I18nProvider } from './i18n-context';
import { ThemeProvider } from './theme-context';
import AuthPage from './AuthPage';
import DashboardLayout from './DashboardLayout';
import DashboardPage from './DashboardPage';
import OwnerPanelPage from './OwnerPanelPage';
import KnowledgeCenterPage from './KnowledgeCenterPage';
import ContactsPage from './ContactsPage';
import AccountingPage from './AccountingPage';
import InvoicesPage from './InvoicesPage';
import InventoryPage from './InventoryPage';
import ReceiptsPage from './ReceiptsPage';
import ExchangePage from './ExchangePage';
import ShiftsPage from './ShiftsPage';
import SettingsPage from './SettingsPage';
import ReportsPage from './ReportsPage';
import { BiometricCenter } from './Biometrics';
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
