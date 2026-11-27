BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(47);

SELECT ok(NOT has_table_privilege('anon', 'public.expenses', 'SELECT'), 'anon cannot select expenses');
SELECT ok(NOT has_table_privilege('anon', 'public.expenses', 'INSERT'), 'anon cannot insert expenses');
SELECT ok(NOT has_table_privilege('anon', 'public.expenses', 'UPDATE'), 'anon cannot update expenses');
SELECT ok(NOT has_table_privilege('anon', 'public.expenses', 'DELETE'), 'anon cannot delete expenses');
SELECT ok(NOT has_table_privilege('anon', 'public.expenses', 'TRUNCATE'), 'anon cannot truncate expenses');
SELECT ok(NOT has_table_privilege('anon', 'public.expenses', 'REFERENCES'), 'anon cannot reference expenses');
SELECT ok(NOT has_table_privilege('anon', 'public.expenses', 'TRIGGER'), 'anon cannot create triggers on expenses');

SELECT ok(NOT has_table_privilege('anon', 'public.payroll_runs', 'SELECT'), 'anon cannot select payroll runs');
SELECT ok(NOT has_table_privilege('anon', 'public.payroll_runs', 'INSERT'), 'anon cannot insert payroll runs');
SELECT ok(NOT has_table_privilege('anon', 'public.payroll_runs', 'UPDATE'), 'anon cannot update payroll runs');
SELECT ok(NOT has_table_privilege('anon', 'public.payroll_runs', 'DELETE'), 'anon cannot delete payroll runs');
SELECT ok(NOT has_table_privilege('anon', 'public.payroll_runs', 'TRUNCATE'), 'anon cannot truncate payroll runs');
SELECT ok(NOT has_table_privilege('anon', 'public.payroll_runs', 'REFERENCES'), 'anon cannot reference payroll runs');
SELECT ok(NOT has_table_privilege('anon', 'public.payroll_runs', 'TRIGGER'), 'anon cannot create triggers on payroll runs');

SELECT ok(NOT has_table_privilege('anon', 'public.payroll_items', 'SELECT'), 'anon cannot select payroll items');
SELECT ok(NOT has_table_privilege('anon', 'public.payroll_items', 'INSERT'), 'anon cannot insert payroll items');
SELECT ok(NOT has_table_privilege('anon', 'public.payroll_items', 'UPDATE'), 'anon cannot update payroll items');
SELECT ok(NOT has_table_privilege('anon', 'public.payroll_items', 'DELETE'), 'anon cannot delete payroll items');
SELECT ok(NOT has_table_privilege('anon', 'public.payroll_items', 'TRUNCATE'), 'anon cannot truncate payroll items');
SELECT ok(NOT has_table_privilege('anon', 'public.payroll_items', 'REFERENCES'), 'anon cannot reference payroll items');
SELECT ok(NOT has_table_privilege('anon', 'public.payroll_items', 'TRIGGER'), 'anon cannot create triggers on payroll items');

SELECT ok(has_table_privilege('authenticated', 'public.expenses', 'SELECT'), 'authenticated can select expenses');
SELECT ok(has_table_privilege('authenticated', 'public.expenses', 'INSERT'), 'authenticated can insert expenses');
SELECT ok(has_table_privilege('authenticated', 'public.expenses', 'UPDATE'), 'authenticated can update expenses');
SELECT ok(NOT has_table_privilege('authenticated', 'public.expenses', 'DELETE'), 'authenticated cannot physically delete expenses');
SELECT ok(NOT has_table_privilege('authenticated', 'public.expenses', 'TRUNCATE'), 'authenticated cannot truncate expenses');
SELECT ok(NOT has_table_privilege('authenticated', 'public.expenses', 'REFERENCES'), 'authenticated cannot reference expenses');
SELECT ok(NOT has_table_privilege('authenticated', 'public.expenses', 'TRIGGER'), 'authenticated cannot create triggers on expenses');

SELECT ok(has_table_privilege('authenticated', 'public.payroll_runs', 'SELECT'), 'authenticated can select payroll runs');
SELECT ok(has_table_privilege('authenticated', 'public.payroll_runs', 'INSERT'), 'authenticated can insert payroll runs');
SELECT ok(has_table_privilege('authenticated', 'public.payroll_runs', 'UPDATE'), 'authenticated can update payroll runs');
SELECT ok(NOT has_table_privilege('authenticated', 'public.payroll_runs', 'DELETE'), 'authenticated cannot physically delete payroll runs');
SELECT ok(NOT has_table_privilege('authenticated', 'public.payroll_runs', 'TRUNCATE'), 'authenticated cannot truncate payroll runs');
SELECT ok(NOT has_table_privilege('authenticated', 'public.payroll_runs', 'REFERENCES'), 'authenticated cannot reference payroll runs');
SELECT ok(NOT has_table_privilege('authenticated', 'public.payroll_runs', 'TRIGGER'), 'authenticated cannot create triggers on payroll runs');

SELECT ok(has_table_privilege('authenticated', 'public.payroll_items', 'SELECT'), 'authenticated can select payroll items');
SELECT ok(has_table_privilege('authenticated', 'public.payroll_items', 'INSERT'), 'authenticated can insert payroll items');
SELECT ok(has_table_privilege('authenticated', 'public.payroll_items', 'UPDATE'), 'authenticated can update payroll items');
SELECT ok(NOT has_table_privilege('authenticated', 'public.payroll_items', 'DELETE'), 'authenticated cannot physically delete payroll items');
SELECT ok(NOT has_table_privilege('authenticated', 'public.payroll_items', 'TRUNCATE'), 'authenticated cannot truncate payroll items');
SELECT ok(NOT has_table_privilege('authenticated', 'public.payroll_items', 'REFERENCES'), 'authenticated cannot reference payroll items');
SELECT ok(NOT has_table_privilege('authenticated', 'public.payroll_items', 'TRIGGER'), 'authenticated cannot create triggers on payroll items');

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('payroll_runs', 'payroll_items')
      AND roles @> ARRAY['authenticated']::name[]
      AND permissive = 'PERMISSIVE'
      AND cmd IN ('ALL', 'DELETE')
  ),
  'authenticated has no permissive payroll DELETE policy'
);

SELECT ok(
  (SELECT count(*) = 4
   FROM pg_policies
   WHERE schemaname = 'public'
     AND policyname IN (
       'payroll_runs_insert_access',
       'payroll_runs_update_access',
       'payroll_items_insert_access',
       'payroll_items_update_access'
     )),
  'explicit payroll INSERT and UPDATE policies remain available'
);

SELECT ok(has_table_privilege('service_role', 'public.expenses', 'DELETE'), 'service_role retains expense cleanup access');
SELECT ok(has_table_privilege('service_role', 'public.payroll_runs', 'DELETE'), 'service_role retains payroll rollback access');
SELECT ok(has_table_privilege('service_role', 'public.payroll_items', 'DELETE'), 'service_role retains payroll item rollback access');

SELECT * FROM finish();
ROLLBACK;
