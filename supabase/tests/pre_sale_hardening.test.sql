begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

-- Verify the deployed PostgreSQL function definition, not only the source file.
select ok(
  position(
    '_items is null or jsonb_typeof(_items) is distinct from ''array'''
    in pg_get_functiondef(
      'public.create_sale_with_customer(uuid,uuid,uuid,uuid,numeric,uuid,numeric,public.payment_method,jsonb)'::regprocedure
    )
  ) > 0,
  'customer sale RPC explicitly rejects NULL and non-array payloads'
);

select ok(
  position(
    'jsonb_array_length(_items)=0'
    in pg_get_functiondef(
      'public.create_sale_with_customer(uuid,uuid,uuid,uuid,numeric,uuid,numeric,public.payment_method,jsonb)'::regprocedure
    )
  ) > position(
    '_items is null or jsonb_typeof(_items) is distinct from ''array'''
    in pg_get_functiondef(
      'public.create_sale_with_customer(uuid,uuid,uuid,uuid,numeric,uuid,numeric,public.payment_method,jsonb)'::regprocedure
    )),
  'customer sale RPC validates JSON type before array length'
);

select ok(not exists (
  select 1 from pg_policies
  where schemaname='public' and tablename='branches' and policyname='Tenant members view branches'
), 'legacy duplicate branch SELECT policy is removed');
select ok(not exists (
  select 1 from pg_policies
  where schemaname='public' and tablename='categories' and policyname='Tenant members view categories'
), 'legacy duplicate category SELECT policy is removed');
select ok(not exists (
  select 1 from pg_policies
  where schemaname='public' and tablename='customers' and policyname='Tenant members view customers'
), 'legacy duplicate customer SELECT policy is removed');
select ok(not exists (
  select 1 from pg_policies
  where schemaname='public' and tablename='inventory' and policyname='Members view inventory in accessible branches'
), 'legacy duplicate inventory SELECT policy is removed');
select ok(not exists (
  select 1 from pg_policies
  where schemaname='public' and tablename='inventory_transactions' and policyname='Members view txns in accessible branches'
), 'legacy duplicate inventory transaction SELECT policy is removed');
select ok(not exists (
  select 1 from pg_policies
  where schemaname='public' and tablename='products' and policyname='Tenant members view products'
), 'legacy duplicate product SELECT policy is removed');
select ok(not exists (
  select 1 from pg_policies
  where schemaname='public' and tablename='purchases' and policyname='Members view purchases in accessible branches'
), 'legacy duplicate purchase SELECT policy is removed');
select ok(not exists (
  select 1 from pg_policies
  where schemaname='public' and tablename='sales' and policyname='Members view sales in accessible branches'
), 'legacy duplicate sales SELECT policy is removed');
select ok(not exists (
  select 1 from pg_policies
  where schemaname='public' and tablename='suppliers' and policyname='Members view suppliers'
), 'legacy duplicate supplier SELECT policy is removed');

select * from finish();
rollback;
