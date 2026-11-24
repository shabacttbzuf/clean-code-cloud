begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

select ok(
  to_regclass('private.kitchen_order_sync_requests') is not null,
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
  has_function_privilege('authenticated','public.set_kitchen_order_status_idempotent(uuid,text,text,uuid)','EXECUTE')
  and not has_function_privilege('anon','public.set_kitchen_order_status_idempotent(uuid,text,text,uuid)','EXECUTE')
  ,
  'Only authenticated users can invoke the idempotent kitchen RPC'
);

select ok(
  (select prosecdef from pg_proc where oid='private.set_kitchen_order_status_idempotent(uuid,text,text,uuid)'::regprocedure)
  and (select prosecdef from pg_proc where oid='public.set_kitchen_order_status_idempotent(uuid,text,text,uuid)'::regprocedure),
  'The wrapper and private implementation use a fixed-search-path privileged boundary'
);

select ok(
  position('auth.uid()' in pg_get_functiondef('private.set_kitchen_order_status_idempotent(uuid,text,text,uuid)'::regprocedure)) > 0
  and position('private.has_permission' in pg_get_functiondef('private.set_kitchen_order_status_idempotent(uuid,text,text,uuid)'::regprocedure)) > 0
  and position('private.can_access_branch' in pg_get_functiondef('private.set_kitchen_order_status_idempotent(uuid,text,text,uuid)'::regprocedure)) > 0,
  'Replay derives the actor from the JWT and re-checks kitchen permission and branch access'
);

select ok(
  position('ON CONFLICT' in pg_get_functiondef('private.set_kitchen_order_status_idempotent(uuid,text,text,uuid)'::regprocedure)) > 0
  and position('result=to_jsonb(v_updated)' in pg_get_functiondef('private.set_kitchen_order_status_idempotent(uuid,text,text,uuid)'::regprocedure)) > 0,
  'The operation result is stored atomically and returned for duplicate delivery'
);

select * from finish();
rollback;
