-- Invoice payment mode, optional per-invoice tax, and itemized purchase landed costs.
-- This migration is intentionally committed to the isolated Git branch only; do not apply to production without a separate approval.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'credit' CHECK (payment_method IN ('cash','credit')),
  ADD COLUMN IF NOT EXISTS cash_account_id uuid NULL REFERENCES public.chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS tax_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_rate numeric(7,4) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100);

-- Existing invoices keep their stored amounts and historical metadata unchanged.

CREATE TABLE IF NOT EXISTS public.invoice_additional_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text NOT NULL CHECK (length(trim(description)) > 0),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL CHECK (payment_method IN ('cash','credit')),
  cash_account_id uuid NULL REFERENCES public.chart_of_accounts(id),
  party_id uuid NULL REFERENCES public.parties(id),
  line_order integer NOT NULL DEFAULT 0,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_additional_costs_payment_target_check CHECK (
    (payment_method='cash' AND cash_account_id IS NOT NULL AND party_id IS NULL) OR
    (payment_method='credit' AND party_id IS NOT NULL AND cash_account_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS invoice_additional_costs_invoice_idx
  ON public.invoice_additional_costs(tenant_id, invoice_id, line_order);
ALTER TABLE public.invoice_additional_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_additional_costs_select_tenant ON public.invoice_additional_costs;
DROP POLICY IF EXISTS invoice_additional_costs_insert_tenant ON public.invoice_additional_costs;
DROP POLICY IF EXISTS invoice_additional_costs_update_tenant ON public.invoice_additional_costs;
DROP POLICY IF EXISTS invoice_additional_costs_delete_tenant ON public.invoice_additional_costs;
CREATE POLICY invoice_additional_costs_select_tenant ON public.invoice_additional_costs FOR SELECT TO authenticated
  USING (tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id=auth.uid()) AND EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.user_id=auth.uid() AND tm.tenant_id=invoice_additional_costs.tenant_id AND tm.status='active'));
CREATE POLICY invoice_additional_costs_insert_tenant ON public.invoice_additional_costs FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id=auth.uid()) AND EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.user_id=auth.uid() AND tm.tenant_id=invoice_additional_costs.tenant_id AND tm.status='active'));
CREATE POLICY invoice_additional_costs_update_tenant ON public.invoice_additional_costs FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id=auth.uid()) AND EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.user_id=auth.uid() AND tm.tenant_id=invoice_additional_costs.tenant_id AND tm.status='active'))
  WITH CHECK (tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id=auth.uid()) AND EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.user_id=auth.uid() AND tm.tenant_id=invoice_additional_costs.tenant_id AND tm.status='active'));
CREATE POLICY invoice_additional_costs_delete_tenant ON public.invoice_additional_costs FOR DELETE TO authenticated
  USING (tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id=auth.uid()) AND EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.user_id=auth.uid() AND tm.tenant_id=invoice_additional_costs.tenant_id AND tm.status='active'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_additional_costs TO authenticated;

CREATE OR REPLACE FUNCTION public.post_invoice_unchecked_20261014(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid; v_user_id uuid:=auth.uid(); v_invoice record; v_lines record; v_entry_id uuid; v_entry_number text;
  v_party_account uuid; v_revenue_account uuid; v_tax_account uuid; v_cogs_account uuid; v_inventory_account uuid;
  v_cash_account uuid; v_cost_party_account uuid; v_cost record;
  v_cost_total numeric(18,2):=0; v_product_lines_total numeric(18,2):=0; v_stock_unit_cost numeric(18,2):=0; v_allocated_cost numeric(18,2):=0;
  v_total_debit numeric(18,2):=0; v_total_credit numeric(18,2):=0;
begin
  select tenant_id into v_tenant_id from public.profiles where id=v_user_id limit 1;
  if v_tenant_id is null then return jsonb_build_object('success',false,'error','no_profile'); end if;
  if not exists(select 1 from public.tenant_members tm where tm.user_id=v_user_id and tm.tenant_id=v_tenant_id and tm.status='active') then
    return jsonb_build_object('success',false,'error','not_authorized');
  end if;
  select * into v_invoice from public.invoices where id=p_invoice_id and tenant_id=v_tenant_id FOR UPDATE;
  if not found then return jsonb_build_object('success',false,'error','not_found'); end if;
  if v_invoice.status<>'draft' then return jsonb_build_object('success',false,'error','not_draft'); end if;

  select coalesce(sum(amount),0) into v_cost_total from public.invoice_additional_costs where invoice_id=p_invoice_id and tenant_id=v_tenant_id;
  if v_invoice.payment_method='cash' then
    select id into v_cash_account from public.chart_of_accounts where id=v_invoice.cash_account_id and tenant_id=v_tenant_id and type='asset' and is_active=true and is_postable=true;
    if v_cash_account is null then return jsonb_build_object('success',false,'error','missing_cash_account'); end if;
  end if;
  if v_cost_total>0 then
    select coalesce(sum(greatest(0,line_total)),0) into v_product_lines_total from public.invoice_lines where invoice_id=p_invoice_id and tenant_id=v_tenant_id and product_id is not null and quantity>0;
    if v_product_lines_total<=0 then return jsonb_build_object('success',false,'error','additional_costs_require_stock_lines'); end if;
    if exists(select 1 from public.invoice_additional_costs c where c.invoice_id=p_invoice_id and c.tenant_id=v_tenant_id and c.payment_method='cash' and not exists(select 1 from public.chart_of_accounts a where a.id=c.cash_account_id and a.tenant_id=v_tenant_id and a.type='asset' and a.is_active=true and a.is_postable=true)) then
      return jsonb_build_object('success',false,'error','missing_cost_cash_account');
    end if;
    if exists(select 1 from public.invoice_additional_costs c where c.invoice_id=p_invoice_id and c.tenant_id=v_tenant_id and c.payment_method='credit' and not exists(select 1 from public.parties p where p.id=c.party_id and p.tenant_id=v_tenant_id)) then
      return jsonb_build_object('success',false,'error','missing_cost_party');
    end if;
  end if;

  select id into v_revenue_account from public.chart_of_accounts where tenant_id=v_tenant_id and type='revenue' and is_postable=true order by code limit 1;
  select id into v_tax_account from public.chart_of_accounts where tenant_id=v_tenant_id and sub_type='tax' and is_postable=true order by code limit 1;
  select id into v_cogs_account from public.chart_of_accounts where tenant_id=v_tenant_id and sub_type='cogs' and is_postable=true order by code limit 1;
  select id into v_inventory_account from public.chart_of_accounts where tenant_id=v_tenant_id and sub_type='inventory' and is_postable=true and is_active=true order by code limit 1;

  select pr.account_id into v_party_account from public.party_roles pr
  where pr.party_id=v_invoice.party_id and (
    (v_invoice.type in ('sale','return_purchase') and pr.role='customer') or
    (v_invoice.type in ('purchase','return_sale') and pr.role='supplier')
  ) limit 1;

  if v_party_account is null then
    if v_invoice.type in ('sale','return_purchase') then
      select id into v_party_account from public.chart_of_accounts where tenant_id=v_tenant_id and sub_type='accounts_receivable' and is_postable=true order by code limit 1;
    else
      select id into v_party_account from public.chart_of_accounts where tenant_id=v_tenant_id and sub_type='accounts_payable' and is_postable=true order by code limit 1;
    end if;
  end if;

  if (v_party_account is null and v_invoice.payment_method<>'cash') or (v_invoice.type in ('sale','return_sale') and v_revenue_account is null) or
     (v_invoice.type='purchase' and (case when v_cost_total>0 then v_inventory_account else v_cogs_account end) is null) or
     (v_invoice.type='return_purchase' and v_cogs_account is null) or
     (v_invoice.tax_amount>0 and v_tax_account is null) then
    return jsonb_build_object('success',false,'error','missing_account');
  end if;

  v_entry_number:='JE-INV-'||v_invoice.invoice_number;
  insert into public.journal_entries(tenant_id,entry_number,date,description,reference_type,reference_id,status,created_by,branch_id)
  values(v_tenant_id,v_entry_number,v_invoice.date,'Invoice '||v_invoice.invoice_number,'invoice',p_invoice_id,'draft',v_user_id,v_invoice.branch_id)
  returning id into v_entry_id;

  if v_invoice.type='sale' then
    insert into public.journal_lines(journal_entry_id,tenant_id,account_id,party_id,description,debit,credit,currency,exchange_rate,line_order)
    values(v_entry_id,v_tenant_id,case when v_invoice.payment_method='cash' then v_cash_account else v_party_account end,case when v_invoice.payment_method='cash' then null else v_invoice.party_id end,case when v_invoice.payment_method='cash' then 'Cash sale - ' else 'AR - ' end||v_invoice.invoice_number,v_invoice.total,0,v_invoice.currency,1,0);
    v_total_debit:=v_total_debit+v_invoice.total;
    insert into public.journal_lines(journal_entry_id,tenant_id,account_id,description,debit,credit,currency,exchange_rate,line_order)
    values(v_entry_id,v_tenant_id,v_revenue_account,'Revenue - '||v_invoice.invoice_number,0,(v_invoice.subtotal-v_invoice.discount_amount),v_invoice.currency,1,1);
    v_total_credit:=v_total_credit+(v_invoice.subtotal-v_invoice.discount_amount);
    if v_invoice.tax_amount>0 then
      insert into public.journal_lines(journal_entry_id,tenant_id,account_id,description,debit,credit,currency,exchange_rate,line_order)
      values(v_entry_id,v_tenant_id,v_tax_account,'Tax - '||v_invoice.invoice_number,0,v_invoice.tax_amount,v_invoice.currency,1,2);
      v_total_credit:=v_total_credit+v_invoice.tax_amount;
    end if;
  elsif v_invoice.type='purchase' then
    insert into public.journal_lines(journal_entry_id,tenant_id,account_id,description,debit,credit,currency,exchange_rate,line_order)
    values(v_entry_id,v_tenant_id,case when v_cost_total>0 then v_inventory_account else v_cogs_account end,case when v_cost_total>0 then 'Inventory purchase - ' else 'COGS - ' end||v_invoice.invoice_number,(v_invoice.subtotal-v_invoice.discount_amount),0,v_invoice.currency,1,0);
    v_total_debit:=v_total_debit+(v_invoice.subtotal-v_invoice.discount_amount);
    if v_invoice.tax_amount>0 then
      insert into public.journal_lines(journal_entry_id,tenant_id,account_id,description,debit,credit,currency,exchange_rate,line_order)
      values(v_entry_id,v_tenant_id,v_tax_account,'Tax - '||v_invoice.invoice_number,v_invoice.tax_amount,0,v_invoice.currency,1,1);
      v_total_debit:=v_total_debit+v_invoice.tax_amount;
    end if;
    insert into public.journal_lines(journal_entry_id,tenant_id,account_id,party_id,description,debit,credit,currency,exchange_rate,line_order)
    values(v_entry_id,v_tenant_id,case when v_invoice.payment_method='cash' then v_cash_account else v_party_account end,case when v_invoice.payment_method='cash' then null else v_invoice.party_id end,case when v_invoice.payment_method='cash' then 'Cash purchase - ' else 'AP - ' end||v_invoice.invoice_number,0,v_invoice.total,v_invoice.currency,1,2);
    v_total_credit:=v_total_credit+v_invoice.total;
    for v_cost in select * from public.invoice_additional_costs where invoice_id=p_invoice_id and tenant_id=v_tenant_id order by line_order loop
      if v_cost.payment_method='cash' then
        v_cost_party_account:=v_cost.cash_account_id;
      else
        select pr.account_id into v_cost_party_account from public.party_roles pr where pr.party_id=v_cost.party_id and pr.role='supplier' limit 1;
        if v_cost_party_account is null then select id into v_cost_party_account from public.chart_of_accounts where tenant_id=v_tenant_id and sub_type='accounts_payable' and is_postable=true order by code limit 1; end if;
      end if;
      if v_cost_party_account is null then raise exception 'Missing payable account for additional cost'; end if;
      insert into public.journal_lines(journal_entry_id,tenant_id,account_id,description,debit,credit,currency,exchange_rate,line_order)
      values(v_entry_id,v_tenant_id,v_inventory_account,'Capitalized cost - '||v_cost.description,v_cost.amount,0,v_invoice.currency,1,10+v_cost.line_order);
      insert into public.journal_lines(journal_entry_id,tenant_id,account_id,party_id,description,debit,credit,currency,exchange_rate,line_order)
      values(v_entry_id,v_tenant_id,v_cost_party_account,case when v_cost.payment_method='credit' then v_cost.party_id else null end,case when v_cost.payment_method='cash' then 'Cash cost - ' else 'Cost payable - ' end||v_cost.description,0,v_cost.amount,v_invoice.currency,1,100+v_cost.line_order);
      v_total_debit:=v_total_debit+v_cost.amount;
      v_total_credit:=v_total_credit+v_cost.amount;
    end loop;
  elsif v_invoice.type='return_sale' then
    insert into public.journal_lines(journal_entry_id,tenant_id,account_id,party_id,description,debit,credit,currency,exchange_rate,line_order)
    values(v_entry_id,v_tenant_id,case when v_invoice.payment_method='cash' then v_cash_account else v_party_account end,case when v_invoice.payment_method='cash' then null else v_invoice.party_id end,case when v_invoice.payment_method='cash' then 'Cash sale return - ' else 'AR Return - ' end||v_invoice.invoice_number,0,v_invoice.total,v_invoice.currency,1,0);
    v_total_credit:=v_total_credit+v_invoice.total;
    insert into public.journal_lines(journal_entry_id,tenant_id,account_id,description,debit,credit,currency,exchange_rate,line_order)
    values(v_entry_id,v_tenant_id,v_revenue_account,'Revenue Return - '||v_invoice.invoice_number,(v_invoice.subtotal-v_invoice.discount_amount),0,v_invoice.currency,1,1);
    v_total_debit:=v_total_debit+(v_invoice.subtotal-v_invoice.discount_amount);
    if v_invoice.tax_amount>0 then
      insert into public.journal_lines(journal_entry_id,tenant_id,account_id,description,debit,credit,currency,exchange_rate,line_order)
      values(v_entry_id,v_tenant_id,v_tax_account,'Tax Return - '||v_invoice.invoice_number,v_invoice.tax_amount,0,v_invoice.currency,1,2);
      v_total_debit:=v_total_debit+v_invoice.tax_amount;
    end if;
  elsif v_invoice.type='return_purchase' then
    insert into public.journal_lines(journal_entry_id,tenant_id,account_id,description,debit,credit,currency,exchange_rate,line_order)
    values(v_entry_id,v_tenant_id,v_cogs_account,'COGS Return - '||v_invoice.invoice_number,0,(v_invoice.subtotal-v_invoice.discount_amount),v_invoice.currency,1,0);
    v_total_credit:=v_total_credit+(v_invoice.subtotal-v_invoice.discount_amount);
    if v_invoice.tax_amount>0 then
      insert into public.journal_lines(journal_entry_id,tenant_id,account_id,description,debit,credit,currency,exchange_rate,line_order)
      values(v_entry_id,v_tenant_id,v_tax_account,'Tax Return - '||v_invoice.invoice_number,0,v_invoice.tax_amount,v_invoice.currency,1,1);
      v_total_credit:=v_total_credit+v_invoice.tax_amount;
    end if;
    insert into public.journal_lines(journal_entry_id,tenant_id,account_id,party_id,description,debit,credit,currency,exchange_rate,line_order)
    values(v_entry_id,v_tenant_id,case when v_invoice.payment_method='cash' then v_cash_account else v_party_account end,case when v_invoice.payment_method='cash' then null else v_invoice.party_id end,case when v_invoice.payment_method='cash' then 'Cash purchase return - ' else 'AP Return - ' end||v_invoice.invoice_number,v_invoice.total,0,v_invoice.currency,1,2);
    v_total_debit:=v_total_debit+v_invoice.total;
  else
    return jsonb_build_object('success',false,'error','invalid_invoice_type');
  end if;

  if v_total_debit=0 or v_total_debit<>v_total_credit then
    raise exception 'Invoice generated unbalanced journal entry: debit %, credit %',v_total_debit,v_total_credit;
  end if;

  for v_lines in select * from public.invoice_lines where invoice_id=p_invoice_id and tenant_id=v_tenant_id loop
    v_stock_unit_cost:=v_lines.unit_price;
    if v_invoice.type='purchase' and v_cost_total>0 and v_product_lines_total>0 and v_lines.product_id is not null and v_lines.quantity>0 then
      v_allocated_cost:=v_cost_total*greatest(0,v_lines.line_total)/v_product_lines_total;
      v_stock_unit_cost:=greatest(0,(greatest(0,v_lines.line_total)+v_allocated_cost)/v_lines.quantity);
    end if;
    if v_lines.product_id is not null and v_invoice.warehouse_id is not null then
      insert into public.stock_movements(tenant_id,product_id,warehouse_id,movement_type,quantity,unit_cost,reference_type,reference_id,created_by)
      values(v_tenant_id,v_lines.product_id,v_invoice.warehouse_id,
        case when v_invoice.type in ('sale','return_purchase') then 'out' else 'in' end,
        v_lines.quantity,v_stock_unit_cost,'invoice',p_invoice_id,v_user_id);
    end if;
  end loop;

  update public.journal_entries set status='posted',posted_at=now(),posted_by=v_user_id,updated_at=now() where id=v_entry_id;
  update public.invoices set status='posted',posted_at=now(),posted_by=v_user_id,updated_at=now() where id=p_invoice_id;
  insert into public.audit_logs(tenant_id,user_id,action,entity_type,entity_id,entity_name,new_values)
  values(v_tenant_id,v_user_id,'post_invoice','invoice',p_invoice_id,v_invoice.invoice_number,jsonb_build_object('status','posted','total',v_invoice.total,'journal_entry_id',v_entry_id));
  return jsonb_build_object('success',true,'journal_entry_id',v_entry_id);
end;
$function$

