-- Stock documents and atomic warehouse transfer / stock movement posting.
-- Repository-only migration: intentionally NOT applied to production.
begin;

create table if not exists public.stock_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_number text not null,
  document_type text not null check (document_type in ('stock_in','stock_out','transfer','count_adjustment')),
  status text not null default 'draft' check (status in ('draft','posted','cancelled')),
  warehouse_id uuid not null references public.warehouses(id),
  to_warehouse_id uuid references public.warehouses(id),
  document_date date not null default current_date,
  notes text,
  created_by uuid not null default auth.uid(),
  posted_by uuid,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, document_number),
  check ((document_type = 'transfer' and to_warehouse_id is not null and to_warehouse_id <> warehouse_id)
      or (document_type <> 'transfer' and to_warehouse_id is null))
);

create table if not exists public.stock_document_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_id uuid not null references public.stock_documents(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity numeric(18,4) not null check (quantity > 0),
  unit_cost numeric(18,4) not null default 0 check (unit_cost >= 0),
  counted_quantity numeric(18,4) check (counted_quantity is null or counted_quantity >= 0),
  created_at timestamptz not null default now(),
  unique (document_id, product_id)
);

create index if not exists stock_documents_tenant_date_idx
  on public.stock_documents (tenant_id, document_date desc);
create index if not exists stock_document_lines_document_idx
  on public.stock_document_lines (tenant_id, document_id);
create index if not exists stock_document_lines_product_idx
  on public.stock_document_lines (tenant_id, product_id);

alter table public.stock_documents enable row level security;
alter table public.stock_document_lines enable row level security;

drop policy if exists stock_documents_select_tenant on public.stock_documents;
create policy stock_documents_select_tenant on public.stock_documents
  for select to authenticated using (public.is_owner_user() or public.is_tenant_member(tenant_id));
drop policy if exists stock_documents_insert_tenant on public.stock_documents;
create policy stock_documents_insert_tenant on public.stock_documents
  for insert to authenticated with check (
    (public.is_owner_user() or public.is_tenant_member(tenant_id))
    and status = 'draft' and posted_at is null and posted_by is null
  );
drop policy if exists stock_documents_update_drafts on public.stock_documents;
create policy stock_documents_update_drafts on public.stock_documents
  for update to authenticated using (
    (public.is_owner_user() or public.is_tenant_member(tenant_id)) and status = 'draft'
  ) with check (
    (public.is_owner_user() or public.is_tenant_member(tenant_id)) and status = 'draft'
    and posted_at is null and posted_by is null
  );
drop policy if exists stock_documents_delete_drafts on public.stock_documents;
create policy stock_documents_delete_drafts on public.stock_documents
  for delete to authenticated using (
    (public.is_owner_user() or public.is_tenant_member(tenant_id)) and status = 'draft'
  );

drop policy if exists stock_document_lines_select_tenant on public.stock_document_lines;
create policy stock_document_lines_select_tenant on public.stock_document_lines
  for select to authenticated using (public.is_owner_user() or public.is_tenant_member(tenant_id));
drop policy if exists stock_document_lines_insert_drafts on public.stock_document_lines;
create policy stock_document_lines_insert_drafts on public.stock_document_lines
  for insert to authenticated with check (
    (public.is_owner_user() or public.is_tenant_member(tenant_id))
    and exists (select 1 from public.stock_documents d where d.id=document_id and d.tenant_id=stock_document_lines.tenant_id and d.status='draft')
  );
drop policy if exists stock_document_lines_update_drafts on public.stock_document_lines;
create policy stock_document_lines_update_drafts on public.stock_document_lines
  for update to authenticated using (
    (public.is_owner_user() or public.is_tenant_member(tenant_id))
    and exists (select 1 from public.stock_documents d where d.id=document_id and d.tenant_id=stock_document_lines.tenant_id and d.status='draft')
  ) with check (
    (public.is_owner_user() or public.is_tenant_member(tenant_id))
    and exists (select 1 from public.stock_documents d where d.id=document_id and d.tenant_id=stock_document_lines.tenant_id and d.status='draft')
  );
drop policy if exists stock_document_lines_delete_drafts on public.stock_document_lines;
create policy stock_document_lines_delete_drafts on public.stock_document_lines
  for delete to authenticated using (
    (public.is_owner_user() or public.is_tenant_member(tenant_id))
    and exists (select 1 from public.stock_documents d where d.id=document_id and d.tenant_id=stock_document_lines.tenant_id and d.status='draft')
  );

grant select, insert, update, delete on public.stock_documents, public.stock_document_lines to authenticated;

create or replace function public.post_stock_document(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_doc public.stock_documents%rowtype;
  v_line record;
  v_current numeric(18,4);
  v_movement_type text;
  v_posted_count integer := 0;
begin
  if v_user_id is null then
    return jsonb_build_object('success',false,'error','not_authenticated');
  end if;

  select d.* into v_doc
  from public.stock_documents d
  where d.id = p_document_id
  for update;

  if not found then
    return jsonb_build_object('success',false,'error','not_found');
  end if;

  if not (public.is_owner_user() or public.is_tenant_member(v_doc.tenant_id)) then
    return jsonb_build_object('success',false,'error','not_authorized');
  end if;

  if v_doc.status <> 'draft' then
    return jsonb_build_object('success',false,'error','document_not_draft');
  end if;

  if not exists (select 1 from public.stock_document_lines l where l.document_id=v_doc.id and l.tenant_id=v_doc.tenant_id) then
    return jsonb_build_object('success',false,'error','empty_document');
  end if;

  if not exists (select 1 from public.warehouses w where w.id=v_doc.warehouse_id and w.tenant_id=v_doc.tenant_id and w.is_active) then
    return jsonb_build_object('success',false,'error','invalid_source_warehouse');
  end if;
  if v_doc.document_type='transfer' and not exists (
    select 1 from public.warehouses w where w.id=v_doc.to_warehouse_id and w.tenant_id=v_doc.tenant_id and w.is_active
  ) then
    return jsonb_build_object('success',false,'error','invalid_destination_warehouse');
  end if;

  -- Phase 1: lock and validate every line before writing any movement.
  -- Returning an error from a validation pass cannot leave partial stock movements.
  for v_line in
    select l.* from public.stock_document_lines l
    where l.document_id=v_doc.id and l.tenant_id=v_doc.tenant_id
    order by l.product_id for update
  loop
    perform pg_advisory_xact_lock(hashtext(v_doc.tenant_id::text || ':' || v_line.product_id::text || ':' || v_doc.warehouse_id::text)::bigint);
    if v_doc.document_type='transfer' then
      perform pg_advisory_xact_lock(hashtext(v_doc.tenant_id::text || ':' || v_line.product_id::text || ':' || v_doc.to_warehouse_id::text)::bigint);
    end if;

    if not exists (select 1 from public.products p where p.id=v_line.product_id and p.tenant_id=v_doc.tenant_id and p.type='product') then
      return jsonb_build_object('success',false,'error','invalid_product','product_id',v_line.product_id);
    end if;
    if v_doc.document_type in ('stock_out','transfer') then
      v_current := public.get_product_stock(v_doc.tenant_id,v_line.product_id,v_doc.warehouse_id);
      if v_current < v_line.quantity then
        return jsonb_build_object('success',false,'error','insufficient_stock','product_id',v_line.product_id,'available',v_current,'requested',v_line.quantity);
      end if;
    end if;
    if v_doc.document_type='count_adjustment' and v_line.counted_quantity is null then
      return jsonb_build_object('success',false,'error','counted_quantity_required','product_id',v_line.product_id);
    end if;
  end loop;

  -- Phase 2: all validation passed; write movements and final status in this transaction.
  for v_line in
    select l.* from public.stock_document_lines l
    where l.document_id=v_doc.id and l.tenant_id=v_doc.tenant_id
    order by l.product_id
  loop
    if v_doc.document_type='count_adjustment' then
      v_current := public.get_product_stock(v_doc.tenant_id,v_line.product_id,v_doc.warehouse_id);
      if v_line.counted_quantity > v_current then
        v_movement_type := 'adjustment_in';
      elsif v_line.counted_quantity < v_current then
        v_movement_type := 'adjustment_out';
      else
        v_movement_type := null;
      end if;
      if v_movement_type is not null then
        insert into public.stock_movements
          (tenant_id,product_id,warehouse_id,movement_type,quantity,unit_cost,reference_type,reference_id,created_by)
        values
          (v_doc.tenant_id,v_line.product_id,v_doc.warehouse_id,v_movement_type,abs(v_line.counted_quantity-v_current),v_line.unit_cost,'stock_document',v_doc.id,v_user_id);
      end if;
    elsif v_doc.document_type='stock_in' then
      insert into public.stock_movements
        (tenant_id,product_id,warehouse_id,movement_type,quantity,unit_cost,reference_type,reference_id,created_by)
      values
        (v_doc.tenant_id,v_line.product_id,v_doc.warehouse_id,'in',v_line.quantity,v_line.unit_cost,'stock_document',v_doc.id,v_user_id);
    elsif v_doc.document_type='stock_out' then
      insert into public.stock_movements
        (tenant_id,product_id,warehouse_id,movement_type,quantity,unit_cost,reference_type,reference_id,created_by)
      values
        (v_doc.tenant_id,v_line.product_id,v_doc.warehouse_id,'out',v_line.quantity,v_line.unit_cost,'stock_document',v_doc.id,v_user_id);
    elsif v_doc.document_type='transfer' then
      insert into public.stock_movements
        (tenant_id,product_id,warehouse_id,movement_type,quantity,unit_cost,reference_type,reference_id,created_by,to_warehouse_id)
      values
        (v_doc.tenant_id,v_line.product_id,v_doc.warehouse_id,'transfer_out',v_line.quantity,v_line.unit_cost,'stock_transfer',v_doc.id,v_user_id,v_doc.to_warehouse_id);
      insert into public.stock_movements
        (tenant_id,product_id,warehouse_id,movement_type,quantity,unit_cost,reference_type,reference_id,created_by,to_warehouse_id)
      values
        (v_doc.tenant_id,v_line.product_id,v_doc.to_warehouse_id,'transfer_in',v_line.quantity,v_line.unit_cost,'stock_transfer',v_doc.id,v_user_id,v_doc.warehouse_id);
    end if;
    v_posted_count := v_posted_count + 1;
  end loop;

  update public.stock_documents
    set status='posted', posted_by=v_user_id, posted_at=now(), updated_at=now()
    where id=v_doc.id and tenant_id=v_doc.tenant_id and status='draft';

  insert into public.audit_logs (tenant_id,user_id,action,entity_type,entity_id,new_values)
  values (v_doc.tenant_id,v_user_id,'stock_document_posted','stock_document',v_doc.id,
    jsonb_build_object('document_number',v_doc.document_number,'document_type',v_doc.document_type,'line_count',v_posted_count));

  return jsonb_build_object('success',true,'document_id',v_doc.id,'posted_lines',v_posted_count);
exception when others then
  return jsonb_build_object('success',false,'error','posting_failed','detail',sqlerrm);
end;
$function$;

revoke all on function public.post_stock_document(uuid) from public, anon;
grant execute on function public.post_stock_document(uuid) to authenticated;

commit;
