BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(9);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.inventory', 'INSERT'),
  'Authenticated clients cannot insert inventory balances directly'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.inventory', 'UPDATE'),
  'Authenticated clients cannot update inventory balances directly'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.inventory', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.inventory', 'TRUNCATE'),
  'Authenticated clients cannot delete or truncate inventory balances directly'
);
SELECT ok(
  has_table_privilege('service_role', 'public.inventory', 'INSERT')
  AND has_table_privilege('service_role', 'public.inventory', 'UPDATE')
  AND has_table_privilege('service_role', 'public.inventory', 'DELETE'),
  'Trusted service role retains controlled inventory maintenance'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='inventory'
      AND policyname='permission_scope_inventory_select'
      AND cmd='SELECT' AND permissive='PERMISSIVE'
      AND qual ILIKE '%private.can_access_branch%'
  ),
  'Inventory reads remain available through the permission and branch-scoped SELECT policy'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='inventory'
      AND policyname='Warehouse and admins manage inventory'
  ),
  'Legacy broad inventory management policy is removed'
);
SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure)
  AND has_function_privilege('authenticated', 'public.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure, 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure, 'EXECUTE'),
  'Public stock adjustment RPC is an invoker wrapper callable by authenticated users only'
);
SELECT ok(
  (SELECT prosecdef FROM pg_proc WHERE oid='private.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure)
  AND has_function_privilege('authenticated', 'private.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure, 'EXECUTE')
  AND NOT has_function_privilege('anon', 'private.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure, 'EXECUTE')
  AND EXISTS (
    SELECT 1 FROM pg_proc p
    CROSS JOIN LATERAL unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS setting(value)
    WHERE p.oid='private.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure
      AND setting.value='search_path=pg_catalog, public, private, pg_temp'
  ),
  'Private stock adjustment implementation is SECURITY DEFINER with a pinned search_path'
);
SELECT ok(
  pg_get_functiondef('private.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure) ILIKE '%inventory.adjust%'
  AND pg_get_functiondef('private.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure) ILIKE '%private.can_access_branch%'
  AND pg_get_functiondef('private.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure) ILIKE '%inventory_transactions%'
  AND pg_get_functiondef('public.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure) ILIKE '%private.adjust_inventory_balance%',
  'Private RPC enforces granular permission, branch access, movement history, and is called by the public invoker wrapper'
);

SELECT * FROM finish();
ROLLBACK;
