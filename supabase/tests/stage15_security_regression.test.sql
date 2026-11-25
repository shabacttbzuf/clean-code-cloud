BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(13);

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
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_permission_overrides'
      AND policyname='permission_gate_user_permission_overrides_insert'
      AND permissive='RESTRICTIVE'
      AND with_check LIKE '%permissions.manage%'
      AND with_check LIKE '%permission_key%'
      AND with_check LIKE '%granted_by%'
  )
  AND EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_permission_overrides'
      AND policyname='permission_gate_user_permission_overrides_update'
      AND permissive='RESTRICTIVE'
      AND qual LIKE '%permissions.manage%'
      AND with_check LIKE '%granted_by%'
  )
  AND EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_permission_overrides'
      AND policyname='permission_gate_user_permission_overrides_delete'
      AND permissive='RESTRICTIVE'
      AND qual LIKE '%permissions.manage%'
  )
  AND EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='private' AND p.proname='can_manage_permission_override_target'
      AND p.prosecdef
  ),
  'Permission override writes require manage authority, owned permission keys, actor identity and exact target scope'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_class WHERE oid='public.super_owners'::regclass AND relrowsecurity),
  'Super-owner authority records remain protected by RLS'
);

SELECT is(
  (SELECT count(DISTINCT tgrelid)::int
   FROM pg_trigger
   WHERE NOT tgisinternal
     AND tgfoid = 'public.log_audit_change()'::regprocedure
     AND tgrelid = ANY (ARRAY[
       'public.attendance'::regclass,
       'public.payroll_items'::regclass,
       'public.cash_sessions'::regclass,
       'public.payments'::regclass,
       'public.inventory_transactions'::regclass,
       'public.purchase_items'::regclass,
       'public.sale_items'::regclass,
       'public.sale_refunds'::regclass,
       'public.sale_refund_items'::regclass,
       'public.purchase_returns'::regclass,
       'public.purchase_return_items'::regclass,
       'public.marketing_campaigns'::regclass,
       'public.promotional_offers'::regclass
     ])),
  13,
  'Sensitive HR, cash, payment, inventory, refund, return and marketing records are audited'
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


SELECT ok(
  position('_items IS NULL' in pg_get_functiondef('private.create_purchase_with_items(uuid,uuid,uuid,uuid,text,text,jsonb)'::regprocedure)) > 0
  AND position('jsonb_typeof(_items) IS DISTINCT FROM ''array''' in pg_get_functiondef('private.create_purchase_with_items(uuid,uuid,uuid,uuid,text,text,jsonb)'::regprocedure)) > 0
  AND position('is_active = true' in pg_get_functiondef('private.create_purchase_with_items(uuid,uuid,uuid,uuid,text,text,jsonb)'::regprocedure)) > 0
  AND position('SET search_path = pg_catalog, public, private, pg_temp' in pg_get_functiondef('private.create_purchase_with_items(uuid,uuid,uuid,uuid,text,text,jsonb)'::regprocedure)) > 0,
  'Purchase RPC rejects NULL/non-array item payloads, validates an active tenant branch and uses a hardened search path'
);

SELECT * FROM finish();
ROLLBACK;
