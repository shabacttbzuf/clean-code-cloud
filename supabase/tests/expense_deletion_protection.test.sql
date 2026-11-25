BEGIN;
SELECT plan(4);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.expenses', 'DELETE'),
  'Authenticated clients cannot physically delete financial expense records'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.expenses', 'DELETE'),
  'Anonymous clients cannot physically delete financial expense records'
);

SELECT ok(
  has_table_privilege('service_role', 'public.expenses', 'DELETE'),
  'Trusted service role retains controlled maintenance capability'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'expenses'
      AND cmd IN ('DELETE', 'ALL')
      AND (roles @> ARRAY['authenticated']::name[] OR roles @> ARRAY['public']::name[])
  ),
  'No permissive DELETE or ALL RLS policy remains for authenticated expenses'
);

SELECT * FROM finish();
ROLLBACK;
