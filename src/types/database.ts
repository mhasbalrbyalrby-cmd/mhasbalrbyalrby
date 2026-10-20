export type TenantStatus = 'pending' | 'trial' | 'active' | 'suspended' | 'expired' | 'cancelled';

export interface Tenant {
  id: string;
  name: string;
  name_ar: string | null;
  slug: string;
  status: TenantStatus;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  plan_id: string | null;
  is_owner: boolean;
  max_users: number;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  name_ar: string | null;
  code: string;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  trial_days: number;
  max_users: number;
  features: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
}

export interface Profile {
  id: string;
  tenant_id: string | null;
  full_name: string | null;
  full_name_ar: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export type RoleName =
  | 'owner' | 'admin' | 'accountant' | 'manager' | 'sales'
  | 'purchasing' | 'warehouse' | 'cashier' | 'exchange_agent'
  | 'auditor' | 'employee';

export interface Role {
  id: string;
  tenant_id: string | null;
  name: string;
  name_ar: string | null;
  description: string | null;
  is_system: boolean;
  sort_order: number;
}

export interface Permission {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  module: string;
  description: string | null;
}

export interface TenantMember {
  id: string;
  tenant_id: string;
  user_id: string;
  role_id: string | null;
  is_primary: boolean;
  invited_by: string | null;
  invited_at: string | null;
  joined_at: string | null;
  status: 'active' | 'invited' | 'suspended' | 'left';
  created_at: string;
  updated_at: string;
}

export interface ERPModule {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  description: string | null;
  icon: string;
  sort_order: number;
  is_active: boolean;
}

export interface AuditLog {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export type PrepaidCardStatus = 'active' | 'used' | 'cancelled' | 'expired';

export interface PrepaidCard {
  id: string;
  code: string;
  plan_id: string | null;
  duration_type: 'monthly' | 'yearly' | 'custom';
  duration_days: number;
  value: number;
  currency: string;
  status: PrepaidCardStatus;
  batch_id: string | null;
  created_by: string | null;
  used_by_tenant_id: string | null;
  used_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeArticle {
  id: string;
  tenant_id: string | null;
  category: 'requirements' | 'features' | 'decisions' | 'rules' | 'errors' | 'tests' | 'changelog' | 'guide';
  title: string;
  title_ar: string | null;
  content: string | null;
  content_ar: string | null;
  status: 'planned' | 'in_progress' | 'completed' | 'tested' | 'needs_review';
  tags: string[];
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SystemSetting {
  id: string;
  key: string;
  value: Record<string, unknown>;
  description: string | null;
  is_public: boolean;
  updated_by: string | null;
  updated_at: string;
}

export interface TenantSetting {
  tenant_id: string;
  settings: Record<string, unknown>;
  updated_by: string | null;
  updated_at: string;
}

// ============================================================
// Business Module Types
// ============================================================

export type PartyType = 'person' | 'company';
export type PartyRoleType = 'customer' | 'supplier' | 'employee' | 'agent' | 'other';

export interface Party {
  id: string;
  tenant_id: string;
  name: string;
  name_ar: string | null;
  type: PartyType;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  tax_number: string | null;
  id_number: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartyRole {
  id: string;
  party_id: string;
  role: PartyRoleType;
  account_id: string | null;
  credit_limit: number;
  opening_balance: number;
  opening_balance_currency: string;
  created_at: string;
}

export interface Currency {
  id: string;
  tenant_id: string | null;
  code: string;
  name: string;
  name_ar: string | null;
  symbol: string | null;
  is_base: boolean;
  decimals: number;
  is_active: boolean;
  created_at: string;
}

export interface ExchangeRate {
  id: string;
  tenant_id: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  date: string;
  created_by: string | null;
  created_at: string;
}

export interface Branch {
  id: string;
  tenant_id: string;
  name: string;
  name_ar: string | null;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Warehouse {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  name: string;
  name_ar: string | null;
  code: string | null;
  is_active: boolean;
  created_at: string;
}

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface ChartOfAccount {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  code: string;
  name: string;
  name_ar: string | null;
  type: AccountType;
  sub_type: string | null;
  is_active: boolean;
  is_postable: boolean;
  opening_balance: number;
  opening_balance_type: 'debit' | 'credit' | null;
  created_at: string;
  updated_at: string;
}

export type JournalEntryStatus = 'draft' | 'posted' | 'cancelled' | 'reversed';

export interface JournalEntry {
  id: string;
  tenant_id: string;
  entry_number: string;
  date: string;
  description: string | null;
  reference: string | null;
  reference_type: string | null;
  reference_id: string | null;
  status: JournalEntryStatus;
  posted_at: string | null;
  posted_by: string | null;
  created_by: string | null;
  branch_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface JournalLine {
  id: string;
  journal_entry_id: string;
  tenant_id: string;
  account_id: string;
  party_id: string | null;
  description: string | null;
  debit: number;
  credit: number;
  currency: string;
  amount_foreign: number | null;
  exchange_rate: number;
  line_order: number;
  created_at: string;
}

export type ProductType = 'product' | 'service';

export interface Product {
  id: string;
  tenant_id: string;
  code: string | null;
  name: string;
  name_ar: string | null;
  type: ProductType;
  barcode: string | null;
  description: string | null;
  cost_price: number | null;
  sale_price: number | null;
  min_stock: number;
  unit_id: string | null;
  category: string | null;
  image_url: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UnitOfMeasure {
  id: string;
  tenant_id: string;
  name: string;
  name_ar: string | null;
  is_base: boolean;
  created_at: string;
}

export interface ProductUnit {
  id: string;
  tenant_id: string;
  product_id: string;
  name: string;
  name_ar: string | null;
  factor: number;
  barcode: string | null;
  is_base: boolean;
  is_purchase_unit: boolean;
  is_sale_unit: boolean;
  allow_fraction: boolean;
  created_at: string;
}

export type StockMovementType = 'in' | 'out' | 'transfer' | 'adjustment' | 'return_in' | 'return_out';

export interface StockMovement {
  id: string;
  tenant_id: string;
  product_id: string;
  warehouse_id: string | null;
  movement_type: StockMovementType;
  quantity: number;
  unit_cost: number;
  reference_type: string | null;
  reference_id: string | null;
  created_by: string | null;
  created_at: string;
}

export type InvoiceType = 'sale' | 'purchase' | 'return_sale' | 'return_purchase';
export type InvoiceStatus = 'draft' | 'posted' | 'cancelled' | 'paid' | 'partial';

export interface Invoice {
  id: string;
  tenant_id: string;
  invoice_number: string;
  type: InvoiceType;
  party_id: string | null;
  date: string;
  due_date: string | null;
  payment_method: 'cash' | 'credit';
  cash_account_id: string | null;
  tax_enabled: boolean;
  tax_rate: number;
  currency: string;
  subtotal: number;
  discount_amount: number;
  discount_type: 'percentage' | 'amount' | null;
  tax_amount: number;
  total: number;
  status: InvoiceStatus;
  notes: string | null;
  branch_id: string | null;
  warehouse_id: string | null;
  shift_id: string | null;
  created_by: string | null;
  posted_at: string | null;
  posted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  tenant_id: string;
  product_id: string | null;
  description: string | null;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  discount_percentage: number;
  line_total: number;
  line_order: number;
  created_at: string;
}

export type ReceiptType = 'receipt' | 'payment' | 'transfer';
export type ReceiptStatus = 'draft' | 'posted' | 'cancelled';

export interface Receipt {
  id: string;
  tenant_id: string;
  receipt_number: string;
  type: ReceiptType;
  party_id: string | null;
  date: string;
  actual_receipt_date: string | null;
  amount: number;
  currency: string;
  exchange_rate: number;
  amount_base: number;
  account_id: string | null;
  method: 'cash' | 'bank' | 'card' | 'transfer' | 'cheque';
  reference: string | null;
  invoice_id: string | null;
  status: ReceiptStatus;
  notes: string | null;
  shift_id: string | null;
  created_by: string | null;
  posted_at: string | null;
  posted_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ShiftStatus = 'open' | 'closed' | 'cancelled';

export interface Shift {
  id: string;
  tenant_id: string;
  user_id: string;
  branch_id: string | null;
  start_time: string;
  end_time: string | null;
  opening_amount: number;
  closing_amount: number | null;
  status: ShiftStatus;
  notes: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
}

export type TransferStatus = 'pending' | 'sent' | 'delivered' | 'cancelled' | 'reversed';

export interface ExchangeTransfer {
  id: string;
  tenant_id: string;
  transfer_number: string;
  sender_name: string;
  sender_phone: string | null;
  beneficiary_name: string;
  beneficiary_phone: string | null;
  amount: number;
  currency: string;
  amount_base: number | null;
  cash_currency: string | null;
  exchange_rate: number | null;
  commission: number;
  commission_currency: string;
  commission_type: 'fixed' | 'percentage' | string;
  commission_bearer: 'sender' | 'beneficiary' | string;
  direction: 'outgoing' | 'incoming' | string;
  agent_id: string | null;
  date: string;
  status: TransferStatus;
  delivery_date: string | null;
  notes: string | null;
  shift_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIMessage {
  id: string;
  tenant_id: string;
  sender_number: string;
  raw_text: string;
  image_url?: string;
  parsed_data?: Record<string, unknown>;
  status: 'pending' | 'processed' | 'failed';
  created_at: string;
}

export type PunchType = 'check_in' | 'check_out' | 'shift_start' | 'shift_end' | 'verify_action';

export interface BiometricLog {
  id: string;
  tenant_id: string;
  user_id?: string;
  device_id: string;
  biometric_user_id: string;
  punch_type: PunchType;
  timestamp: string;
  status: string;
  created_at: string;
}


// Specialized module types backed by migrations 020 and 025.
export interface FixedAsset {
  id: string;
  tenant_id: string;
  asset_name: string;
  asset_name_ar: string | null;
  asset_code: string | null;
  category: string | null;
  purchase_date: string | null;
  purchase_cost: number;
  salvage_value: number;
  useful_life_years: number;
  depreciation_method: string;
  annual_depreciation: number;
  accumulated_depreciation: number;
  current_value: number;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ZakatRecord {
  id: string;
  tenant_id: string;
  hijri_year: string;
  nisab_date: string | null;
  nisab_hijri: string | null;
  haul_start: string | null;
  haul_end: string | null;
  cash_amount: number;
  receivables_amount: number;
  inventory_amount: number;
  other_amount: number;
  total_zakat_base: number;
  zakat_rate: number;
  zakat_due: number;
  zakat_paid: number;
  payment_date: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  notes: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}


// Inheritance module record shapes used by InheritancePage.
export interface Estate {
  id: string;
  tenant_id: string;
  deceased_name: string;
  date_of_death: string;
  total_assets: number;
  total_liabilities: number;
  net_estate: number;
  notes: string | null;
  created_at: string;
}

export interface Heir {
  id: string;
  tenant_id: string;
  estate_id: string;
  heir_name: string;
  relationship: string;
  share_fraction: string;
  calculated_amount: number;
  is_distributed: boolean;
  created_at: string;
}

export interface PartnerFamily {
  id: string;
  tenant_id: string;
  person_name: string;
  person_name_ar: string | null;
  relationship: string | null;
  gender: string | null;
  birth_date: string | null;
  national_id: string | null;
  phone: string | null;
  notes: string | null;
  is_deceased: boolean;
  date_of_death: string | null;
  created_by: string | null;
  created_at: string;
}
