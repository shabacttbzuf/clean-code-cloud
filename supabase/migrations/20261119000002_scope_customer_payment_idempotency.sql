-- Prevent idempotency-key replay from disclosing another user's customer payment.
-- Preserve legitimate retries for the same actor, tenant, sale, and accessible branch.
begin;

create or replace function public.record_customer_payment(
  _tenant_id uuid,
  _sale_id uuid,
  _amount numeric,
  _method public.payment_method,
  _cash_session_id uuid,
  _reference text,
  _notes text,
  _idempotency_key uuid
) returns public.customer_payments
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_sale public.sales%rowtype;
  v_customer public.customers%rowtype;
  v_existing public.customer_payments%rowtype;
  v_paid numeric(14,2);
  v_due numeric(14,2);
  v_session public.cash_sessions%rowtype;
  v_result public.customer_payments%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if _amount is null or _amount <= 0 or _amount = 'NaN'::numeric
     or _idempotency_key is null or _method not in ('cash','card','transfer') then
    raise exception 'Invalid customer payment data' using errcode='22023';
  end if;
  if not public.has_permission(auth.uid(), _tenant_id, 'customers.manage') then
    raise exception 'Permission denied: customers.manage' using errcode='42501';
  end if;

  select * into v_existing from public.customer_payments
   where tenant_id=_tenant_id and idempotency_key=_idempotency_key;
  if found then
    if v_existing.created_by is distinct from auth.uid()
       or v_existing.sale_id is distinct from _sale_id
       or not private.can_access_branch(auth.uid(), _tenant_id, v_existing.branch_id) then
      raise exception 'Idempotency key is already used by another payment context' using errcode='42501';
    end if;
    return v_existing;
  end if;

  select * into v_sale from public.sales
   where id=_sale_id and tenant_id=_tenant_id for update;
  if not found or v_sale.customer_id is null or v_sale.status <> 'completed' then
    raise exception 'Customer invoice not found or not collectible' using errcode='P0002';
  end if;
  if not private.can_access_branch(auth.uid(), _tenant_id, v_sale.branch_id) then
    raise exception 'Branch access denied' using errcode='42501';
  end if;
  select * into v_customer from public.customers
   where id=v_sale.customer_id and tenant_id=_tenant_id for update;
  if not found then raise exception 'Customer not found' using errcode='P0002'; end if;

  select coalesce(sum(p.amount),0) into v_paid from public.payments p
   where p.sale_id=_sale_id and p.tenant_id=_tenant_id;
  select v_paid + coalesce(sum(cp.amount),0) into v_paid
   from public.customer_payments cp where cp.sale_id=_sale_id and cp.tenant_id=_tenant_id;
  select coalesce(sum(r.total),0) into v_due from public.sale_refunds r
   where r.sale_id=_sale_id and r.tenant_id=_tenant_id;
  v_due := greatest(round(v_sale.total - v_paid - v_due,2),0);
  if _amount > v_due then raise exception 'Payment exceeds outstanding invoice balance' using errcode='22023'; end if;

  if _method='cash' then
    if _cash_session_id is null then raise exception 'Cash collection requires an open cashier session' using errcode='22023'; end if;
    select * into v_session from public.cash_sessions
     where id=_cash_session_id and tenant_id=_tenant_id and branch_id=v_sale.branch_id
     for update;
    if not found or v_session.status <> 'open' then
      raise exception 'Cash session is not open for this branch' using errcode='55000';
    end if;
    if v_session.cashier_id <> auth.uid()
       and not private.is_tenant_admin(auth.uid(),_tenant_id)
       and not public.is_super_owner(auth.uid()) then
      raise exception 'Cannot use another cashier session' using errcode='42501';
    end if;
  elsif _cash_session_id is not null then
    raise exception 'Only cash collections can use a cash session' using errcode='22023';
  end if;

  insert into public.customer_payments(
    tenant_id,branch_id,customer_id,sale_id,amount,method,cash_session_id,
    reference,notes,idempotency_key,created_by
  ) values (
    _tenant_id,v_sale.branch_id,v_sale.customer_id,_sale_id,_amount,_method,
    _cash_session_id,nullif(btrim(_reference),''),nullif(btrim(_notes),''),
    _idempotency_key,auth.uid()
  ) returning * into v_result;
  return v_result;
end;
$function$;

revoke all on function public.record_customer_payment(uuid,uuid,numeric,public.payment_method,uuid,text,text,uuid) from public,anon;
grant execute on function public.record_customer_payment(uuid,uuid,numeric,public.payment_method,uuid,text,text,uuid) to authenticated,service_role;

commit;
