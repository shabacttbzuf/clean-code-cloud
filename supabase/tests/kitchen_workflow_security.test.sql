begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

select ok(
  (select relrowsecurity from pg_class where oid='public.kitchen_orders'::regclass)
  and (select relrowsecurity from pg_class where oid='public.kitchen_order_events'::regclass),
  'RLS is enabled on the kitchen order and event ledgers'
);

select ok(
  (select count(*)=4 from public.permissions
   where key in ('kitchen.view','kitchen.manage','tables.view','tables.manage')),
  'Kitchen and table permission keys are present'
);

select ok(
  exists (select 1 from pg_policies where schemaname='public'
    and tablename='kitchen_orders' and policyname='kitchen_orders_branch_select'
    and cmd='SELECT'),
  'Kitchen orders have a branch-scoped read policy'
);

select ok(
  has_function_privilege('authenticated','public.set_kitchen_order_status(uuid,text,text)','EXECUTE')
  and not has_function_privilege('anon','public.set_kitchen_order_status(uuid,text,text)','EXECUTE'),
  'Only authenticated users can invoke the validated kitchen status RPC'
);

select ok(
  not has_table_privilege('authenticated','public.kitchen_orders','INSERT')
  and not has_table_privilege('authenticated','public.kitchen_orders','UPDATE')
  and not has_table_privilege('authenticated','public.kitchen_orders','DELETE')
  and not has_table_privilege('authenticated','public.kitchen_order_events','INSERT')
  and not has_table_privilege('authenticated','public.kitchen_order_events','UPDATE')
  and not has_table_privilege('authenticated','public.kitchen_order_events','DELETE'),
  'Authenticated clients cannot directly mutate kitchen orders or events'
);

select ok(
  (select prosecdef from pg_proc where oid='private.set_kitchen_order_status(uuid,text,text)'::regprocedure)
  and not (select prosecdef from pg_proc where oid='public.set_kitchen_order_status(uuid,text,text)'::regprocedure),
  'Kitchen status writes use a private SECURITY DEFINER implementation behind an INVOKER wrapper'
);

select ok(
  exists (select 1 from pg_trigger where tgrelid='public.sales'::regclass
    and tgname='trg_create_kitchen_order_for_sale' and not tgisinternal),
  'A committed sale creates a kitchen ticket inside the checkout transaction'
);

select * from finish();
rollback;
