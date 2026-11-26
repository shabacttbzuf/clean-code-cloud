BEGIN;
SELECT plan(8);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.inventory', 'INSERT'),
  'Authenticated clients cannot insert inventory balances directly'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.inventory', 'UPDATE'),
  'Authenticated clients cannot update inventory balances directly'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.inventory', 'DELETE'),
  'Authenticated clients cannot delete inventory balances directly'
);

SELECT ok(
  has_table_privilege('service_role', 'public.inventory', 'INSERT')
  AND has_table_privilege('service_role', 'public.inventory', 'UPDATE')
  AND has_table_privilege('service_role', 'public.inventory', 'DELETE'),
  'Trusted service role retains controlled inventory maintenance'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='inventory'
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
      AND permissive='PERMISSIVE'
      AND (roles @> ARRAY['authenticated']::name[] OR roles @> ARRAY['public']::name[])
  ),
  'No direct inventory write policy remains for authenticated clients'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='inventory'
      AND policyname='permission_scope_inventory_select'
      AND cmd='SELECT' AND qual ILIKE '%can_access_branch%'
  ),
  'Inventory reads remain restricted to accessible branches'
);

SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure)
  AND has_function_privilege('authenticated', 'public.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure, 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure, 'EXECUTE'),
  'Authenticated stock adjustment remains available only through the SECURITY DEFINER RPC'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    CROSS JOIN LATERAL unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS setting(value)
    WHERE p.oid='private.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure
      AND setting.value='search_path=pg_catalog, public, private, pg_temp'
  )
  AND pg_get_functiondef('private.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure) ILIKE '%inventory.adjust%'
  AND pg_get_functiondef('private.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure) ILIKE '%can_access_branch%'
  AND pg_get_functiondef('private.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure) ILIKE '%inventory_transactions%',
  'Stock adjustment RPC pins search_path, enforces permission and branch scope, and records movement history'
);

SELECT * FROM finish();
ROLLBACK;
