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
  (SELECT count(*)::int
   FROM pg_policies
   WHERE schemaname='public'
     AND tablename='marketing_campaigns'
     AND permissive='RESTRICTIVE'
     AND policyname IN (
       'company_scope_marketing_campaigns_select',
       'company_scope_marketing_campaigns_insert',
       'company_scope_marketing_campaigns_update',
       'company_scope_marketing_campaigns_delete',
       'company_scope_marketing_campaigns_branch_select',
       'company_scope_marketing_campaigns_branch_insert',
       'company_scope_marketing_campaigns_branch_update',
       'company_scope_marketing_campaigns_branch_delete'
     )
     AND cmd IN ('SELECT','INSERT','UPDATE','DELETE')),
  8,
  'Marketing campaigns retain four company-scope and four branch-scope restrictive CRUD gates'
);

SELECT * FROM finish();
ROLLBACK;
