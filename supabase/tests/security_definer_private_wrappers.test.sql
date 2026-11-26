-- SECURITY DEFINER implementations must not remain callable from exposed public schema.
BEGIN;
SELECT plan(14);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ),
  'No authenticated-callable SECURITY DEFINER functions remain in public'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'private'),
  'Private schema exists'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.create_sale_with_items(uuid,uuid,uuid,uuid,numeric,payment_method,jsonb)'::regprocedure, 'EXECUTE'),
  'POS sale RPC remains callable through public invoker wrapper'
);

SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.create_sale_with_items(uuid,uuid,uuid,uuid,numeric,payment_method,jsonb)'::regprocedure),
  'POS public wrapper executes as invoker'
);

SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'private.create_sale_with_items(uuid,uuid,uuid,uuid,numeric,payment_method,jsonb)'::regprocedure),
  'Privileged POS implementation remains private SECURITY DEFINER'
);


SELECT ok(
  has_function_privilege('authenticated', 'public.record_marketing_campaign_event(uuid,text)'::regprocedure, 'EXECUTE'),
  'Campaign event RPC remains callable through the public invoker wrapper'
);

SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.record_marketing_campaign_event(uuid,text)'::regprocedure),
  'Campaign event public wrapper executes as invoker'
);

SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'private.record_marketing_campaign_event(uuid,text)'::regprocedure),
  'Campaign event privileged implementation remains in private schema'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.get_marketing_campaign_analytics(uuid)'::regprocedure, 'EXECUTE'),
  'Campaign analytics RPC remains callable through the public invoker wrapper'
);

SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.get_marketing_campaign_analytics(uuid)'::regprocedure),
  'Campaign analytics public wrapper executes as invoker'
);

SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'private.get_marketing_campaign_analytics(uuid)'::regprocedure),
  'Campaign analytics privileged implementation remains in private schema'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure, 'EXECUTE'),
  'Inventory adjustment RPC remains callable through the public invoker wrapper'
);

SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure),
  'Inventory adjustment public wrapper executes as invoker'
);

SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'private.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure),
  'Inventory adjustment privileged implementation remains in the private schema'
);

SELECT * FROM finish();
ROLLBACK;
