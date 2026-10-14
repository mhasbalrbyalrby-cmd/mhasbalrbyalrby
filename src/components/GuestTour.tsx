import { useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import {
  Calculator, LayoutDashboard, Users, FileText, Receipt, Package,
  ArrowLeftRight, BarChart3, Clock, Settings, HandCoins, ScrollText,
  Fuel, Building, X, ChevronLeft, ChevronRight, LogIn, Sparkles, Zap,
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, Wallet,
} from 'lucide-react';

interface DemoRow {
  label: string;
  sublabel?: string;
  amount?: string;
  badge?: string;
  badgeColor?: string;
}

interface TourModule {
  code: string;
  icon: typeof LayoutDashboard;
  nameAr: string;
  nameEn: string;
  descAr: string;
  descEn: string;
  category: 'core' | 'addon';
  demoTitleAr: string;
  demoTitleEn: string;
  demoRows: DemoRow[];
  stats?: { labelAr: string; labelEn: string; value: string; color: string }[];
}

const tourModules: TourModule[] = [
  {
    code: 'dashboard', icon: LayoutDashboard, nameAr: 'لوحة القيادة', nameEn: 'Dashboard',
    descAr: 'نظرة شاملة على أداء مؤسستك: المبيعات، المصروفات، الأرباح، والمؤشرات الرئيسية.',
    descEn: 'Complete business overview: sales, expenses, profits, and key performance indicators.',
    category: 'core', demoTitleAr: 'نظرة عامة على الأداء', demoTitleEn: 'Performance Overview',
    stats: [
      { labelAr: 'المبيعات اليوم', labelEn: "Today's Sales", value: '12,450', color: 'text-success-600' },
      { labelAr: 'المصروفات', labelEn: 'Expenses', value: '3,820', color: 'text-error-500' },
      { labelAr: 'صافي الربح', labelEn: 'Net Profit', value: '8,630', color: 'text-primary-600' },
    ],
    demoRows: [
      { label: 'مبيعات نقطة البيع', sublabel: '8 فواتير', amount: '4,200', badge: 'نشط', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'مبيعات آجلة', sublabel: '3 فواتير', amount: '5,150', badge: 'معلق', badgeColor: 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400' },
      { label: 'مرتجعات', sublabel: '1 مرتجع', amount: '-900', badge: 'مكتمل', badgeColor: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
      { label: 'مصروفات تشغيلية', sublabel: '5 سندات', amount: '-3,820', badge: 'مرحل', badgeColor: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' },
    ],
  },
  {
    code: 'invoices', icon: FileText, nameAr: 'فواتير البيع والشراء', nameEn: 'Sales & Purchase Invoices',
    descAr: 'إنشاء فواتير بيع وشراء مع دعم المنتجات والخدمات وربط المخزون.',
    descEn: 'Create sales and purchase invoices with product and service support, inventory linking.',
    category: 'core', demoTitleAr: 'أحدث الفواتير', demoTitleEn: 'Recent Invoices',
    demoRows: [
      { label: 'INV-00128', sublabel: 'شركة النور التجارية', amount: '2,450', badge: 'مدفوعة', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'INV-00127', sublabel: 'مؤسسة الفجر', amount: '1,800', badge: 'مستحقة', badgeColor: 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400' },
      { label: 'INV-00126', sublabel: 'محل الأمل', amount: '3,200', badge: 'مدفوعة', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'INV-00125', sublabel: 'شركة البناء الحديث', amount: '5,000', badge: 'جزئياً', badgeColor: 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400' },
      { label: 'PUR-00042', sublabel: 'مورد المعدات الصناعية', amount: '-8,300', badge: 'شراء', badgeColor: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' },
    ],
  },
  {
    code: 'inventory', icon: Package, nameAr: 'المنتجات والمخزون', nameEn: 'Products & Inventory',
    descAr: 'إدارة المنتجات والمستودعات وحركات المخزون وجرد الأصناف.',
    descEn: 'Manage products, warehouses, stock movements, and item counts.',
    category: 'core', demoTitleAr: 'حالة المخزون', demoTitleEn: 'Inventory Status',
    demoRows: [
      { label: 'لابتوب Dell Latitude', sublabel: 'SKU-001 · المستودع الرئيسي', amount: '12 قطعة', badge: 'متوفر', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'طابعة HP LaserJet', sublabel: 'SKU-002 · المستودع الرئيسي', amount: '3 قطع', badge: 'منخفض', badgeColor: 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400' },
      { label: 'كراسي مكتبية', sublabel: 'SKU-003 · فرع الشمال', amount: '45 قطعة', badge: 'متوفر', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'شاشات Samsung 27"', sublabel: 'SKU-004', amount: '0 قطعة', badge: 'نفد', badgeColor: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400' },
      { label: 'كيبورد لاسلكي', sublabel: 'SKU-005', amount: '28 قطعة', badge: 'متوفر', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
    ],
  },
  {
    code: 'reports', icon: BarChart3, nameAr: 'التقارير', nameEn: 'Reports',
    descAr: 'تقارير مالية وتشغيلية شاملة: الميزانية، الأرباح والخسائر، كشف الحساب.',
    descEn: 'Comprehensive financial and operational reports: balance sheet, P&L, account statements.',
    category: 'core', demoTitleAr: 'التقرير المالي الشهري', demoTitleEn: 'Monthly Financial Report',
    stats: [
      { labelAr: 'الإيرادات', labelEn: 'Revenue', value: '148,200', color: 'text-success-600' },
      { labelAr: 'المصروفات', labelEn: 'Expenses', value: '92,400', color: 'text-error-500' },
      { labelAr: 'صافي الربح', labelEn: 'Net Profit', value: '55,800', color: 'text-primary-600' },
    ],
    demoRows: [
      { label: 'إيرادات المبيعات', sublabel: 'قسم المبيعات', amount: '125,000', badge: '+12%', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'إيرادات الخدمات', sublabel: 'قسم الخدمات', amount: '23,200', badge: '+5%', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'رواتب وأجور', sublabel: 'مصروفات الموظفين', amount: '-45,000', badge: 'ثابت', badgeColor: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
      { label: 'إيجار ومرافق', sublabel: 'مصروفات تشغيلية', amount: '-12,400', badge: 'ثابت', badgeColor: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
      { label: 'تكلفة البضاعة المباعة', sublabel: 'COGS', amount: '-35,000', badge: '+8%', badgeColor: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400' },
    ],
  },
  {
    code: 'ai_assistant', icon: Sparkles, nameAr: 'المساعد الذكي', nameEn: 'AI Assistant',
    descAr: 'مساعد محاسبي ذكي للإجابة على الاستفسارات وأتمتة المهام.',
    descEn: 'AI-powered accounting assistant for queries and task automation.',
    category: 'addon', demoTitleAr: 'المساعد المحاسبي الذكي', demoTitleEn: 'AI Accounting Assistant',
    demoRows: [
      { label: 'ما هي أرباح هذا الشهر؟', sublabel: 'المساعد: صافي ربح الشهر 55,800 ريال، بزيادة 12% عن الشهر السابق.', badge: 'إجابة', badgeColor: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' },
      { label: 'أنشئ قيد إهلاك شهري', sublabel: 'المساعد: تم إنشاء قيد إهلاك بقيمة 2,500 ريال للحساب 1501-إهلاك المعدات.', badge: 'تنفيذ', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'ما هي الفواتير المستحقة؟', sublabel: 'المساعد: لديك 3 فواتير مستحقة بإجمالي 7,250 ريال، أقدمها بتاريخ 15 يومًا.', badge: 'إجابة', badgeColor: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' },
      { label: 'ولّد تقرير ضريبة القيمة المضافة', sublabel: 'الساعد: تم توليد تقرير VAT للربع الثالث بإجمالي 18,600 ريال.', badge: 'تنفيذ', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
    ],
  },
  {
    code: 'contacts', icon: Users, nameAr: 'جهات الاتصال', nameEn: 'Contacts',
    descAr: 'إدارة العملاء والموردين والموظفين مع أرصدتهم وتواريخ التعامل.',
    descEn: 'Manage customers, suppliers, and employees with balances and transaction history.',
    category: 'core', demoTitleAr: 'جهات الاتصال', demoTitleEn: 'Contacts',
    demoRows: [
      { label: 'شركة النور التجارية', sublabel: 'عميل · الرياض', amount: '+4,200', badge: 'رصيد دائن', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'مؤسسة الفجر', sublabel: 'عميل · جدة', amount: '-1,800', badge: 'رصيد مدين', badgeColor: 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400' },
      { label: 'مورد المعدات الصناعية', sublabel: 'مورد · الدمام', amount: '-8,300', badge: 'رصيد مدين', badgeColor: 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400' },
      { label: 'محل الأمل', sublabel: 'عميل · مكة', amount: '0', badge: 'م settle', badgeColor: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
    ],
  },
  {
    code: 'receipts', icon: Receipt, nameAr: 'الإيصالات والمدفوعات', nameEn: 'Receipts & Payments',
    descAr: 'سندات قبض وصرف مع ترحيل محاسبي تلقائي وربط بالعملات المتعددة.',
    descEn: 'Receipt and payment vouchers with automatic posting and multi-currency support.',
    category: 'core', demoTitleAr: 'أحدث السندات', demoTitleEn: 'Recent Vouchers',
    demoRows: [
      { label: 'REC-00051', sublabel: 'قبض من شركة النور', amount: '4,200', badge: 'نقداً', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'PAY-00038', sublabel: 'صرف رواتب', amount: '-15,000', badge: 'تحويل بنكي', badgeColor: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400' },
      { label: 'REC-00050', sublabel: 'قبض من محل الأمل', amount: '3,200', badge: 'نقداً', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'PAY-00037', sublabel: 'صرف إيجار', amount: '-5,000', badge: 'تحويل بنكي', badgeColor: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400' },
    ],
  },
  {
    code: 'accounting', icon: Calculator, nameAr: 'الحسابات والقيود', nameEn: 'Accounting',
    descAr: 'دليل الحسابات، القيود اليومية، التقارير المالية، وترحيل تلقائي.',
    descEn: 'Chart of accounts, journal entries, financial reports, and automatic posting.',
    category: 'core', demoTitleAr: 'دليل الحسابات', demoTitleEn: 'Chart of Accounts',
    demoRows: [
      { label: '1000 - النقدية في الصندوق', sublabel: 'أصول متداولة', amount: '28,450', badge: 'مدين', badgeColor: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' },
      { label: '1100 - البنك الأهلي', sublabel: 'أصول متداولة', amount: '152,300', badge: 'مدين', badgeColor: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' },
      { label: '4000 - إيرادات المبيعات', sublabel: 'إيرادات', amount: '148,200', badge: 'دائن', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: '5000 - تكلفة البضاعة', sublabel: 'مصروفات', amount: '-35,000', badge: 'مدين', badgeColor: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400' },
    ],
  },
  {
    code: 'exchange', icon: ArrowLeftRight, nameAr: 'التحويلات والصرافة', nameEn: 'Exchange & Transfers',
    descAr: 'حوالات مالية، أسعار صرف متعددة، وعمولات قابلة للتخصيص.',
    descEn: 'Money transfers, multi-currency exchange rates, and customizable commissions.',
    category: 'core', demoTitleAr: 'حوالات يومية', demoTitleEn: 'Daily Transfers',
    demoRows: [
      { label: 'TRX-0012', sublabel: 'دولار → ريال · 1,000 USD', amount: '3,750 SAR', badge: 'مكتمل', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'TRX-0011', sublabel: 'يورو → ريال · 500 EUR', amount: '2,100 SAR', badge: 'مكتمل', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'TRX-0010', sublabel: 'درهم → ريال · 8,000 AED', amount: '8,160 SAR', badge: 'معلق', badgeColor: 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400' },
    ],
  },
  {
    code: 'shifts', icon: Clock, nameAr: 'الورديات', nameEn: 'Shifts',
    descAr: 'إدارة ورديات العمل وإقفال الكاشير مع تسليم النقدية.',
    descEn: 'Manage work shifts and cashier closings with cash handover.',
    category: 'core', demoTitleAr: 'ورديات اليوم', demoTitleEn: "Today's Shifts",
    demoRows: [
      { label: 'وردية صباحية', sublabel: 'أحمد · 08:00 - 14:00', amount: '6,200', badge: 'مفتوحة', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'وردية مسائية', sublabel: 'سارة · 14:00 - 22:00', amount: '0', badge: 'لم تبدأ', badgeColor: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
      { label: 'وردية ليلية', sublabel: 'خالد · 22:00 - 06:00', amount: '0', badge: 'مجدولة', badgeColor: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' },
    ],
  },
  {
    code: 'fuel', icon: Fuel, nameAr: 'الأسطول والوقود', nameEn: 'Fleet & Fuel',
    descAr: 'إدارة المركبات، سجلات الوقود، الصيانة الدورية، وتنبيهات انتهاء الرخصة والتأمين.',
    descEn: 'Vehicle management, fuel logs, scheduled maintenance, and license/insurance alerts.',
    category: 'addon', demoTitleAr: 'حالة الأسطول', demoTitleEn: 'Fleet Status',
    demoRows: [
      { label: 'تويوتا هايلكس · KSA-1234', sublabel: '53,200 كم · آخر صيانة: 50,000', amount: '120 لتر', badge: 'نشط', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'نيسان باترول · KSA-5678', sublabel: 'تأمين ينتهي خلال 15 يوم', amount: '80 لتر', badge: 'تنبيه', badgeColor: 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400' },
      { label: 'هيونداي H1 · KSA-9012', sublabel: 'صيانة دورية مستحقة', amount: '60 لتر', badge: 'صيانة', badgeColor: 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400' },
    ],
  },
  {
    code: 'zakat', icon: HandCoins, nameAr: 'الزكاة', nameEn: 'Zakat',
    descAr: 'حساب الزكاة وفق المعايير الشرعية مع آيات قرآنية وتتبع الأصول الزكوية.',
    descEn: 'Zakat calculation per Islamic standards with Quranic verses and asset tracking.',
    category: 'addon', demoTitleAr: 'حساب الزكاة', demoTitleEn: 'Zakat Calculation',
    stats: [
      { labelAr: 'إجمالي الأصول الزكوية', labelEn: 'Total Zakat Assets', value: '180,750', color: 'text-primary-600' },
      { labelAr: 'الزكاة المستحقة (2.5%)', labelEn: 'Zakat Due (2.5%)', value: '4,519', color: 'text-accent-600' },
      { labelAr: 'الخصومات', labelEn: 'Deductions', value: '12,300', color: 'text-error-500' },
    ],
    demoRows: [
      { label: 'النقدية والبنوك', sublabel: 'أصل زكوي', amount: '180,750', badge: 'مضمّن', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'البضاعة (الجرد)', sublabel: 'أصل زكوي', amount: '95,000', badge: 'مضمّن', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'الذمم المدينة', sublabel: 'أصل زكوي', amount: '42,500', badge: 'مضمّن', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'الديون المستحقة', sublabel: 'خصم', amount: '-12,300', badge: 'مخصوم', badgeColor: 'bg-error-100 text-error-700 dark:bg-error-900/30 dark:text-error-400' },
    ],
  },
  {
    code: 'inheritance', icon: ScrollText, nameAr: 'المواريث والتركات', nameEn: 'Inheritance & Estates',
    descAr: 'سجل الشركاء والأسرة، حساب التركات، وتوزيع الأنصبة الشرعية.',
    descEn: 'Partners/family registry, estate calculation, and Islamic heir distribution.',
    category: 'addon', demoTitleAr: 'توزيع التركة', demoTitleEn: 'Estate Distribution',
    demoRows: [
      { label: 'الزوجة', sublabel: '1/8 · الثمن', amount: '12,500', badge: 'أنثى', badgeColor: 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400' },
      { label: 'الابن الأكبر', sublabel: 'تعصيب', amount: '43,750', badge: 'ذكر', badgeColor: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' },
      { label: 'الابنة', sublabel: '1/2 · النصف', amount: '21,875', badge: 'أنثى', badgeColor: 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400' },
      { label: 'الأم', sublabel: '1/6 · السدس', amount: '16,667', badge: 'أنثى', badgeColor: 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400' },
    ],
  },
  {
    code: 'fixed_assets', icon: Building, nameAr: 'الأصول الثابتة', nameEn: 'Fixed Assets',
    descAr: 'تتبع الأصول الثابتة وحساب الإهلاك (القسط الثابت والمتناقص) والقيمة الدفترية.',
    descEn: 'Track fixed assets with depreciation (straight-line and declining balance) and book value.',
    category: 'core', demoTitleAr: 'سجل الأصول', demoTitleEn: 'Asset Register',
    stats: [
      { labelAr: 'إجمالي التكلفة', labelEn: 'Total Cost', value: '285,000', color: 'text-primary-600' },
      { labelAr: 'إجمالي الإهلاك', labelEn: 'Total Depreciation', value: '-82,300', color: 'text-error-500' },
      { labelAr: 'صافي القيمة', labelEn: 'Net Book Value', value: '202,700', color: 'text-success-600' },
    ],
    demoRows: [
      { label: 'مبنى المكتب الرئيسي', sublabel: 'ASSET-001 · مباني · 25 سنة', amount: '150,000', badge: 'نشط', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'سيارة شركة تويوتا', sublabel: 'ASSET-002 · مركبات · 5 سنوات', amount: '45,000', badge: 'نشط', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'أجهزة حاسب', sublabel: 'ASSET-003 · حواسيب · 3 سنوات', amount: '35,000', badge: 'مستهلك', badgeColor: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
      { label: 'أثاث مكتبي', sublabel: 'ASSET-004 · أثاث · 10 سنوات', amount: '55,000', badge: 'نشط', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
    ],
  },
  {
    code: 'settings', icon: Settings, nameAr: 'إعدادات المؤسسة', nameEn: 'Organization Settings',
    descAr: 'إعدادات العملة، الضريبة، الفروع، والمستخدمين والصلاحيات.',
    descEn: 'Currency, tax, branch, user, and permission settings.',
    category: 'core', demoTitleAr: 'إعدادات النظام', demoTitleEn: 'System Settings',
    demoRows: [
      { label: 'العملة الأساسية', sublabel: 'ريال سعودي (SAR)', badge: 'افتراضي', badgeColor: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' },
      { label: 'ضريبة القيمة المضافة', sublabel: '15%', badge: 'مفعّل', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'عدد الفروع', sublabel: '3 فروع', badge: 'نشط', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'المستخدمون', sublabel: '8 مستخدمين', badge: 'نشط', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
    ],
  },
  {
    code: 'automation', icon: Zap, nameAr: 'الأتمتة', nameEn: 'Automation',
    descAr: 'أتمتة سير العمل وجدولة المهام المتكررة مثل التقارير الدورية.',
    descEn: 'Workflow automation and scheduling of recurring tasks like periodic reports.',
    category: 'addon', demoTitleAr: 'قواعد الأتمتة', demoTitleEn: 'Automation Rules',
    demoRows: [
      { label: 'تقرير مبيعات يومي', sublabel: 'يُرسل كل يوم 8:00 صباحًا', badge: 'نشط', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'تنبيه انخفاض المخزون', sublabel: 'عند أقل من 5 قطع', badge: 'نشط', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'تذكير الفواتير المستحقة', sublabel: 'كل 3 أيام', badge: 'نشط', badgeColor: 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400' },
      { label: 'نسخ احتياطي أسبوعي', sublabel: 'كل يوم أحد', badge: 'متوقف', badgeColor: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
    ],
  },
];

function ModuleDemo({ module, ar, onBack }: { module: TourModule; ar: boolean; onBack: () => void }) {
  const Icon = module.icon;
  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <div className="sticky top-0 z-20 bg-[var(--color-surface)] border-b border-[var(--color-border)] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
            <Icon className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-[var(--color-text)]">{ar ? module.nameAr : module.nameEn}</span>
        </div>
        <button onClick={onBack} className="btn-secondary flex items-center gap-1.5 !py-1.5">
          {ar ? <><ChevronRight className="w-4 h-4" /> رجوع للقائمة</> : <><ChevronLeft className="w-4 h-4" /> Back to list</>}
        </button>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {/* Signup banner */}
        <div className="card bg-gradient-to-r from-primary-600 to-primary-700 dark:from-primary-700 dark:to-primary-800 border-0 mb-5 overflow-hidden relative">
          <div className="absolute top-0 end-0 w-32 h-32 rounded-full bg-white/10 -translate-y-12 translate-x-12" />
          <div className="relative flex items-center justify-between gap-4 flex-wrap">
            <div className="text-white">
              <h3 className="font-bold text-lg">{ar ? 'أنشئ مؤسستك المجانية الآن' : 'Create your free organization now'}</h3>
              <p className="text-sm text-white/80 mt-0.5">{ar ? 'استمتع بالوصول الكامل لجميع الميزات وبياناتك الحقيقية' : 'Get full access to all features with your real data'}</p>
            </div>
            <button onClick={onBack} className="bg-white text-primary-700 px-5 py-2.5 rounded-lg font-bold text-sm hover:bg-primary-50 transition-colors flex items-center gap-2 shrink-0">
              <LogIn className="w-4 h-4" />
              {ar ? 'ابدأ الآن' : 'Get Started'}
            </button>
          </div>
        </div>

        <div className="card mb-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
              <Icon className="w-7 h-7 text-primary-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[var(--color-text)]">{ar ? module.demoTitleAr : module.demoTitleEn}</h2>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">{ar ? module.descAr : module.descEn}</p>
              <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full font-medium ${module.category === 'core' ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' : 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-400'}`}>
                {module.category === 'core' ? (ar ? 'وحدة أساسية' : 'Core module') : (ar ? 'إضافة اختيارية' : 'Optional add-on')}
              </span>
            </div>
          </div>
        </div>

        {module.stats && (
          <div className="grid grid-cols-3 gap-4 mb-4">
            {module.stats.map((s, i) => (
              <div key={i} className="card text-center">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-[var(--color-text-muted)] mt-1">{ar ? s.labelAr : s.labelEn}</div>
              </div>
            ))}
          </div>
        )}

        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-warning-500 animate-pulse" />
            <span className="text-xs text-[var(--color-text-muted)]">{ar ? 'بيانات تجريبية حية للمعاينة' : 'Live demo data for preview'}</span>
          </div>
          <div className="space-y-2">
            {module.demoRows.map((row, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-primary-300 dark:hover:border-primary-700 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                    {row.amount && row.amount.startsWith('-') ? <TrendingDown className="w-4 h-4 text-error-500" /> : <TrendingUp className="w-4 h-4 text-success-600" />}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-[var(--color-text)] truncate">{row.label}</div>
                    {row.sublabel && <div className="text-xs text-[var(--color-text-muted)] truncate">{row.sublabel}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {row.amount && <span className={`text-sm font-bold ${row.amount.startsWith('-') ? 'text-error-500' : 'text-success-600'}`}>{row.amount}</span>}
                  {row.badge && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${row.badgeColor}`}>{row.badge}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GuestTour({ onExit }: { onExit: () => void }) {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const [selectedModule, setSelectedModule] = useState<TourModule | null>(null);

  const coreModules = tourModules.filter((m) => m.category === 'core');
  const addonModules = tourModules.filter((m) => m.category === 'addon');

  if (selectedModule) {
    return <ModuleDemo module={selectedModule} ar={ar} onBack={() => setSelectedModule(null)} />;
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

      {/* Top signup banner */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 dark:from-primary-700 dark:to-primary-800">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="text-white">
            <h3 className="font-bold text-base">{ar ? 'أنشئ مؤسستك المجانية الآن' : 'Create your free organization now'}</h3>
            <p className="text-xs text-white/80 mt-0.5">{ar ? 'استكشف النظام بحرية ثم انتقل إلى بياناتك الحقيقية في دقائق' : 'Explore freely, then switch to your real data in minutes'}</p>
          </div>
          <button onClick={onExit} className="bg-white text-primary-700 px-4 py-2 rounded-lg font-bold text-sm hover:bg-primary-50 transition-colors flex items-center gap-2 shrink-0">
            <LogIn className="w-4 h-4" />
            {ar ? 'ابدأ الآن' : 'Get Started'}
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 lg:p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary-600 flex items-center justify-center mx-auto mb-4">
            <Calculator className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">{ar ? 'جولة تعريفية في النظام' : 'System Tour'}</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-2 max-w-lg mx-auto">
            {ar ? 'استكشف الوحدات والميزات قبل إنشاء حسابك. اضغط على أي وحدة لرؤية عرض حي.' : 'Explore modules and features before creating an account. Click any module for a live demo.'}
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
