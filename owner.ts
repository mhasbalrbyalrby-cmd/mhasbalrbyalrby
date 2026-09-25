export interface OwnerStats {
  totalRevenue: number;
  totalSubscriptions: number;
  activeStores: number;
  systemHealth: string;
}

export interface SystemLog {
  id: string;
  created_at: string;
  action: string;
  details: string;
}
