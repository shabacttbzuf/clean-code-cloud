begin;
create or replace view public.customer_account_balances
with (security_invoker = true) as
select s.tenant_id,s.customer_id,
 count(*) filter (where s.status='completed')::bigint as invoice_count,
 coalesce(sum(s.total) filter (where s.status='completed'),0)::numeric(14,2) as invoiced_total,
 coalesce(sum(coalesce(p.paid,0)+coalesce(cp.collected,0)) filter (where s.status='completed'),0)::numeric(14,2) as paid_total,
 coalesce(sum(coalesce(r.refunded,0)) filter (where s.status='completed'),0)::numeric(14,2) as refunded_total,
 coalesce(sum(greatest(s.total-coalesce(p.paid,0)-coalesce(cp.collected,0)-coalesce(r.refunded,0),0)) filter (where s.status='completed'),0)::numeric(14,2) as outstanding_balance
from public.sales s
left join lateral (select sum(amount) paid from public.payments where sale_id=s.id and tenant_id=s.tenant_id) p on true
left join lateral (select sum(amount) collected from public.customer_payments where sale_id=s.id and tenant_id=s.tenant_id) cp on true
left join lateral (select sum(total) refunded from public.sale_refunds where sale_id=s.id and tenant_id=s.tenant_id) r on true
where s.customer_id is not null
group by s.tenant_id,s.customer_id;
grant select on public.customer_account_balances to authenticated;
commit;