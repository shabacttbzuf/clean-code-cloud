BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(10);

SELECT is(
  (SELECT count(*)::int
   FROM pg_class c
   JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity),
  0,
  'Every exposed public table has row-level security enabled'
);

SELECT is(
  (SELECT count(*)::int
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prosecdef
     AND (has_function_privilege('anon',p.oid,'EXECUTE')
       OR has_function_privilege('authenticated',p.oid,'EXECUTE'))),
  0,
  'No public SECURITY DEFINER function is executable by API roles'
);

SELECT is(
  (SELECT count(*)::int
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='v'
     AND NOT coalesce(c.reloptions @> ARRAY['security_invoker=true'], false)),
  0,
  'Every public view executes with invoker security semantics'
);

SELECT ok(
  position('auth.uid()' in pg_get_functiondef('private.can_access_branch(uuid,uuid,uuid)'::regprocedure)) > 0,
  'Branch access helper binds the requested actor to the authenticated session'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.tenants'::regclass
      AND tgname='trg_prevent_tenant_owner_id_change' AND NOT tgisinternal),
  'Tenant ownership cannot be reassigned through direct client updates'
);

SELECT is(
  (SELECT count(*)::int FROM pg_policies
   WHERE schemaname='public' AND tablename='marketing_campaigns'
     AND policyname IN (
       'company_scope_marketing_campaigns_insert',
       'company_scope_marketing_campaigns_update',
       'company_scope_marketing_campaigns_delete'
     ) AND permissive='RESTRICTIVE'),
  3,
  'Campaign writes retain restrictive company-scope policies'
);

SELECT ok(
  NOT has_table_privilege('authenticated','public.user_roles','INSERT')
  AND NOT has_table_privilege('authenticated','public.user_roles','UPDATE')
  AND NOT has_table_privilege('authenticated','public.user_roles','DELETE')
  AND NOT has_table_privilege('authenticated','public.role_permissions','INSERT')
  AND NOT has_table_privilege('authenticated','public.role_permissions','UPDATE')
  AND NOT has_table_privilege('authenticated','public.role_permissions','DELETE'),
  'Authorization tables cannot be mutated directly by authenticated clients'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_class WHERE oid='public.super_owners'::regclass AND relrowsecurity),
  'Super-owner authority records remain protected by RLS'
);

SELECT is(
  (SELECT count(*)::int
   FROM pg_indexes
   WHERE schemaname='public' AND indexname IN (
     'idx_kitchen_order_events_actor_id_fk',
     'idx_kitchen_order_events_branch_id_fk',
     'idx_kitchen_order_events_tenant_id_fk',
     'idx_kitchen_orders_branch_id_fk',
     'idx_leave_requests_rejected_by_fk',
     'idx_restaurant_tables_branch_id_fk',
     'idx_sales_table_id_fk'
   )),
  7,
  'All seven advisor-identified foreign-key indexes exist'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='platform_branding'
      AND policyname='platform branding readable by authenticated'
      AND cmd='SELECT' AND qual='true'),
  'Global platform branding remains intentionally readable to authenticated users'
);

SELECT * FROM finish();
ROLLBACK;
