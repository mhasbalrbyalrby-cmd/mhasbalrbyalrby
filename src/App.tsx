import { useState } from 'react';
import { AuthProvider, useAuth } from './lib/auth-context';
import { I18nProvider } from './lib/i18n-context';
import { ThemeProvider } from './lib/theme-context';
import DashboardLayout from './components/DashboardLayout';
import AuthPage from './components/AuthPage';

import DashboardPage from './pages/DashboardPage';
import InvoicesPage from './pages/InvoicesPage';
import ReceiptsPage from './pages/ReceiptsPage';
import InventoryPage from './pages/InventoryPage';
import ContactsPage from './pages/ContactsPage';
import AccountingPage from './pages/AccountingPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import KnowledgeCenterPage from './pages/KnowledgeCenterPage';
import OwnerPanelPage from './pages/OwnerPanelPage';
import ShiftsPage from './pages/ShiftsPage';
import PrepaidCardsPage from './pages/PrepaidCardsPage';
import ExchangePage from './pages/ExchangePage';
import BiometricsPage from './Biometrics';

function MainApp() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
        <div className="text-sm text-[var(--color-text-muted)]">جاري تحميل النظام...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardPage />;
      case 'invoices': return <InvoicesPage />;
      case 'receipts': return <ReceiptsPage />;
      case 'inventory': return <InventoryPage />;
      case 'contacts': return <ContactsPage />;
      case 'accounting': return <AccountingPage />;
      case 'exchange': return <ExchangePage />;
      case 'reports': return <ReportsPage />;
      case 'biometrics': return <BiometricsPage />;
      case 'shifts': return <ShiftsPage />;
      case 'prepaid-cards': return <PrepaidCardsPage />;
      case 'settings': return <SettingsPage />;
      case 'knowledge': return <KnowledgeCenterPage />;
      case 'owner': return <OwnerPanelPage />;
      default: return <DashboardPage />;
    }
  };

  return (
    <DashboardLayout activeModule={activeTab} onNavigate={setActiveTab}>
      {renderContent()}
    </DashboardLayout>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <AuthProvider>
          <MainApp />
        </AuthProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
