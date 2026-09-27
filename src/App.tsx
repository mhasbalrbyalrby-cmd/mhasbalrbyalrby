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



);
}

if (!user) {
return ;
}

const renderContent = () => {
switch (activeTab) {
case 'dashboard':
return ;
case 'invoices':
return ;
case 'receipts':
return ;
case 'inventory':
return ;
case 'contacts':
return ;
case 'accounting':
return ;
case 'reports':
return ;
case 'biometrics':
return ;
case 'shifts':
return ;
case 'prepaid-cards':
return ;
case 'settings':
return ;
case 'knowledge':
return ;
case 'owner':
return ;
default:
return ;
}
};

return (

{renderContent()}

);
}

export default function App() {
return (





);
}
