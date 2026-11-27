-- Align the hosted migration role's default privileges with the least-privilege
-- defaults already established for postgres. RLS is not a substitute for removing
-- API-role TRUNCATE/REFERENCES/TRIGGER grants, because those are not row policies.
BEGIN;

-- No unauthenticated Data API access is intended for this authenticated business app.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Keep authenticated DML permissions and RLS policies intact, but remove DDL-like
-- privileges that are not needed by the client and are not protected by RLS.
REVOKE TRUNCATE, REFERENCES, TRIGGER
ON ALL TABLES IN SCHEMA public
FROM authenticated;

-- This is a trigger-only function. Its existing trigger remains functional without
-- allowing direct API-role invocation.
REVOKE EXECUTE ON FUNCTION public.prevent_tenant_owner_id_change()
FROM PUBLIC, anon;

-- Hosted migrations may create objects as supabase_admin rather than postgres.
-- Apply the same least-privilege defaults to that creator role so future objects
-- are not automatically exposed to anon/authenticated/service_role.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC';
  END IF;
END;
$$;

COMMIT;
