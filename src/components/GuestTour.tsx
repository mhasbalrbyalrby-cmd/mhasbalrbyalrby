import { useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import {
  Calculator, LayoutDashboard, Users, FileText, Receipt, Package,
  ArrowLeftRight, BarChart3, Clock, Settings, HandCoins, ScrollText,
  Fuel, Building, X, ChevronLeft, ChevronRight, LogIn, Sparkles, Zap,
} from 'lucide-react';

interface TourModule {
  code: string;
  icon: typeof LayoutDashboard;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  category: 'core' | 'addon';
}

const tourModules: TourModule[] = [
  { code: 'dashboard', icon: LayoutDashboard, nameAr: 'لوحة القيادة', nameEn: 'Dashboard', descAr: 'نظرة شاملة على أداء مؤسستك: المبيعات، المصروفات، الأرباح، والمؤشرات الرئيسية.', descEn: 'Complete business overview: sales, expenses, profits, and key performance indicators.', category: 'core' },
  { code: 'contacts', icon: Users, nameAr: 'جهات الاتصال', nameEn: 'Contacts', descAr: 'إدارة العملاء والموردين والموظفين مع أرصدتهم وتواريخ التعامل.', descEn: 'Manage customers, suppliers, and employees with balances and transaction history.', category: 'core' },
  { code: 'invoices', icon: FileText, nameAr: 'فواتير البيع والشراء', nameEn: 'Sales & Purchase Invoices', descAr: 'إنشاء فواتير بيع وشراء مع دعم المنتجات والخدمات وربط المخزون.', descEn: 'Create sales and purchase invoices with product and service support, inventory linking.', category: 'core' },
  { code: 'receipts', icon: Receipt, nameAr: 'الإيصالات والمدفوعات', nameEn: 'Receipts & Payments', descAr: 'سندات قبض وصرف مع ترحيل محاسبي تلقائي وربط بالعملات المتعددة.', descEn: 'Receipt and payment vouchers with automatic posting and multi-currency support.', category: 'core' },
  { code: 'accounting', icon: Calculator, nameAr: 'الحسابات والقيود', nameEn: 'Accounting', descAr: 'دليل الحسابات، القيود اليومية، التقارير المالية، وترحيل تلقائي.', descEn: 'Chart of accounts, journal entries, financial reports, and automatic posting.', category: 'core' },
  { code: 'inventory', icon: Package, nameAr: 'المنتجات والمخزون', nameEn: 'Products & Inventory', descAr: 'إدارة المنتجات والمستودعات وحركات المخزون وجرد الأصناف.', descEn: 'Manage products, warehouses, stock movements, and item counts.', category: 'core' },
  { code: 'exchange', icon: ArrowLeftRight, nameAr: 'التحويلات والصرافة', nameEn: 'Exchange & Transfers', descAr: 'حوالات مالية، أسعار صرف متعددة، وعمولات قابلة للتخصيص.', descEn: 'Money transfers, multi-currency exchange rates, and customizable commissions.', category: 'core' },
  { code: 'reports', icon: BarChart3, nameAr: 'التقارير', nameEn: 'Reports', descAr: 'تقارير مالية وتشغيلية شاملة: الميزانية، الأرباح والخسائر، كشف الحساب.', descEn: 'Comprehensive financial and operational reports: balance sheet, P&L, account statements.', category: 'core' },
  { code: 'shifts', icon: Clock, nameAr: 'الورديات', nameEn: 'Shifts', descAr: 'إدارة ورديات العمل وإقفال الكاشير مع تسليم النقدية.', descEn: 'Manage work shifts and cashier closings with cash handover.', category: 'core' },
  { code: 'settings', icon: Settings, nameAr: 'إعدادات المؤسسة', nameEn: 'Organization Settings', descAr: 'إعدادات العملة، الضريبة، الفروع، والمستخدمين والصلاحيات.', descEn: 'Currency, tax, branch, user, and permission settings.', category: 'core' },
  { code: 'fuel', icon: Fuel, nameAr: 'الأسطول والوقود', nameEn: 'Fleet & Fuel', descAr: 'إدارة المركبات، سجلات الوقود، الصيانة الدورية، وتنبيهات انتهاء الرخصة والتأمين.', descEn: 'Vehicle management, fuel logs, scheduled maintenance, and license/insurance alerts.', category: 'addon' },
  { code: 'zakat', icon: HandCoins, nameAr: 'الزكاة', nameEn: 'Zakat', descAr: 'حساب الزكاة وفق المعايير الشرعية مع آيات قرآنية وتتبع الأصول الزكوية.', descEn: 'Zakat calculation per Islamic standards with Quranic verses and asset tracking.', category: 'addon' },
  { code: 'inheritance', icon: ScrollText, nameAr: 'المواريث والتركات', nameEn: 'Inheritance & Estates', descAr: 'سجل الشركاء والأسرة، حساب التركات، وتوزيع الأنصبة الشرعية.', descEn: 'Partners/family registry, estate calculation, and Islamic heir distribution.', category: 'addon' },
  { code: 'fixed_assets', icon: Building, nameAr: 'الأصول الثابتة', nameEn: 'Fixed Assets', descAr: 'تتبع الأصول الثابتة وحساب الإهلاك (القسط الثابت والمتناقص) والقيمة الدفترية.', descEn: 'Track fixed assets with depreciation (straight-line and declining balance) and book value.', category: 'core' },
  { code: 'ai_assistant', icon: Sparkles, nameAr: 'المساعد الذكي', nameEn: 'AI Assistant', descAr: 'مساعد محاسبي ذكي للإجابة على الاستفسارات وأتمتة المهام.', descEn: 'AI-powered accounting assistant for queries and task automation.', category: 'addon' },
  { code: 'automation', icon: Zap, nameAr: 'الأتمتة', nameEn: 'Automation', descAr: 'أتمتة سير العمل وجدولة المهام المتكررة مثل التقارير الدورية.', descEn: 'Workflow automation and scheduling of recurring tasks like periodic reports.', category: 'addon' },
];

export default function GuestTour({ onExit }: { onExit: () => void }) {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const [step, setStep] = useState(0);
  const [selectedModule, setSelectedModule] = useState<TourModule | null>(null);

  const coreModules = tourModules.filter((m) => m.category === 'core');
  const addonModules = tourModules.filter((m) => m.category === 'addon');

  if (selectedModule) {
    const m = selectedModule;
    const Icon = m.icon;
    return (
      <div className="min-h-screen bg-[var(--color-bg)]">
        <div className="sticky top-0 z-20 bg-[var(--color-surface)] border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
              <Icon className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-[var(--color-text)]">{ar ? m.nameAr : m.nameEn}</span>
          </div>
          <button onClick={() => setSelectedModule(null)} className="btn-secondary flex items-center gap-1.5 !py-1.5">
            {ar ? <><ChevronRight className="w-4 h-4" /> رجوع للقائمة</> : <><ChevronLeft className="w-4 h-4" /> Back to list</>}
          </button>
        </div>
        <div className="max-w-4xl mx-auto p-6">
          <div className="card mb-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                <Icon className="w-7 h-7 text-primary-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[var(--color-text)]">{ar ? m.nameAr : m.nameEn}</h2>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">{ar ? m.descAr : m.descEn}</p>
                <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full font-medium ${m.category === 'core' ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' : 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400'}`}>
                  {m.category === 'core' ? (ar ? 'وحدة أساسية' : 'Core module') : (ar ? 'إضافة اختيارية' : 'Optional add-on')}
                </span>
              </div>
            </div>
          </div>
          <div className="card bg-[var(--color-bg)]">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-warning-500 animate-pulse" />
              <span className="text-xs text-[var(--color-text-muted)]">{ar ? 'عرض تجريبي — بيانات وهمية للمعاينة فقط' : 'Demo preview — sample data for illustration only'}</span>
            </div>
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] animate-pulse" style={{ animationDelay: `${i * 200}ms` }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30" />
                    <div className="space-y-1.5">
                      <div className="h-3 w-32 rounded bg-primary-100 dark:bg-primary-900/30" />
                      <div className="h-2 w-20 rounded bg-[var(--color-border)]" />
                    </div>
                  </div>
                  <div className="h-4 w-16 rounded bg-success-100 dark:bg-success-900/30" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="sticky top-0 z-20 bg-[var(--color-surface)] border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
            <Calculator className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-sm text-[var(--color-text)]">{ar ? 'محاسب الربيع العربي' : 'Arab Spring Accountant'}</span>
        </div>
        <button onClick={onExit} className="btn-secondary flex items-center gap-1.5 !py-1.5">
          <X className="w-4 h-4" />
          {ar ? 'خروج' : 'Exit'}
        </button>
      </div>

      <div className="max-w-5xl mx-auto p-4 lg:p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary-600 flex items-center justify-center mx-auto mb-4">
            <Calculator className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">{ar ? 'جولة تعريفية في النظام' : 'System Tour'}</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-2 max-w-lg mx-auto">
            {ar ? 'استكشف الوحدات والميزات قبل إنشاء حسابك. لا حاجة لتسجيل الدخول.' : 'Explore modules and features before creating an account. No login required.'}
          </p>
        </div>

        <div className="mb-6">
          <h3 className="text-sm font-bold text-[var(--color-text)] mb-3 flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-primary-500" />
            {ar ? 'الوحدات الأساسية' : 'Core Modules'}
            <span className="text-xs font-normal text-[var(--color-text-muted)]">({coreModules.length})</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {coreModules.map((m) => {
              const Icon = m.icon;
              return (
                <button key={m.code} onClick={() => setSelectedModule(m)} className="card text-start hover:border-primary-400 dark:hover:border-primary-600 transition-colors group">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0 group-hover:bg-primary-600 transition-colors">
                      <Icon className="w-5 h-5 text-primary-600 group-hover:text-white transition-colors" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-sm text-[var(--color-text)]">{ar ? m.nameAr : m.nameEn}</h4>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5 line-clamp-2">{ar ? m.descAr : m.descEn}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-8">
          <h3 className="text-sm font-bold text-[var(--color-text)] mb-3 flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-accent-500" />
            {ar ? 'الإضافات الاختيارية' : 'Optional Add-ons'}
            <span className="text-xs font-normal text-[var(--color-text-muted)]">({addonModules.length})</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {addonModules.map((m) => {
              const Icon = m.icon;
              return (
                <button key={m.code} onClick={() => setSelectedModule(m)} className="card text-start hover:border-accent-400 dark:hover:border-accent-600 transition-colors group">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl bg-accent-100 dark:bg-accent-900/30 flex items-center justify-center shrink-0 group-hover:bg-accent-600 transition-colors">
                      <Icon className="w-5 h-5 text-accent-600 group-hover:text-white transition-colors" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-sm text-[var(--color-text)]">{ar ? m.nameAr : m.nameEn}</h4>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5 line-clamp-2">{ar ? m.descAr : m.descEn}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card bg-primary-50 dark:bg-primary-900/15 border-primary-200 dark:border-primary-800 text-center py-8">
          <h3 className="text-lg font-bold text-[var(--color-text)] mb-2">{ar ? 'جاهز للبدء؟' : 'Ready to get started?'}</h3>
          <p className="text-sm text-[var(--color-text-muted)] mb-4">{ar ? 'أنشئ حسابك ومؤسستك للوصول الكامل لجميع الميزات' : 'Create your account and organization for full access to all features'}</p>
          <button onClick={onExit} className="btn-primary inline-flex items-center gap-2">
            <LogIn className="w-4 h-4" />
            {ar ? 'سجل الدخول أو أنشئ حسابًا' : 'Login or Create Account'}
          </button>
        </div>
      </div>
    </div>
  );
}
