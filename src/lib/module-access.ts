export const roleAliases: Record<string, string> = {
  owner: 'owner',
  مالك: 'owner',
  'مالك النظام': 'owner',
  admin: 'admin',
  administrator: 'admin',
  مدير: 'admin',
  accountant: 'accountant',
  محاسب: 'accountant',
  manager: 'manager',
  sales: 'sales',
  مبيعات: 'sales',
  purchasing: 'purchasing',
  مشتريات: 'purchasing',
  warehouse: 'warehouse',
  مخازن: 'warehouse',
  cashier: 'cashier',
  'أمين صندوق': 'cashier',
  exchange_agent: 'exchange_agent',
  صراف: 'exchange_agent',
  auditor: 'auditor',
  مدقق: 'auditor',
  employee: 'employee',
  موظف: 'employee',
};

export const roleModules: Record<string, string[]> = {
  owner: ['dashboard', 'contacts', 'invoices', 'receipts', 'accounting', 'inventory', 'exchange', 'reports', 'shifts', 'zakat', 'fuel', 'inheritance', 'fixed_assets', 'settings', 'knowledge', 'help', 'owner', 'memory'],
  admin: ['dashboard', 'contacts', 'invoices', 'receipts', 'accounting', 'inventory', 'exchange', 'reports', 'shifts', 'zakat', 'fuel', 'inheritance', 'fixed_assets', 'settings', 'knowledge', 'help'],
  accountant: ['dashboard', 'contacts', 'invoices', 'receipts', 'accounting', 'reports', 'zakat', 'fixed_assets', 'settings', 'knowledge', 'help'],
  manager: ['dashboard', 'contacts', 'invoices', 'receipts', 'inventory', 'exchange', 'reports', 'shifts', 'fuel', 'inheritance', 'fixed_assets', 'settings', 'knowledge', 'help'],
  sales: ['dashboard', 'contacts', 'invoices', 'receipts', 'inventory', 'shifts', 'help'],
  purchasing: ['dashboard', 'contacts', 'invoices', 'inventory', 'help'],
  warehouse: ['dashboard', 'inventory', 'help'],
  cashier: ['dashboard', 'receipts', 'shifts', 'exchange', 'help'],
  exchange_agent: ['dashboard', 'exchange', 'shifts', 'help'],
  auditor: ['dashboard', 'reports', 'accounting', 'knowledge', 'help'],
  employee: ['dashboard', 'help'],
};

export function normalizeRoleName(name?: string | null, nameAr?: string | null, isOwner = false): string {
  if (isOwner) return 'owner';
  const primary = name?.trim().toLowerCase() ?? '';
  const secondary = nameAr?.trim().toLowerCase() ?? '';
  return roleAliases[primary] ?? roleAliases[secondary] ?? 'employee';
}

export function canAccessModule(moduleCode: string, roleName: string, isOwner: boolean): boolean {
  if (moduleCode === 'owner' || moduleCode === 'memory') return isOwner;
  const normalizedRole = isOwner ? 'owner' : roleName;
  return (roleModules[normalizedRole] ?? roleModules.employee).includes(moduleCode);
}
