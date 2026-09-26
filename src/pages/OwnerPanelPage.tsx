import { useI18n } from '../lib/i18n-context';
import { useAuth } from '../lib/auth-context';
import { Shield } from 'lucide-react';

export default function OwnerPanelPage() {
  const { lang } = useI18n();
  const { isOwner } = useAuth();

  if (!isOwner) {
    return (
      <div className="card text-center py-12 text-[var(--color-text-muted)]">
        {lang === 'ar' ? 'عفواً، لا تملك صلاحية الوصول لهذه الصفحة.' : 'Access Denied.'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card bg-gradient-to-r from-primary-600 to-primary-700 !border-0 text-white flex items-center gap-3">
        <Shield className="w-8 h-8" />
        <div>
          <h2 className="text-xl font-bold">
            {lang === 'ar' ? 'لوحة تحكم المالك' : 'Owner Control Center'}
          </h2>
          <p className="text-primary-100 text-sm mt-1">
            {lang === 'ar' ? 'إدارة المستأجرين والاشتراكات وإعدادات النظام' : 'Manage tenants, subscriptions and system settings'}
          </p>
        </div>
      </div>
    </div>
  );
}
