BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(8);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND (
        has_table_privilege('anon', c.oid, 'SELECT')
        OR has_table_privilege('anon', c.oid, 'INSERT')
        OR has_table_privilege('anon', c.oid, 'UPDATE')
        OR has_table_privilege('anon', c.oid, 'DELETE')
        OR has_table_privilege('anon', c.oid, 'TRUNCATE')
        OR has_table_privilege('anon', c.oid, 'REFERENCES')
        OR has_table_privilege('anon', c.oid, 'TRIGGER')
      )
  ),
  'anon has no privileges on public tables or views'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND (
        has_sequence_privilege('anon', c.oid, 'USAGE')
        OR has_sequence_privilege('anon', c.oid, 'SELECT')
        OR has_sequence_privilege('anon', c.oid, 'UPDATE')
      )
  ),
  'anon has no privileges on public sequences'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND (
        has_table_privilege('authenticated', c.oid, 'TRUNCATE')
        OR has_table_privilege('authenticated', c.oid, 'REFERENCES')
        OR has_table_privilege('authenticated', c.oid, 'TRIGGER')
      )
  ),
  'authenticated has no TRUNCATE, REFERENCES or TRIGGER on public relations'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  'anon cannot execute public functions'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclrole = to_regrole('supabase_admin')::oid
      AND d.defaclnamespace = 'public'::regnamespace
      AND a.grantee IN (
        to_regrole('anon')::oid,
        to_regrole('authenticated')::oid,
        to_regrole('service_role')::oid
      )
  ),
  'supabase_admin has no default API-role grants in public'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclrole = to_regrole('supabase_admin')::oid
      AND d.defaclobjtype = 'f'
      AND a.grantee = 0
      AND a.privilege_type = 'EXECUTE'
  ),
  'supabase_admin does not grant function EXECUTE to PUBLIC by default'
);

SELECT ok(
  has_table_privilege('service_role', 'public.expenses', 'DELETE')
  AND has_table_privilege('service_role', 'public.payroll_runs', 'DELETE')
  AND has_table_privilege('service_role', 'public.payroll_items', 'DELETE'),
  'service_role retains server-side financial rollback access'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.expenses', 'SELECT')
  AND has_table_privilege('authenticated', 'public.expenses', 'INSERT')
  AND has_table_privilege('authenticated', 'public.expenses', 'UPDATE'),
  'authenticated retains normal expense read and write privileges'
);

SELECT * FROM finish();
ROLLBACK;
