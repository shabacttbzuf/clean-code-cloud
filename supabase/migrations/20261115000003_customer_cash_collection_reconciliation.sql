-- Include cash collections from customer receivables in the cashier's expected drawer balance.
begin;
create or replace function public.close_cash_session(_session_id uuid, _closing_balance numeric)
returns public.cash_sessions
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private', 'pg_temp'
as $function$
declare
  v_session public.cash_sessions%rowtype;
  v_expected numeric(12,2);
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if _closing_balance is null or _closing_balance < 0 or _closing_balance = 'NaN'::numeric then
    raise exception 'Closing balance must be zero or greater' using errcode = '22023';
  end if;
  select * into v_session from public.cash_sessions where id = _session_id for update;
  if not found then raise exception 'Cash session not found' using errcode = 'P0002'; end if;
  if not public.has_permission(auth.uid(), v_session.tenant_id, 'cash.close') then
    raise exception 'Permission denied: cash.close' using errcode = '42501';
  end if;
  if v_session.status <> 'open' then raise exception 'Cash session is already closed' using errcode = '55000'; end if;
  if auth.uid() <> v_session.cashier_id and not private.is_tenant_admin(auth.uid(), v_session.tenant_id) then
    raise exception 'You cannot close this cashier session' using errcode = '42501';
  end if;
  select round(
      v_session.opening_balance
      + coalesce((select sum(p.amount) from public.payments p
        join public.sales s on s.id = p.sale_id
        where s.session_id = v_session.id and s.tenant_id = v_session.tenant_id
          and s.status in ('completed','refunded') and p.method = 'cash'), 0)
      - coalesce((select sum(r.total) from public.sale_refunds r
        where r.cash_session_id = v_session.id and r.tenant_id = v_session.tenant_id
          and r.refund_method = 'cash'), 0)
      - coalesce((select sum(sp.amount) from public.supplier_payments sp
        where sp.cash_session_id = v_session.id and sp.tenant_id = v_session.tenant_id
          and sp.branch_id = v_session.branch_id and sp.payment_method = 'cash'), 0)
      - coalesce((select sum(cp.amount) from public.customer_payments cp
        where cp.cash_session_id = v_session.id and cp.tenant_id = v_session.tenant_id
          and cp.branch_id = v_session.branch_id and cp.method = 'cash'), 0),
      2
    ) into v_expected;
  update public.cash_sessions
     set status = 'closed',
         closing_balance = _closing_balance,
         expected_cash = v_expected,
         cash_difference = round(_closing_balance - v_expected, 2),
         closed_at = now(),
         updated_at = now()
   where id = v_session.id
   returning * into v_session;
  return v_session;
end;
$function$;
revoke all on function public.close_cash_session(uuid, numeric) from public, anon;
grant execute on function public.close_cash_session(uuid, numeric) to authenticated, service_role;
commit;
