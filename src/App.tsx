import React, { useState } from 'react';
import { AuthProvider, useAuth } from './lib/auth-context';
import { I18nProvider } from './lib/i18n-context';
import DashboardLayout from './components/DashboardLayout';
import AuthPage from './components/AuthPage';

// Pages
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

// Direct import for Biometrics
import BiometricsPage from './Biometrics';

function MainApp() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dir-rtl">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardPage setActiveTab={setActiveTab} />;
      case 'invoices':
        return <InvoicesPage />;
      case 'receipts':
        return <ReceiptsPage />;
      case 'inventory':
        return <InventoryPage />;
      case 'contacts':
        return <ContactsPage />;
      case 'accounting':
        return <AccountingPage />;
      case 'reports':
        return <ReportsPage />;
      case 'biometrics':
        return <BiometricsPage />;
      case 'shifts':
        return <ShiftsPage />;
      case 'prepaid-cards':
        return <PrepaidCardsPage />;
      case 'settings':
        return <SettingsPage />;
      case 'knowledge':
        return <KnowledgeCenterPage />;
      case 'owner':
        return <OwnerPanelPage />;
      default:
        return <DashboardPage setActiveTab={setActiveTab} />;
    }
  };

  return (
    <DashboardLayout activeTab={activeTab} setActiveTab={setActiveTab}>
      {renderContent()}
    </DashboardLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <I18nProvider>
        <MainApp />
      </I18nProvider>
    </AuthProvider>
  );
}
