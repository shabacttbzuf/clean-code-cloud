-- MANUAL / PRIVILEGED OPERATOR STEP — NOT PART OF AUTOMATIC MIGRATIONS.
-- Run only as supabase_admin or a role with membership in supabase_admin.
-- The normal migration role in this project is postgres and is NOT a member of
-- supabase_admin; running this script as postgres will intentionally fail.
DO $$
BEGIN
  IF NOT pg_has_role(current_user, 'supabase_admin', 'MEMBER') THEN
    RAISE EXCEPTION 'Run this script as supabase_admin or a member of supabase_admin; current_user=%', current_user;
  END IF;
END;
$$;

BEGIN;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;

-- Verify: no default ACL entry should grant public API roles privileges.
SELECT d.defaclobjtype, a.grantee::regrole AS grantee, a.privilege_type
FROM pg_default_acl d
CROSS JOIN LATERAL aclexplode(d.defaclacl) a
WHERE d.defaclrole = 'supabase_admin'::regrole
  AND d.defaclnamespace = 'public'::regnamespace
  AND a.grantee IN (
    'anon'::regrole,
    'authenticated'::regrole,
    'service_role'::regrole,
    0
  )
ORDER BY d.defaclobjtype, grantee, privilege_type;
