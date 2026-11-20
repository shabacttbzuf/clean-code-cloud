begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select ok(
  (select relrowsecurity from pg_class where oid='public.restaurant_tables'::regclass),
  'Restaurant tables enforce row-level security'
);

select ok(
  (select count(*)=6 from information_schema.columns
   where table_schema='public' and table_name='sales'
     and column_name in ('order_type','table_id','delivery_customer_name','delivery_customer_phone','delivery_address','delivery_fee')),
  'Sales retain order type, table and delivery metadata'
);

select ok(
  (select count(*)=2 from public.permissions where key in ('tables.view','tables.manage')),
  'Table permission keys are registered'
);

select ok(
  exists (select 1 from pg_policies where schemaname='public'
    and tablename='restaurant_tables' and policyname='restaurant_tables_branch_select'
    and cmd='SELECT')
  and exists (select 1 from pg_policies where schemaname='public'
    and tablename='restaurant_tables' and policyname='restaurant_tables_branch_update'
    and cmd='UPDATE'),
  'Table reads and management are protected by branch-scoped RLS'
);

select ok(
  has_function_privilege('authenticated','public.create_pos_order(uuid,uuid,uuid,uuid,numeric,uuid,numeric,payment_method,jsonb,text,uuid,text,text,text,numeric)','EXECUTE')
  and not has_function_privilege('anon','public.create_pos_order(uuid,uuid,uuid,uuid,numeric,uuid,numeric,payment_method,jsonb,text,uuid,text,text,text,numeric)','EXECUTE'),
  'Only authenticated users can create POS orders through the validated RPC'
);

select ok(
  (select prosecdef from pg_proc where oid='private.create_pos_order(uuid,uuid,uuid,uuid,numeric,uuid,numeric,payment_method,jsonb,text,uuid,text,text,text,numeric)'::regprocedure)
  and not (select prosecdef from pg_proc where oid='public.create_pos_order(uuid,uuid,uuid,uuid,numeric,uuid,numeric,payment_method,jsonb,text,uuid,text,text,text,numeric)'::regprocedure),
  'POS writes use a private SECURITY DEFINER implementation and public INVOKER wrapper'
);

select ok(
  not has_column_privilege('authenticated','public.restaurant_tables','current_sale_id','UPDATE')
  and not has_column_privilege('authenticated','public.restaurant_tables','current_sale_id','INSERT'),
  'Clients cannot forge restaurant table occupancy'
);

select ok(
  exists (select 1 from pg_trigger where tgrelid='public.kitchen_orders'::regclass
    and tgname='trg_notify_branch_kitchen_ready' and not tgisinternal)
  and (select count(*)=2 from public.role_permissions
       where role_kind='builtin' and permission_key='notifications.view'
         and builtin_role::text in ('cashier','waiter')),
  'Kitchen readiness creates branch notifications visible to cashiers and waiters'
);

select * from finish();
rollback;
