export type AccountStatus = 'active' | 'suspended' | 'trial' | 'expired' | 'canceled';

export interface OwnerAccountSettings {
  theme?: 'light' | 'dark' | 'system' | 'high-contrast';
  language?: 'ar' | 'en';
  timezone?: string;
  currency?: string;
  custom_domain?: string;
  [key: string]: unknown; // بديل أمن لـ any يضمن عدم حدوث أخطاء TypeScript
}

export interface OwnerAccount {
  id: string;
  name: string;
  name_ar: string;
  slug: string;
  status: AccountStatus | string;
  plan_id?: string | null;
  is_owner: boolean;
  max_users: number;
  settings?: OwnerAccountSettings;
  trial_ends_at?: string | null;
  subscription_ends_at?: string | null;
  created_at?: string;
}

export default OwnerAccount;
