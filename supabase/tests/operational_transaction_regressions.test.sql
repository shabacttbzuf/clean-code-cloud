begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- These checks guard critical transactional protections in the actual RPC
-- implementations. Full data-flow scenarios are exercised in the same
-- disposable local Supabase database by the CI workflow.

select ok(
  position('auth.uid()' in pg_get_functiondef('private.create_sale_with_customer(uuid,uuid,uuid,uuid,numeric,uuid,numeric,public.payment_method,jsonb)'::regprocedure)) > 0
  and position('for update' in lower(pg_get_functiondef('private.create_sale_with_customer(uuid,uuid,uuid,uuid,numeric,uuid,numeric,public.payment_method,jsonb)'::regprocedure))) > 0,
  'sale creation binds cashier identity and locks checkout session/products'
);

select ok(
  position('_items is null' in lower(pg_get_functiondef('private.create_sale_with_customer(uuid,uuid,uuid,uuid,numeric,uuid,numeric,public.payment_method,jsonb)'::regprocedure))) > 0
  and position('jsonb_array_length(_items)>300' in lower(pg_get_functiondef('private.create_sale_with_customer(uuid,uuid,uuid,uuid,numeric,uuid,numeric,public.payment_method,jsonb)'::regprocedure))) > 0,
  'sale creation rejects null, empty and oversized item payloads'
);

select ok(
  position('tenant_id=_tenant_id' in regexp_replace(lower(pg_get_functiondef('private.create_sale_with_customer(uuid,uuid,uuid,uuid,numeric,uuid,numeric,public.payment_method,jsonb)'::regprocedure)), '\s', '', 'g')) > 0,
  'sale creation scopes customers and products to the supplied tenant'
);

select ok(
  position('initial payment exceeds invoice total' in lower(pg_get_functiondef('private.create_sale_with_customer(uuid,uuid,uuid,uuid,numeric,uuid,numeric,public.payment_method,jsonb)'::regprocedure))) > 0
  and position('customer credit limit exceeded' in lower(pg_get_functiondef('private.create_sale_with_customer(uuid,uuid,uuid,uuid,numeric,uuid,numeric,public.payment_method,jsonb)'::regprocedure))) > 0,
  'sale creation prevents overpayment and credit-limit bypass'
);

select ok(
  position('for update' in lower(pg_get_functiondef('private.create_sale_refund(uuid,uuid,text,public.payment_method,jsonb)'::regprocedure))) > 0,
  'sale refund serializes access to the source sale/items'
);

select ok(
  position('tenant_id=_tenant_id' in regexp_replace(lower(pg_get_functiondef('private.create_sale_refund(uuid,uuid,text,public.payment_method,jsonb)'::regprocedure)), '\s', '', 'g')) > 0,
  'sale refund validates source sale and items within tenant scope'
);

select ok(
  position('for update' in lower(pg_get_functiondef('private.create_purchase_return(uuid,uuid,text,jsonb)'::regprocedure))) > 0,
  'purchase return locks source purchase/items against concurrent returns'
);

select ok(
  position('tenant_id=_tenant_id' in regexp_replace(lower(pg_get_functiondef('private.create_purchase_return(uuid,uuid,text,jsonb)'::regprocedure)), '\s', '', 'g')) > 0,
  'purchase return enforces tenant scope'
);

select ok(
  position('for update' in lower(pg_get_functiondef('private.create_purchase_with_items(uuid,uuid,uuid,uuid,text,text,jsonb)'::regprocedure))) > 0
  and position('tenant_id=_tenant_id' in regexp_replace(lower(pg_get_functiondef('private.create_purchase_with_items(uuid,uuid,uuid,uuid,text,text,jsonb)'::regprocedure)), '\s', '', 'g')) > 0,
  'purchase creation locks and tenant-scopes its referenced records'
);

select ok(
  position('for update' in lower(pg_get_functiondef('private.close_cash_session(uuid,numeric)'::regprocedure))) > 0,
  'cash session close serializes updates to the session'
);

select ok(
  exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='sale_refunds'
      and t.tgname ilike '%cash%refund%overdraw%' and not t.tgisinternal and t.tgenabled <> 'D'
  ),
  'cash refund overdraw protection trigger is enabled'
);

select ok(
  exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='inventory_transactions'
      and t.tgname ilike '%inventory%reference%tenant%' and not t.tgisinternal and t.tgenabled <> 'D'
  ),
  'inventory transaction tenant-reference guard is enabled'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid='public.inventory'::regclass and contype='c'
      and pg_get_constraintdef(oid) ilike '%quantity%>=%0%'
  ),
  'inventory quantity has a database-level nonnegative constraint'
);

select * from finish();
rollback;
