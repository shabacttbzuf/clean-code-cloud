-- Reject NULL, non-array, and empty customer-credit POS item payloads.
-- Remove only legacy permissive policies whose expressions were verified to be
-- byte-for-byte equivalent to the newer permission_scope SELECT policies.
begin;

create or replace function public.create_sale_with_customer(
  _tenant_id uuid,
  _branch_id uuid,
  _cashier_id uuid,
  _session_id uuid,
  _discount numeric,
  _customer_id uuid,
  _paid_amount numeric,
  _paid_method public.payment_method,
  _items jsonb
) returns public.sales
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_tax_rate numeric(5,2);
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2);
  v_taxable numeric(12,2);
  v_tax_amount numeric(12,2);
  v_total numeric(12,2);
  v_paid numeric(12,2);
  v_new_debt numeric(12,2);
  v_existing_debt numeric(14,2);
  v_customer public.customers%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_quantity numeric(12,3);
  v_sale public.sales%rowtype;
begin
  if auth.uid() is null or auth.uid() <> _cashier_id then
    raise exception 'Authenticated cashier identity mismatch' using errcode='42501';
  end if;
  if not public.has_permission(auth.uid(),_tenant_id,'pos.create_sale') then
    raise exception 'Permission denied: pos.create_sale' using errcode='42501';
  end if;
  if not private.can_access_branch(auth.uid(),_tenant_id,_branch_id) then
    raise exception 'You cannot create sales in this branch' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.cash_sessions cs
     where cs.id=_session_id and cs.tenant_id=_tenant_id
       and cs.branch_id=_branch_id and cs.cashier_id=_cashier_id and cs.status='open'
     for update
  ) then
    raise exception 'An open cashier session for this branch is required' using errcode='55000';
  end if;
  -- Validate the JSON type before calling jsonb_array_length. A NULL input
  -- makes the old IF condition evaluate to NULL and could bypass this guard.
  if _items is null or jsonb_typeof(_items) is distinct from 'array' then
    raise exception 'Sale must contain between 1 and 300 items' using errcode='22023';
  end if;
  if jsonb_array_length(_items)=0 or jsonb_array_length(_items)>300 then
    raise exception 'Sale must contain between 1 and 300 items' using errcode='22023';
  end if;
  if _paid_amount is null or _paid_amount<0 or _paid_amount='NaN'::numeric
     or _paid_method not in ('cash','card','transfer') then
    raise exception 'Invalid initial payment' using errcode='22023';
  end if;

  if _customer_id is not null then
    select * into v_customer from public.customers
     where id=_customer_id and tenant_id=_tenant_id and is_active=true
     for update;
    if not found then raise exception 'Customer is unavailable or belongs to another tenant' using errcode='23503'; end if;
  end if;

  select tax_rate into v_tax_rate from public.tenants where id=_tenant_id;
  if not found then raise exception 'Tenant not found' using errcode='P0002'; end if;

  for v_item in
    select value from jsonb_array_elements(_items) order by (value->>'product_id')::uuid
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    if v_quantity is null or v_quantity<=0 or v_quantity>999999.999 then
      raise exception 'Invalid item quantity' using errcode='22023';
    end if;
    select * into v_product from public.products
     where id=v_product_id and tenant_id=_tenant_id and is_active=true for update;
    if not found then raise exception 'Product is unavailable or belongs to another tenant' using errcode='23503'; end if;
    v_subtotal := v_subtotal + round(v_product.sale_price*v_quantity,2);
  end loop;

  v_discount := coalesce(_discount,0);
  if v_discount<0 or v_discount>v_subtotal then raise exception 'Discount must be between zero and subtotal' using errcode='22023'; end if;
  v_taxable := greatest(v_subtotal-v_discount,0);
  v_tax_amount := round(v_taxable*(v_tax_rate/100),2);
  v_total := round(v_taxable+v_tax_amount,2);
  if _paid_amount>v_total then raise exception 'Initial payment exceeds invoice total' using errcode='22023'; end if;
  if _customer_id is null and _paid_amount<>v_total then
    raise exception 'Select a customer for credit or partial payment' using errcode='22023';
  end if;

  v_paid := round(_paid_amount,2);
  v_new_debt := greatest(v_total-v_paid,0);
  if _customer_id is not null and v_new_debt>0 then
    select coalesce(sum(
      greatest(s.total
        - coalesce((select sum(p.amount) from public.payments p where p.sale_id=s.id and p.tenant_id=s.tenant_id),0)
        - coalesce((select sum(cp.amount) from public.customer_payments cp where cp.sale_id=s.id and cp.tenant_id=s.tenant_id),0)
        - coalesce((select sum(r.total) from public.sale_refunds r where r.sale_id=s.id and r.tenant_id=s.tenant_id),0),0)
    ),0)
    into v_existing_debt
    from public.sales s
    where s.tenant_id=_tenant_id and s.customer_id=_customer_id and s.status='completed';

    if v_existing_debt+v_new_debt>v_customer.credit_limit then
      raise exception 'Customer credit limit exceeded. Available credit: %',
        greatest(v_customer.credit_limit-v_existing_debt,0) using errcode='22023';
    end if;
  end if;

  insert into public.sales(
    tenant_id,branch_id,cashier_id,session_id,invoice_no,
    subtotal,discount,tax_amount,total,payment_method,customer_id
  ) values (
    _tenant_id,_branch_id,_cashier_id,_session_id,0,
    v_subtotal,v_discount,v_tax_amount,v_total,
    case when v_paid=v_total then _paid_method when v_paid=0 then 'credit'::public.payment_method else 'mixed'::public.payment_method end,
    _customer_id
  ) returning * into v_sale;

  for v_item in
    select value from jsonb_array_elements(_items) order by (value->>'product_id')::uuid
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    select * into v_product from public.products
     where id=v_product_id and tenant_id=_tenant_id and is_active=true for update;
    if not found then raise exception 'Product became unavailable during checkout' using errcode='23503'; end if;
    insert into public.sale_items(
      tenant_id,sale_id,product_id,product_name,quantity,unit_price,tax_rate,line_total,cost_price_snapshot
    )
    values(
      _tenant_id,v_sale.id,v_product.id,v_product.name,v_quantity,v_product.sale_price,v_tax_rate,
      round(v_product.sale_price*v_quantity,2),v_product.cost_price
    );
  end loop;

  if v_paid>0 then
    insert into public.payments(tenant_id,sale_id,method,amount)
    values(_tenant_id,v_sale.id,_paid_method,v_paid);
  end if;
  return v_sale;
end;
$function$;

drop policy if exists "Tenant members view branches" on public.branches;
drop policy if exists "Tenant members view categories" on public.categories;
drop policy if exists "Tenant members view customers" on public.customers;
drop policy if exists "Members view inventory in accessible branches" on public.inventory;
drop policy if exists "Members view txns in accessible branches" on public.inventory_transactions;
drop policy if exists "Tenant members view products" on public.products;
drop policy if exists "Members view purchases in accessible branches" on public.purchases;
drop policy if exists "Members view sales in accessible branches" on public.sales;
drop policy if exists "Members view suppliers" on public.suppliers;

commit;
