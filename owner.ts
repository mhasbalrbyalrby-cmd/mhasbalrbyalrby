export interface OwnerAccount {
  id: string;
  name: string;
  name_ar: string;
  slug: string;
  status: string;
  plan_id?: string | null;
  is_owner: boolean;
  max_users: number;
  settings?: Record<string, any>;
  trial_ends_at?: string | null;
  subscription_ends_at?: string | null;
}
