-- Phase 3 invoice payment/tax/additional-cost schema.
-- Repository-only migration file: do NOT apply to production without explicit approval.
begin;

alter table public.invoices
  add column if not exists payment_method text not null default 'credit'
    check (payment_method in ('cash','credit')),
  add column if not exists cash_account_id uuid null references public.chart_of_accounts(id),
  add column if not exists tax_enabled boolean not null default false,
  add column if not exists tax_rate numeric(7,4) not null default 0
    check (tax_rate >= 0 and tax_rate <= 100);

create table if not exists public.invoice_additional_costs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null check (length(trim(description)) > 0),
  amount numeric(18,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash','credit')),
  cash_account_id uuid null references public.chart_of_accounts(id),
  party_id uuid null references public.parties(id),
  line_order integer not null default 0,
  created_by uuid null,
  created_at timestamptz not null default now(),
  constraint invoice_additional_costs_payment_account_check check (
    (payment_method = 'cash' and cash_account_id is not null and party_id is null)
    or (payment_method = 'credit' and party_id is not null and cash_account_id is null)
  )
);

create index if not exists invoice_additional_costs_tenant_invoice_idx
  on public.invoice_additional_costs(tenant_id, invoice_id, line_order);

alter table public.invoice_additional_costs enable row level security;

grant select, insert, update, delete on public.invoice_additional_costs to authenticated;

drop policy if exists invoice_additional_costs_select_tenant on public.invoice_additional_costs;
create policy invoice_additional_costs_select_tenant
  on public.invoice_additional_costs for select to authenticated
  using (tenant_id = public.get_current_tenant_id());

drop policy if exists invoice_additional_costs_insert_tenant on public.invoice_additional_costs;
create policy invoice_additional_costs_insert_tenant
  on public.invoice_additional_costs for insert to authenticated
  with check (tenant_id = public.get_current_tenant_id());

drop policy if exists invoice_additional_costs_update_tenant on public.invoice_additional_costs;
create policy invoice_additional_costs_update_tenant
  on public.invoice_additional_costs for update to authenticated
  using (tenant_id = public.get_current_tenant_id())
  with check (tenant_id = public.get_current_tenant_id());

drop policy if exists invoice_additional_costs_delete_tenant on public.invoice_additional_costs;
create policy invoice_additional_costs_delete_tenant
  on public.invoice_additional_costs for delete to authenticated
  using (tenant_id = public.get_current_tenant_id());

commit;
