begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select ok(
  exists (select 1 from information_schema.columns
          where table_schema='public' and table_name='sales'
            and column_name='table_name_snapshot'),
  'Sales persist the table name captured at checkout'
);

select ok(
  exists (select 1 from pg_trigger where tgrelid='public.sales'::regclass
          and tgname='trg_capture_sale_table_name_snapshot' and not tgisinternal),
  'Table names are snapshotted by a database trigger'
);

select ok(
  (select prosecdef from pg_proc
   where oid='private.capture_sale_table_name_snapshot()'::regprocedure),
  'The snapshot trigger reads branch tables through a private SECURITY DEFINER function'
);

select * from finish();
rollback;
