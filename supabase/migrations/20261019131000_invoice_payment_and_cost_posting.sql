-- Replace invoice posting logic with cash/credit settlement and capitalized purchase costs.
-- Repository-only migration file. Do NOT apply to production without explicit approval.
begin;
CREATE OR REPLACE FUNCTION public.post_invoice_unchecked_20261014(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant_id uuid; v_user_id uuid:=auth.uid(); v_invoice record; v_lines record; v_entry_id uuid; v_entry_number text;
  v_party_account uuid; v_revenue_account uuid; v_tax_account uuid; v_cogs_account uuid;
  v_inventory_account uuid; v_cash_account uuid; v_cost_party_account uuid; v_cost record;
  v_cost_total numeric(18,2):=0; v_line_base_total numeric(18,2):=0; v_allocated_cost numeric(18,2):=0;
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

  if v_invoice.payment_method='cash' then
    select id into v_cash_account from public.chart_of_accounts
    where id=v_invoice.cash_account_id and tenant_id=v_tenant_id and type='asset' and is_active=true and is_postable=true;
  end if;
  if (v_invoice.payment_method='cash' and v_cash_account is null)
     or (v_invoice.payment_method='credit' and v_party_account is null)
     or (v_invoice.type in ('sale','return_sale') and v_revenue_account is null)
     or (v_invoice.type in ('purchase','return_purchase') and v_cogs_account is null)
     or (v_invoice.tax_amount>0 and v_tax_account is null) then
    return jsonb_build_object('success',false,'error','missing_account');
  end if;

  v_entry_number:='JE-INV-'||v_invoice.invoice_number;
  insert into public.journal_entries(tenant_id,entry_number,date,description,reference_type,reference_id,status,created_by,branch_id)
  values(v_tenant_id,v_entry_number,v_invoice.date,'Invoice '||v_invoice.invoice_number,'invoice',p_invoice_id,'draft',v_user_id,v_invoice.branch_id)
  returning id into v_entry_id;

  if v_invoice.type='sale' then
    insert into public.journal_lines(journal_entry_id,tenant_id,account_id,party_id,description,debit,credit,currency,exchange_rate,line_order)
    values(v_entry_id,v_tenant_id,case when v_invoice.payment_method='cash' then v_cash_account else v_party_account end,case when v_invoice.payment_method='cash' then null else v_invoice.party_id end,'Sale settlement - '||v_invoice.invoice_number,v_invoice.total,0,v_invoice.currency,1,0);
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
    values(v_entry_id,v_tenant_id,case when v_invoice.payment_method='cash' then v_cash_account else v_party_account end,case when v_invoice.payment_method='cash' then null else v_invoice.party_id end,'Purchase settlement - '||v_invoice.invoice_number,0,v_invoice.total,v_invoice.currency,1,2);
    v_total_credit:=v_total_credit+v_invoice.total;
  elsif v_invoice.type='return_sale' then
    insert into public.journal_lines(journal_entry_id,tenant_id,account_id,party_id,description,debit,credit,currency,exchange_rate,line_order)
    values(v_entry_id,v_tenant_id,case when v_invoice.payment_method='cash' then v_cash_account else v_party_account end,case when v_invoice.payment_method='cash' then null else v_invoice.party_id end,'Sales return settlement - '||v_invoice.invoice_number,0,v_invoice.total,v_invoice.currency,1,0);
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
    values(v_entry_id,v_tenant_id,case when v_invoice.payment_method='cash' then v_cash_account else v_party_account end,case when v_invoice.payment_method='cash' then null else v_invoice.party_id end,'Purchase return settlement - '||v_invoice.invoice_number,v_invoice.total,0,v_invoice.currency,1,2);
    v_total_debit:=v_total_debit+v_invoice.total;
  else
    return jsonb_build_object('success',false,'error','invalid_invoice_type');
  end if;

  -- Additional purchase costs are capitalized to inventory and credited to the selected cash account or creditor account.
  if v_invoice.type='purchase' then
    if exists(select 1 from public.invoice_additional_costs where invoice_id=p_invoice_id and tenant_id=v_tenant_id) and v_inventory_account is null then
      raise exception 'Missing postable inventory account for additional costs';
    end if;
    select coalesce(sum(amount),0) into v_cost_total from public.invoice_additional_costs where invoice_id=p_invoice_id and tenant_id=v_tenant_id;
        select coalesce(sum(greatest(line_total,0)),0) into v_line_base_total from public.invoice_lines where invoice_id=p_invoice_id and tenant_id=v_tenant_id and product_id is not null;
    if v_cost_total>0 and v_line_base_total<=0 then raise exception 'Cannot allocate additional costs: purchase has no positive-value product lines'; end if;
    for v_cost in select * from public.invoice_additional_costs where invoice_id=p_invoice_id and tenant_id=v_tenant_id order by line_order, created_at loop
      v_cost_party_account:=null;
      if v_cost.payment_method='cash' then
        select id into v_cash_account from public.chart_of_accounts where id=v_cost.cash_account_id and tenant_id=v_tenant_id and type='asset' and is_active=true and is_postable=true;
        if v_cash_account is null then raise exception 'Invalid cash account for additional cost %', v_cost.id; end if;
      else
        select pr.account_id into v_cost_party_account
        from public.party_roles pr
        join public.parties party on party.id=pr.party_id and party.tenant_id=v_tenant_id
        join public.chart_of_accounts coa on coa.id=pr.account_id and coa.tenant_id=v_tenant_id and coa.is_active=true and coa.is_postable=true
        where pr.party_id=v_cost.party_id and pr.account_id is not null limit 1;
        if v_cost_party_account is null then
          select id into v_cost_party_account from public.chart_of_accounts where tenant_id=v_tenant_id and sub_type='accounts_payable' and is_postable=true and is_active=true order by code limit 1;
        end if;
        if v_cost_party_account is null then raise exception 'Missing creditor account for additional cost %', v_cost.id; end if;
      end if;
      insert into public.journal_lines(journal_entry_id,tenant_id,account_id,description,debit,credit,currency,exchange_rate,line_order)
      values(v_entry_id,v_tenant_id,v_inventory_account,'Capitalized cost: '||v_cost.description,v_cost.amount,0,v_invoice.currency,1,100+v_cost.line_order*2);
      v_total_debit:=v_total_debit+v_cost.amount;
      insert into public.journal_lines(journal_entry_id,tenant_id,account_id,party_id,description,debit,credit,currency,exchange_rate,line_order)
      values(v_entry_id,v_tenant_id,case when v_cost.payment_method='cash' then v_cash_account else v_cost_party_account end,case when v_cost.payment_method='cash' then null else v_cost.party_id end,'Payment for cost: '||v_cost.description,0,v_cost.amount,v_invoice.currency,1,101+v_cost.line_order*2);
      v_total_credit:=v_total_credit+v_cost.amount;
    end loop;
  end if;

  if v_total_debit=0 or v_total_debit<>v_total_credit then
    raise exception 'Invoice generated unbalanced journal entry: debit %, credit %',v_total_debit,v_total_credit;
  end if;

  for v_lines in select * from public.invoice_lines where invoice_id=p_invoice_id and tenant_id=v_tenant_id loop
    if v_lines.product_id is not null and v_invoice.warehouse_id is not null then
      insert into public.stock_movements(tenant_id,product_id,warehouse_id,movement_type,quantity,unit_cost,reference_type,reference_id,created_by)
      values(v_tenant_id,v_lines.product_id,v_invoice.warehouse_id,
        case when v_invoice.type in ('sale','return_purchase') then 'out' else 'in' end,
        v_lines.quantity,case when v_invoice.type='purchase' and v_line_base_total>0 and v_lines.product_id is not null then v_lines.unit_price + ((v_cost_total * greatest(v_lines.line_total,0) / v_line_base_total) / nullif(v_lines.quantity,0)) else v_lines.unit_price end,'invoice',p_invoice_id,v_user_id);
    end if;
  end loop;

  update public.journal_entries set status='posted',posted_at=now(),posted_by=v_user_id,updated_at=now() where id=v_entry_id;
  update public.invoices set status='posted',posted_at=now(),posted_by=v_user_id,updated_at=now() where id=p_invoice_id;
  insert into public.audit_logs(tenant_id,user_id,action,entity_type,entity_id,entity_name,new_values)
  values(v_tenant_id,v_user_id,'post_invoice','invoice',p_invoice_id,v_invoice.invoice_number,jsonb_build_object('status','posted','total',v_invoice.total,'journal_entry_id',v_entry_id));
  return jsonb_build_object('success',true,'journal_entry_id',v_entry_id);
end;
$function$

commit;
