begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select ok(
  exists (select 1 from information_schema.columns
          where table_schema='public' and table_name='sales'
            and column_name in ('table_name_snapshot','customer_name_snapshot','customer_phone_snapshot')
          group by table_name having count(*)=3),
  'Sales persist immutable table and customer identity snapshots'
);

select ok(
  (select count(*)=2 from pg_trigger where tgrelid='public.sales'::regclass
    and tgname in ('trg_capture_sale_table_name_snapshot','trg_capture_sale_customer_snapshot')
    and not tgisinternal),
  'Table and customer identity snapshots are captured by database triggers'
);

select ok(
  (select bool_and(prosecdef) from pg_proc
   where oid in ('private.capture_sale_table_name_snapshot()'::regprocedure,
                 'private.capture_sale_customer_snapshot()'::regprocedure)),
  'Snapshot triggers read branch tables and customer records through private SECURITY DEFINER functions'
);

select ok(
  exists (select 1 from pg_policies where schemaname='public'
          and tablename='customer_payments'
          and policyname='sale_permission_customer_payments_select'
          and cmd='SELECT' and permissive='PERMISSIVE'),
  'Sale viewers can read only customer payments linked to sales within their branch'
);

select * from finish();
rollback;
