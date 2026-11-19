begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

-- Normalize case and whitespace because pg_get_functiondef formats SQL keywords.
with function_source as (
  select regexp_replace(
    lower(pg_get_functiondef(
      'private.create_sale_with_customer(uuid,uuid,uuid,uuid,numeric,uuid,numeric,public.payment_method,jsonb)'::regprocedure
    )),
    '\s+', '', 'g'
  ) as definition
)
select ok(
  position('_itemsisnullorjsonb_typeof(_items)isdistinctfrom''array''' in definition) > 0,
  'customer sale RPC explicitly rejects NULL and non-array payloads'
) from function_source;

with function_source as (
  select regexp_replace(
    lower(pg_get_functiondef(
      'private.create_sale_with_customer(uuid,uuid,uuid,uuid,numeric,uuid,numeric,public.payment_method,jsonb)'::regprocedure
    )),
    '\s+', '', 'g'
  ) as definition
)
select ok(
  position('jsonb_array_length(_items)=0' in definition) >
  position('_itemsisnullorjsonb_typeof(_items)isdistinctfrom''array''' in definition),
  'customer sale RPC validates JSON type before array length'
) from function_source;

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
