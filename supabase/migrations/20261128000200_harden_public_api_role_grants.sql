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

-- The hosted migration role `supabase_admin` has separate default ACLs.
-- The current migration role is not a member of supabase_admin, so PostgreSQL
-- correctly rejects changing another role's defaults here. A privileged,
-- operator-run script is provided under supabase/manual/ and is NOT auto-applied.

COMMIT;
