import { useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { useAuth } from '@/lib/auth-context';
import {
  HelpCircle, Shield, Building2, User, UserPlus,
  FileText, Receipt, Calculator, Package, BarChart3, Clock,
  ChevronDown, ChevronRight, BookOpen, Settings, ArrowLeftRight,
  Fuel, HeartHandshake, MoonStar, Download,
} from 'lucide-react';

interface Section {
  title: string;
  steps: { text: string; action?: string }[];
}

interface Guide {
  role: string;
  icon: typeof Shield;
  color: string;
  sections: Section[];
}

export default function HelpGuidePage({ onNavigate }: { onNavigate: (code: string) => void }) {
  const { lang } = useI18n();
  const { isOwner, role } = useAuth();
  const [openSection, setOpenSection] = useState<string | null>(null);

  const roleName = role?.name ?? (isOwner ? 'owner' : 'employee');

  const guides: Record<string, Guide> = {
    owner: {
      role: lang === 'ar' ? 'مالك النظام العام' : 'System Owner',
      icon: Shield,
      color: 'bg-accent-600',
      sections: [
        {
          title: lang === 'ar' ? 'لوحة المالك' : 'Owner Panel',
          steps: [
            { text: lang === 'ar' ? 'من القائمة الجانبية، اضغط "لوحة المالك" للوصول إلى إدارة النظام.' : 'From the sidebar, click "Owner Panel" to access system management.', action: 'owner' },
            { text: lang === 'ar' ? 'يمكنك إدارة المؤسسات، الخطط، الكروت، الوحدات، سجلات التدقيق، والإعدادات.' : 'Manage tenants, plans, cards, modules, audit logs, and system settings.' },
          ],
        },
        {
          title: lang === 'ar' ? 'إدارة المؤسسات' : 'Tenant Management',
          steps: [
            { text: lang === 'ar' ? 'في لوحة المالك، تبويب "المؤسسات" يعرض جميع المؤسسات مع حالتها.' : 'In the Owner Panel, the "Tenants" tab shows all organizations with their status.' },
            { text: lang === 'ar' ? 'يمكنك تفعيل، إيقاف، أو تغيير خطة الاشتراك لأي مؤسسة.' : 'You can activate, suspend, or change subscription plans for any tenant.' },
            { text: lang === 'ar' ? 'لا يمكنك الاطلاع على بيانات مؤسسة أخرى أو تعديلها — كل مؤسسة معزولة.' : 'You cannot view or edit another tenant\'s business data — each tenant is isolated.' },
          ],
        },
        {
          title: lang === 'ar' ? 'إدارة المستخدمين والأدوار' : 'Users & Roles Management',
          steps: [
            { text: lang === 'ar' ? 'من تبويب "المستخدمون" يمكنك رؤية جميع المستخدمين المسجلين.' : 'From the "Users" tab you can see all registered users.' },
            { text: lang === 'ar' ? 'الأدوار الافتراضية: مالك، مدير، محاسب، مبيعات، مشتريات، مخزون، كاشير، وكيل صرافة، مراجع، موظف.' : 'Default roles: owner, admin, accountant, sales, purchasing, warehouse, cashier, exchange_agent, auditor, employee.' },
            { text: lang === 'ar' ? 'مالك النظام يدير المؤسسات والخطط. مالك المؤسسة يدير فريقه وبياناته فقط.' : 'System owner manages tenants and plans. Tenant owner manages only their team and data.' },
          ],
        },
        {
          title: lang === 'ar' ? 'الفرق بين مالك النظام ومالك المؤسسة' : 'System Owner vs Tenant Owner',
          steps: [
            { text: lang === 'ar' ? 'مالك النظام العام: يدير المؤسسات، الخطط، الإعدادات العامة، وسجلات التدقيق.' : 'System owner: manages tenants, plans, system settings, and audit logs.' },
            { text: lang === 'ar' ? 'مالك المؤسسة: يدير فريقه، حساباته، فواتيره، مخزونه، وكل بيانات مؤسسته فقط.' : 'Tenant owner: manages their team, accounts, invoices, inventory, and all their organization data only.' },
            { text: lang === 'ar' ? 'لا يمكن لمالك المؤسسة الوصول إلى لوحة المالك أو إدارة المؤسسات الأخرى.' : 'A tenant owner cannot access the owner panel or manage other tenants.' },
          ],
        },
      ],
    },
    tenant_owner: {
      role: lang === 'ar' ? 'مالك المؤسسة المستأجرة' : 'Tenant Owner',
      icon: Building2,
      color: 'bg-primary-600',
      sections: [
        {
          title: lang === 'ar' ? 'إعداد المؤسسة لأول مرة' : 'Initial Organization Setup',
          steps: [
            { text: lang === 'ar' ? 'بعد إنشاء حسابك، ستظهر شاشة إنشاء المؤسسة. أدخل اسم المؤسسة وبياناتها.' : 'After registering, you\'ll see the organization setup screen. Enter your organization name and details.' },
            { text: lang === 'ar' ? 'سيتم ربطك تلقائيًا كمالك للمؤسسة مع جميع الصلاحيات.' : 'You\'ll be automatically linked as the organization owner with full privileges.' },
            { text: lang === 'ar' ? 'من الإعدادات، أكمل بيانات الشركة، الفروع، المخازن، والعملات.' : 'From Settings, complete company info, branches, warehouses, and currencies.', action: 'settings' },
          ],
        },
        {
          title: lang === 'ar' ? 'إضافة الموظفين' : 'Adding Employees',
          steps: [
            { text: lang === 'ar' ? 'من لوحة المالك، تبويب "المستخدمون"، يمكنك دعوة موظفين عبر البريد الإلكتروني.' : 'From the Owner Panel, "Users" tab, invite employees by email.' },
            { text: lang === 'ar' ? 'يحتاج الموظف لتسجيل حساب أولاً، ثم تتم دعوته وتحديد دوره.' : 'The employee must register first, then you invite them and assign their role.' },
            { text: lang === 'ar' ? 'يمكنك تعيين أدوار: مدير، محاسب، مبيعات، كاشير، مخزون، إلخ.' : 'You can assign roles: admin, accountant, sales, cashier, warehouse, etc.' },
          ],
        },
        {
          title: lang === 'ar' ? 'إعداد الحسابات' : 'Chart of Accounts Setup',
          steps: [
            { text: lang === 'ar' ? 'من المحاسبة، أنشئ دليل الحسابات الخاص بمؤسستك.' : 'From Accounting, create your chart of accounts.', action: 'accounting' },
            { text: lang === 'ar' ? 'يأتي النظام بدليل حسابات افتراضي يمكنك تعديله.' : 'The system comes with a default chart of accounts you can modify.' },
            { text: lang === 'ar' ? 'أضف الحسابات اللازمة: الأصول، الخصومات، حقوق الملكية، الإيرادات، المصروفات.' : 'Add needed accounts: assets, liabilities, equity, revenue, expenses.' },
          ],
        },
        {
          title: lang === 'ar' ? 'تسجيل العمليات اليومية' : 'Daily Operations',
          steps: [
            { text: lang === 'ar' ? 'الفواتير: سجل فواتير المبيعات والمشتريات ومرحّلها تلقائيًا للمحاسبة.' : 'Invoices: record sales/purchase invoices, auto-posted to accounting.', action: 'invoices' },
            { text: lang === 'ar' ? 'السندات: سجل المقبوضات والمدفوعات واربطها بالعملاء والموردين.' : 'Receipts: record receipts and payments, linked to customers and suppliers.', action: 'receipts' },
            { text: lang === 'ar' ? 'المخزون: أضف المنتجات وحركات المخزون وراقب الأرصدة.' : 'Inventory: add products and stock movements, monitor balances.', action: 'inventory' },
            { text: lang === 'ar' ? 'التقارير: راجع ميزان المراجعة، قائمة الدخل، المركز المالي.' : 'Reports: review trial balance, income statement, balance sheet.', action: 'reports' },
          ],
        },
        {
          title: lang === 'ar' ? 'الصرافة والحوالات متعددة العملات' : 'Exchange & Multi-Currency Transfers',
          steps: [
            { text: lang === 'ar' ? 'من الصرافة، أنشئ حوالة بعملة واستلمها بصندوق بعملة أخرى بسعر صرف ثابت.' : 'From Exchange, create a transfer in one currency and receive in another at a fixed rate.', action: 'exchange' },
            { text: lang === 'ar' ? 'أدخل المبلغ، عملة الحوالة، عملة الصندوق، وسعر الصرف (مثال: 1 دولار = 500 ريال).' : 'Enter amount, transfer currency, cash currency, and rate (e.g., 1 USD = 500 YER).' },
            { text: lang === 'ar' ? 'اختر نوع العمولة (ثابتة أو نسبة) ومن يتحملها (المرسل أو المستفيد).' : 'Choose commission type (fixed or percentage) and bearer (sender or beneficiary).' },
            { text: lang === 'ar' ? 'سيظهر: المبلغ الأصلي، المقابل بعملة الصندوق، العمولة، والصافي.' : 'It shows: original amount, cash equivalent, commission, and net amount.' },
          ],
        },
        {
          title: lang === 'ar' ? 'المخزون والتحويل بين المخازن' : 'Inventory & Warehouse Transfers',
          steps: [
            { text: lang === 'ar' ? 'من المخزون، سجل حركات الإدخال والإخراج والتسوية.' : 'From Inventory, record stock in/out/adjustment movements.', action: 'inventory' },
            { text: lang === 'ar' ? 'لتحويل صنف من مخزن لآخر، اضغط أيقونة التحويل واختر المخزن المصدر والوجهة.' : 'To transfer an item between warehouses, click the transfer icon and select source and destination.' },
          ],
        },
        {
          title: lang === 'ar' ? 'الزكاة والمواريث والوقود' : 'Zakat, Inheritance & Fuel',
          steps: [
            { text: lang === 'ar' ? 'الزكاة: احسب زكاة المال (2.5%) على النقد والذمم والمخزون وفق السنة الهجرية.' : 'Zakat: calculate 2.5% wealth tax on cash, receivables, and inventory by Hijri year.', action: 'zakat' },
            { text: lang === 'ar' ? 'المواريث: سجل التركة والورثة وأنصبتهم ووزع الميراث.' : 'Inheritance: record estates, heirs, their shares, and distribute inheritance.', action: 'inheritance' },
            { text: lang === 'ar' ? 'الوقود والأسطول: سجل المركبات وحركات الوقود والكلفة.' : 'Fuel & Fleet: record vehicles, fuel transactions, and costs.', action: 'fuel' },
          ],
        },
        {
          title: lang === 'ar' ? 'التقويم الهجري والتصدير' : 'Hijri Calendar & Export',
          steps: [
            { text: lang === 'ar' ? 'يظهر التاريخ الهجري بجانب الميلادي في الفواتير والسندات والورديات.' : 'Hijri date appears alongside Gregorian in invoices, receipts, and shifts.' },
            { text: lang === 'ar' ? 'يمكنك تصدير البيانات إلى CSV من معظم الصفحات (فواتير، سندات، مخزون، إلخ).' : 'You can export data to CSV from most pages (invoices, receipts, inventory, etc.).' },
            { text: lang === 'ar' ? 'في السندات، يمكنك تحديد تاريخ الاستلام الفعلي إذا حدث بعد منتصف الليل.' : 'In receipts, you can set an actual receipt date for post-midnight transactions.' },
          ],
        },
      ],
    },
    employee: {
      role: lang === 'ar' ? 'الموظف' : 'Employee',
      icon: User,
      color: 'bg-success-600',
      sections: [
        {
          title: lang === 'ar' ? 'قبول الدعوة والدخول' : 'Accepting Invitation',
          steps: [
            { text: lang === 'ar' ? 'سجل حسابك بالبريد الإلكتروني وكلمة المرور.' : 'Register your account with email and password.' },
            { text: lang === 'ar' ? 'بعد تسجيل الدخول، إذا تمت دعوتك، ستظهر مؤسستك تلقائيًا.' : 'After login, if you\'ve been invited, your organization will appear automatically.' },
            { text: lang === 'ar' ? 'إذا لم تُدعَ، تواصل مع مدير المؤسسة لإضافتك.' : 'If not invited, contact your organization manager to be added.' },
          ],
        },
        {
          title: lang === 'ar' ? 'الوحدات المتاحة لك' : 'Available Modules',
          steps: [
            { text: lang === 'ar' ? 'تظهر في القائمة الجانبية فقط الوحدات المسموح لك بها حسب دورك.' : 'The sidebar shows only modules allowed by your role.' },
            { text: lang === 'ar' ? 'إذا لم ترَ وحدة معينة، فهذا يعني أنك لا تملك صلاحية الوصول إليها.' : 'If you don\'t see a module, you don\'t have permission to access it.' },
          ],
        },
        {
          title: lang === 'ar' ? 'المهام اليومية' : 'Daily Tasks',
          steps: [
            { text: lang === 'ar' ? 'تسجيل فاتورة: من الفواتير، اضغط "فاتورة جديدة" واختر النوع والعميل.' : 'Recording an invoice: from Invoices, click "New Invoice" and select type and customer.', action: 'invoices' },
            { text: lang === 'ar' ? 'قبض/صرف: من السندات، سجل المقبوضات والمدفوعات.' : 'Receipt/Payment: from Receipts, record receipts and payments.', action: 'receipts' },
            { text: lang === 'ar' ? 'حركة مخزون: من المخزون، سجل حركات الدخول والخروج.' : 'Stock movement: from Inventory, record in/out movements.', action: 'inventory' },
            { text: lang === 'ar' ? 'فتح/إغلاق وردية: من الورديات، افتح الوردية في بداية العمل وأغلقها في النهاية.' : 'Open/close shift: from Shifts, open at start and close at end of work.', action: 'shifts' },
          ],
        },
        {
          title: lang === 'ar' ? 'الصلاحيات والرفض' : 'Permissions & Denials',
          steps: [
            { text: lang === 'ar' ? 'إذا رفض النظام إجراءً، فهذا يعني أنك لا تملك الصلاحية لتنفيذه.' : 'If the system denies an action, you don\'t have permission to perform it.' },
            { text: lang === 'ar' ? 'اطلب الصلاحية من مدير المؤسسة لتتمكن من تنفيذ الإجراء.' : 'Request the permission from your organization manager to perform the action.' },
            { text: lang === 'ar' ? 'لا يمكنك الاطلاع على بيانات غير مصرح بها أو إدارة المؤسسة.' : 'You cannot view unauthorized data or manage the organization.' },
          ],
        },
      ],
    },
    new_tenant: {
      role: lang === 'ar' ? 'تعليمات المستأجر الجديد' : 'New Tenant Guide',
      icon: UserPlus,
      color: 'bg-warning-600',
      sections: [
        {
          title: lang === 'ar' ? 'الخطوة 1: إنشاء الحساب' : 'Step 1: Create Account',
          steps: [
            { text: lang === 'ar' ? 'اضغط "إنشاء حساب" في صفحة الدخول.' : 'Click "Sign Up" on the login page.' },
            { text: lang === 'ar' ? 'أدخل اسمك، بريدك الإلكتروني، وكلمة مرور (6 أحرف على الأقل).' : 'Enter your name, email, and password (at least 6 characters).' },
            { text: lang === 'ar' ? 'بعد إنشاء الحساب، ستظهر شاشة إنشاء المؤسسة.' : 'After creating the account, you\'ll see the organization setup screen.' },
          ],
        },
        {
          title: lang === 'ar' ? 'الخطوة 2: إنشاء المؤسسة' : 'Step 2: Create Organization',
          steps: [
            { text: lang === 'ar' ? 'أدخل اسم مؤسستك وبياناتها (الهاتف، العنوان).' : 'Enter your organization name and details (phone, address).' },
            { text: lang === 'ar' ? 'سيتم ربطك كمالك للمؤسسة تلقائيًا.' : 'You\'ll be linked as the organization owner automatically.' },
          ],
        },
        {
          title: lang === 'ar' ? 'الخطوة 3: الإعداد الأولي' : 'Step 3: Initial Setup',
          steps: [
            { text: lang === 'ar' ? 'من الإعدادات: أكمل بيانات الشركة، أضف الفروع والمخازن.' : 'From Settings: complete company info, add branches and warehouses.', action: 'settings' },
            { text: lang === 'ar' ? 'من المحاسبة: راجع دليل الحسابات الافتراضي وعدّله حسب احتياجك.' : 'From Accounting: review the default chart of accounts and modify as needed.', action: 'accounting' },
            { text: lang === 'ar' ? 'من المخزون: أضف منتجاتك ووحدات القياس.' : 'From Inventory: add your products and units of measure.', action: 'inventory' },
            { text: lang === 'ar' ? 'من جهات الاتصال: أضف عملاءك ومورديك.' : 'From Contacts: add your customers and suppliers.', action: 'contacts' },
          ],
        },
        {
          title: lang === 'ar' ? 'الخطوة 4: البدء بالعمليات' : 'Step 4: Start Operations',
          steps: [
            { text: lang === 'ar' ? 'سجل أول فاتورة من الفواتير.' : 'Record your first invoice from Invoices.', action: 'invoices' },
            { text: lang === 'ar' ? 'سجل أول سند قبض أو صرف من السندات.' : 'Record your first receipt or payment from Receipts.', action: 'receipts' },
            { text: lang === 'ar' ? 'راجع التقارير لمتابعة أداء مؤسستك.' : 'Review reports to monitor your organization\'s performance.', action: 'reports' },
          ],
        },
      ],
    },
  };

  function getRelevantGuides(): Guide[] {
    if (isOwner) return [guides.owner, guides.new_tenant];
    if (roleName === 'owner') return [guides.tenant_owner, guides.new_tenant, guides.employee];
    return [guides.employee, guides.new_tenant];
  }

  const relevantGuides = getRelevantGuides();

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center"><HelpCircle className="w-5 h-5 text-white" /></div>
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">{lang === 'ar' ? 'دليل الاستخدام والمساعدة' : 'Usage Guide & Help'}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">{lang === 'ar' ? 'إرشادات عملية حسب دورك وصلاحياتك' : 'Practical guides based on your role and permissions'}</p>
        </div>
      </div>

      {relevantGuides.map((guide, gi) => {
        const Icon = guide.icon;
        return (
          <div key={gi} className="card overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--color-border)]">
              <div className={`w-10 h-10 rounded-lg ${guide.color} flex items-center justify-center`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-bold text-[var(--color-text)]">{guide.role}</h3>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {guide.sections.map((section, si) => {
                const sectionKey = `${gi}-${si}`;
                const isOpen = openSection === sectionKey;
                return (
                  <div key={si}>
                    <button
                      onClick={() => setOpenSection(isOpen ? null : sectionKey)}
                      className="w-full flex items-center justify-between px-5 py-3 hover:bg-[var(--color-bg)] transition-colors text-start"
                    >
                      <span className="font-medium text-[var(--color-text)] text-sm">{section.title}</span>
                      {isOpen ? <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" /> : <ChevronRight className={`w-4 h-4 text-[var(--color-text-muted)] shrink-0 ${lang === 'ar' ? 'rotate-180' : ''}`} />}
                    </button>
                    {isOpen && (
                      <div className="px-5 pb-4 space-y-2 animate-fade-in">
                        {section.steps.map((step, ssi) => (
                          <div key={ssi} className="flex items-start gap-3">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-xs font-bold flex items-center justify-center mt-0.5">{ssi + 1}</span>
                            <div className="flex-1">
                              <span className="text-sm text-[var(--color-text)]">{step.text}</span>
                              {step.action && (
                                <button onClick={() => onNavigate(step.action!)} className="ms-2 text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium">
                                  {lang === 'ar' ? 'اذهب' : 'Go'}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
