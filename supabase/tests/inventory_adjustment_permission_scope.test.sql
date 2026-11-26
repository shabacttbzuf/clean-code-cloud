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
  (SELECT prosecdef FROM pg_proc WHERE oid='public.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure)
  AND has_function_privilege('authenticated', 'public.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure, 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure, 'EXECUTE'),
  'Authenticated stock adjustment remains available only through the SECURITY DEFINER RPC'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p
    CROSS JOIN LATERAL unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS setting(value)
    WHERE p.oid='public.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure
      AND setting.value='search_path=pg_catalog, public, private, pg_temp'
  ),
  'Stock adjustment RPC pins a safe search_path'
);
SELECT ok(
  pg_get_functiondef('public.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure) ILIKE '%inventory.adjust%'
  AND pg_get_functiondef('public.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure) ILIKE '%private.can_access_branch%'
  AND pg_get_functiondef('public.adjust_inventory_balance(uuid,uuid,uuid,numeric,text)'::regprocedure) ILIKE '%inventory_transactions%',
  'Stock adjustment RPC enforces granular permission, branch access, and movement history'
);

SELECT * FROM finish();
ROLLBACK;
