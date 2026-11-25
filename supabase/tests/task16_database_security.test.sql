BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(14);

SELECT is(
  (SELECT count(*)::int
   FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r','p')
     AND NOT c.relrowsecurity),
  0,
  'Every public table has RLS enabled'
);

SELECT is(
  (SELECT count(*)::int
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
       OR (has_function_privilege('authenticated', p.oid, 'EXECUTE')
         AND NOT (
           (p.proname = 'get_marketing_campaign_analytics'
             AND pg_get_function_identity_arguments(p.oid) = 'uuid')
           OR
           (p.proname = 'record_marketing_campaign_event'
             AND pg_get_function_identity_arguments(p.oid) = 'uuid, text')
         )))),
  0,
  'Only the two reviewed marketing RPCs may be executable by authenticated; anon gets none'
);

SELECT is(
  (SELECT count(*)::int
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND (
       (p.proname = 'get_marketing_campaign_analytics'
         AND pg_get_function_identity_arguments(p.oid) = 'uuid')
       OR
       (p.proname = 'record_marketing_campaign_event'
         AND pg_get_function_identity_arguments(p.oid) = 'uuid, text')
     )
     AND (
       p.prosrc NOT ILIKE '%auth.uid%'
       OR NOT EXISTS (
         SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
         WHERE cfg LIKE 'search_path=%'
       ))),
  0,
  'Every executable marketing SECURITY DEFINER RPC verifies auth.uid and pins search_path'
);

SELECT is(
  (SELECT count(*)::int
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND NOT EXISTS (
       SELECT 1
       FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
       WHERE cfg LIKE 'search_path=%'
     )),
  0,
  'Every public SECURITY DEFINER function pins search_path'
);

SELECT is(
  (SELECT count(*)::int
   FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'v'
     AND NOT coalesce(c.reloptions @> ARRAY['security_invoker=true'], false)
     AND (has_table_privilege('anon', c.oid, 'SELECT')
       OR has_table_privilege('authenticated', c.oid, 'SELECT'))),
  0,
  'Public views without security_invoker are not readable by API roles'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='companies'
      AND permissive='RESTRICTIVE' AND cmd='SELECT'),
  'Company reads have a restrictive scope policy'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='branches'
      AND permissive='RESTRICTIVE' AND cmd='SELECT'),
  'Branch reads have a restrictive scope policy'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='sales'
      AND permissive='RESTRICTIVE'
      AND (qual ILIKE '%company%' OR qual ILIKE '%tenant%' OR qual ILIKE '%branch%')),
  'Sales retain a restrictive tenant or branch boundary'
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
  'Marketing campaign writes retain restrictive company-scope policies'
);


SELECT is(
  (SELECT count(*)::int
   FROM pg_policies
   WHERE schemaname='public'
     AND tablename IN ('payroll_runs','payroll_items')
     AND cmd IN ('SELECT','INSERT','UPDATE','DELETE')
     AND permissive='RESTRICTIVE'),
  16,
  'Payroll runs and items retain restrictive scope and permission gates for all CRUD operations'
);

SELECT is(
  (SELECT count(*)::int
   FROM pg_policies
   WHERE schemaname='public'
     AND tablename='profiles'
     AND cmd='UPDATE'
     AND permissive='RESTRICTIVE'),
  3,
  'Profile updates retain company, permission, and Super Owner protection gates'
);


SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND tablename='promotional_offers'
      AND policyname='Tenant members read promotional offers'
      AND cmd='SELECT'
      AND qual ILIKE '%has_permission%'
      AND qual ILIKE '%private.can_access_branch%'
  )
  AND (
    SELECT count(*) = 3
    FROM pg_policies
    WHERE schemaname='public'
      AND tablename='promotional_offers'
      AND policyname IN (
        'Promotion managers insert offers',
        'Promotion managers update offers',
        'Promotion managers delete offers'
      )
      AND (
        coalesce(qual,'') || coalesce(with_check,'')
      ) ILIKE '%has_permission%'
      AND (
        coalesce(qual,'') || coalesce(with_check,'')
      ) ILIKE '%private.can_access_branch%'
      AND (
        coalesce(qual,'') || coalesce(with_check,'')
      ) ILIKE '%private.is_company_member%'
  ),
  'Promotional offer read and write policies retain permission, company, and branch scope checks'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND tablename='promotion_redemptions'
      AND policyname='Promotion managers read redemptions'
      AND cmd='SELECT'
      AND qual ILIKE '%private.is_tenant_member%'
      AND qual ILIKE '%has_permission%'
      AND qual ILIKE '%private.can_access_branch%'
  ),
  'Promotion redemption reads retain tenant, permission, and branch scope checks'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND tablename='marketing_ad_placements'
      AND policyname='marketing_ad_placements_company_scope'
      AND permissive='RESTRICTIVE'
      AND cmd='ALL'
      AND qual ILIKE '%company_id%'
      AND with_check ILIKE '%company_id%'
      AND qual ILIKE '%ads.manage%'
      AND with_check ILIKE '%ads.manage%'
  ),
  'Marketing ad placement writes retain restrictive company scope and ads.manage checks'
);

SELECT * FROM finish();
ROLLBACK;
