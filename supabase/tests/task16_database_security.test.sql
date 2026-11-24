BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(8);

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
     AND has_function_privilege('anon', p.oid, 'EXECUTE')),
  0,
  'No public SECURITY DEFINER function is executable by anon'
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

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='marketing_campaigns'
      AND permissive='RESTRICTIVE'
      AND cmd IN ('INSERT','UPDATE','DELETE')),
  'Marketing campaign writes retain restrictive scope enforcement'
);

SELECT * FROM finish();
ROLLBACK;
