-- Multi-unit product support. Additive only; do not run against production until reviewed and tested.
BEGIN;

ALTER TABLE public.product_units
  ADD COLUMN IF NOT EXISTS cost_price numeric(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sale_price numeric(18,4) NOT NULL DEFAULT 0;

ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS unit_id uuid NULL REFERENCES public.product_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_name_snapshot text NULL,
  ADD COLUMN IF NOT EXISTS conversion_factor numeric(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS base_quantity numeric(18,6) NOT NULL DEFAULT 1;

-- Preserve legacy invoice quantities as base-unit quantities.
UPDATE public.invoice_lines
SET base_quantity = quantity,
    conversion_factor = 1
WHERE unit_id IS NULL AND conversion_factor = 1 AND base_quantity = 1 AND quantity <> 1;

DO $$ BEGIN ALTER TABLE public.product_units ADD CONSTRAINT product_units_factor_positive CHECK (factor > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_units ADD CONSTRAINT product_units_cost_nonnegative CHECK (cost_price >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.product_units ADD CONSTRAINT product_units_sale_nonnegative CHECK (sale_price >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.invoice_lines ADD CONSTRAINT invoice_lines_conversion_factor_positive CHECK (conversion_factor > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.invoice_lines ADD CONSTRAINT invoice_lines_base_quantity_nonnegative CHECK (base_quantity >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Keep compatibility with older clients that insert invoice_lines without the new snapshot columns.
CREATE OR REPLACE FUNCTION public.set_invoice_line_base_quantity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $
BEGIN
  IF NEW.conversion_factor IS NULL OR NEW.conversion_factor <= 0 THEN
    RAISE EXCEPTION 'conversion_factor must be greater than zero';
  END IF;
  IF NEW.unit_id IS NULL AND NEW.conversion_factor = 1 THEN
    NEW.base_quantity := NEW.quantity;
  ELSIF NEW.base_quantity IS NULL OR NEW.base_quantity = 1 THEN
    NEW.base_quantity := NEW.quantity * NEW.conversion_factor;
  END IF;
  RETURN NEW;
END;
$;
DROP TRIGGER IF EXISTS invoice_lines_set_base_quantity ON public.invoice_lines;
CREATE TRIGGER invoice_lines_set_base_quantity
BEFORE INSERT OR UPDATE OF quantity, unit_id, conversion_factor, base_quantity
ON public.invoice_lines
FOR EACH ROW EXECUTE FUNCTION public.set_invoice_line_base_quantity();

-- Preserve the current posting workflow; stock movements now use immutable base quantity.
CREATE OR REPLACE FUNCTION public.post_invoice_unchecked_20261014(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid; v_user_id uuid:=auth.uid(); v_invoice record; v_lines record; v_entry_id uuid; v_entry_number text;
  v_party_account uuid; v_revenue_account uuid; v_tax_account uuid; v_cogs_account uuid;
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

  select id into v_revenue_account from public.chart_of_accounts where tenant_id=v_tenant_id and type='revenue' and is_postable=true order by code limit 1;
  select id into v_tax_account from public.chart_of_accounts where tenant_id=v_tenant_id and sub_type='tax' and is_postable=true order by code limit 1;
  select id into v_cogs_account from public.chart_of_accounts where tenant_id=v_tenant_id and sub_type='cogs' and is_postable=true order by code limit 1;

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

  if v_party_account is null or (v_invoice.type in ('sale','return_sale') and v_revenue_account is null) or
     (v_invoice.type in ('purchase','return_purchase') and v_cogs_account is null) or
     (v_invoice.tax_amount>0 and v_tax_account is null) then
    return jsonb_build_object('success',false,'error','missing_account');
  end if;

  v_entry_number:='JE-INV-'||v_invoice.invoice_number;
  insert into public.journal_entries(tenant_id,entry_number,date,description,reference_type,reference_id,status,created_by,branch_id)
  values(v_tenant_id,v_entry_number,v_invoice.date,'Invoice '||v_invoice.invoice_number,'invoice',p_invoice_id,'draft',v_user_id,v_invoice.branch_id)
  returning id into v_entry_id;

  if v_invoice.type='sale' then
    insert into public.journal_lines(journal_entry_id,tenant_id,account_id,party_id,description,debit,credit,currency,exchange_rate,line_order)
    values(v_entry_id,v_tenant_id,v_party_account,v_invoice.party_id,'AR - '||v_invoice.invoice_number,v_invoice.total,0,v_invoice.currency,1,0);
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
    values(v_entry_id,v_tenant_id,v_cogs_account,'COGS - '||v_invoice.invoice_number,(v_invoice.subtotal-v_invoice.discount_amount),0,v_invoice.currency,1,0);
    v_total_debit:=v_total_debit+(v_invoice.subtotal-v_invoice.discount_amount);
    if v_invoice.tax_amount>0 then
      insert into public.journal_lines(journal_entry_id,tenant_id,account_id,description,debit,credit,currency,exchange_rate,line_order)
      values(v_entry_id,v_tenant_id,v_tax_account,'Tax - '||v_invoice.invoice_number,v_invoice.tax_amount,0,v_invoice.currency,1,1);
      v_total_debit:=v_total_debit+v_invoice.tax_amount;
    end if;
    insert into public.journal_lines(journal_entry_id,tenant_id,account_id,party_id,description,debit,credit,currency,exchange_rate,line_order)
    values(v_entry_id,v_tenant_id,v_party_account,v_invoice.party_id,'AP - '||v_invoice.invoice_number,0,v_invoice.total,v_invoice.currency,1,2);
    v_total_credit:=v_total_credit+v_invoice.total;
  elsif v_invoice.type='return_sale' then
    insert into public.journal_lines(journal_entry_id,tenant_id,account_id,party_id,description,debit,credit,currency,exchange_rate,line_order)
    values(v_entry_id,v_tenant_id,v_party_account,v_invoice.party_id,'AR Return - '||v_invoice.invoice_number,0,v_invoice.total,v_invoice.currency,1,0);
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
    values(v_entry_id,v_tenant_id,v_party_account,v_invoice.party_id,'AP Return - '||v_invoice.invoice_number,v_invoice.total,0,v_invoice.currency,1,2);
    v_total_debit:=v_total_debit+v_invoice.total;
  else
    return jsonb_build_object('success',false,'error','invalid_invoice_type');
  end if;

  if v_total_debit=0 or v_total_debit<>v_total_credit then
    raise exception 'Invoice generated unbalanced journal entry: debit %, credit %',v_total_debit,v_total_credit;
  end if;

  for v_lines in select * from public.invoice_lines where invoice_id=p_invoice_id and tenant_id=v_tenant_id loop
    if v_lines.product_id is not null and v_invoice.warehouse_id is not null then
      insert into public.stock_movements(tenant_id,product_id,warehouse_id,movement_type,quantity,unit_cost,reference_type,reference_id,created_by)
      values(v_tenant_id,v_lines.product_id,v_invoice.warehouse_id,
        case when v_invoice.type in ('sale','return_purchase') then 'out' else 'in' end,
        v_lines.base_quantity,v_lines.unit_price,'invoice',p_invoice_id,v_user_id);
    end if;
  end loop;

  update public.journal_entries set status='posted',posted_at=now(),posted_by=v_user_id,updated_at=now() where id=v_entry_id;
  update public.invoices set status='posted',posted_at=now(),posted_by=v_user_id,updated_at=now() where id=p_invoice_id;
  insert into public.audit_logs(tenant_id,user_id,action,entity_type,entity_id,entity_name,new_values)
  values(v_tenant_id,v_user_id,'post_invoice','invoice',p_invoice_id,v_invoice.invoice_number,jsonb_build_object('status','posted','total',v_invoice.total,'journal_entry_id',v_entry_id));
  return jsonb_build_object('success',true,'journal_entry_id',v_entry_id);
end;
$function$
;

COMMIT;
