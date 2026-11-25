begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

select ok(
  to_regclass('private.kitchen_order_sync_requests') is not null
  and (select relrowsecurity from pg_class where oid='private.kitchen_order_sync_requests'::regclass),
  'The idempotency ledger exists only in the private schema'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid='private.kitchen_order_sync_requests'::regclass
      and conname='kitchen_order_sync_requests_pkey'
      and pg_get_constraintdef(oid) like '%tenant_id, actor_id, idempotency_key%'
  ),
  'Idempotency keys are unique per tenant and authenticated actor'
);

select ok(
  not has_table_privilege('authenticated','private.kitchen_order_sync_requests','SELECT')
  and not has_table_privilege('authenticated','private.kitchen_order_sync_requests','INSERT')
  and not has_table_privilege('anon','private.kitchen_order_sync_requests','SELECT'),
  'API roles cannot read or mutate the private idempotency ledger directly'
);

select ok(
  has_function_privilege('authenticated','public.set_kitchen_order_status_idempotent(uuid,uuid,uuid,uuid,text,text,uuid)','EXECUTE')
  and not has_function_privilege('anon','public.set_kitchen_order_status_idempotent(uuid,uuid,uuid,uuid,text,text,uuid)','EXECUTE'),
  'Only authenticated users can invoke the idempotent kitchen RPC'
);

select ok(
  (select prosecdef from pg_proc where oid='private.set_kitchen_order_status_idempotent(uuid,uuid,uuid,uuid,text,text,uuid)'::regprocedure)
  and not (select prosecdef from pg_proc where oid='public.set_kitchen_order_status_idempotent(uuid,uuid,uuid,uuid,text,text,uuid)'::regprocedure),
  'A SECURITY INVOKER public wrapper delegates to a private SECURITY DEFINER implementation'
);

select ok(
  position('auth.uid()' in pg_get_functiondef('private.set_kitchen_order_status_idempotent(uuid,uuid,uuid,uuid,text,text,uuid)'::regprocedure)) > 0
  and position('_expected_actor_id' in pg_get_functiondef('private.set_kitchen_order_status_idempotent(uuid,uuid,uuid,uuid,text,text,uuid)'::regprocedure)) > 0
  and position('private.has_permission' in pg_get_functiondef('private.set_kitchen_order_status_idempotent(uuid,uuid,uuid,uuid,text,text,uuid)'::regprocedure)) > 0
  and position('private.can_access_branch' in pg_get_functiondef('private.set_kitchen_order_status_idempotent(uuid,uuid,uuid,uuid,text,text,uuid)'::regprocedure)) > 0,
  'Replay derives the actor from the JWT and re-checks kitchen permission and branch access'
);

select ok(
  position('ON CONFLICT' in pg_get_functiondef('private.set_kitchen_order_status_idempotent(uuid,uuid,uuid,uuid,text,text,uuid)'::regprocedure)) > 0
  and position('result=to_jsonb(v_updated)' in pg_get_functiondef('private.set_kitchen_order_status_idempotent(uuid,uuid,uuid,uuid,text,text,uuid)'::regprocedure)) > 0,
  'The operation result is stored atomically and returned for duplicate delivery'
);


select ok(
  position('_expected_tenant_id' in pg_get_functiondef('private.set_kitchen_order_status_idempotent(uuid,uuid,uuid,uuid,text,text,uuid)'::regprocedure)) > 0
  and position('_expected_branch_id' in pg_get_functiondef('private.set_kitchen_order_status_idempotent(uuid,uuid,uuid,uuid,text,text,uuid)'::regprocedure)) > 0
  and position('v_order.tenant_id IS DISTINCT FROM _expected_tenant_id' in pg_get_functiondef('private.set_kitchen_order_status_idempotent(uuid,uuid,uuid,uuid,text,text,uuid)'::regprocedure)) > 0
  and position('v_order.branch_id IS DISTINCT FROM _expected_branch_id' in pg_get_functiondef('private.set_kitchen_order_status_idempotent(uuid,uuid,uuid,uuid,text,text,uuid)'::regprocedure)) > 0,
  'Replay must match the queued tenant and branch against the persisted kitchen order'
);


select ok(
  position('_new_status IS NULL' in pg_get_functiondef('private.set_kitchen_order_status_idempotent(uuid,uuid,uuid,uuid,text,text,uuid)'::regprocedure)) > 0
  and position('length(_notes) > 1000' in pg_get_functiondef('private.set_kitchen_order_status_idempotent(uuid,uuid,uuid,uuid,text,text,uuid)'::regprocedure)) > 0
  and position('v_valid_transition' in pg_get_functiondef('private.set_kitchen_order_status_idempotent(uuid,uuid,uuid,uuid,text,text,uuid)'::regprocedure)) > 0,
  'Replay validates status, note length and the allowed kitchen state transition'
);

select ok(
  position('UPDATE public.kitchen_orders' in pg_get_functiondef('private.set_kitchen_order_status_idempotent(uuid,uuid,uuid,uuid,text,text,uuid)'::regprocedure)) > 0
  and position('INSERT INTO public.kitchen_order_events' in pg_get_functiondef('private.set_kitchen_order_status_idempotent(uuid,uuid,uuid,uuid,text,text,uuid)'::regprocedure)) > 0
  and position('UPDATE public.sales' in pg_get_functiondef('private.set_kitchen_order_status_idempotent(uuid,uuid,uuid,uuid,text,text,uuid)'::regprocedure)) = 0
  and position('UPDATE public.payments' in pg_get_functiondef('private.set_kitchen_order_status_idempotent(uuid,uuid,uuid,uuid,text,text,uuid)'::regprocedure)) = 0
  and position('UPDATE public.inventory' in pg_get_functiondef('private.set_kitchen_order_status_idempotent(uuid,uuid,uuid,uuid,text,text,uuid)'::regprocedure)) = 0,
  'Kitchen replay changes only kitchen status and its event log, never sales, payments or inventory'
);

select * from finish();
rollback;
