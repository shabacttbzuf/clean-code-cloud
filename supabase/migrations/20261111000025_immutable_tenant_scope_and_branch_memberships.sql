-- Tenant ownership is immutable after creation. Profiles are excluded because
-- the first-tenant bootstrap assigns their initial tenant_id.
BEGIN;

CREATE OR REPLACE FUNCTION private.prevent_tenant_scope_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
BEGIN
  IF OLD.tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'A record cannot be reassigned to another tenant'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_tenant_scope_reassignment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.prevent_tenant_scope_reassignment() TO service_role;

DO $$
DECLARE
  t record;
  trigger_name text;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relname <> 'profiles'
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid=c.oid AND a.attname='tenant_id' AND NOT a.attisdropped
      )
  LOOP
    trigger_name := 'trg_immutable_tenant_scope';
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_name, t.relname);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OF tenant_id ON public.%I FOR EACH ROW EXECUTE FUNCTION private.prevent_tenant_scope_reassignment()',
      trigger_name, t.relname
    );
  END LOOP;
END;
$$;

-- These two optional branch references do not currently have foreign keys.
-- Validate them with the same tenant-scoped trigger used for FK-backed columns.
DROP TRIGGER IF EXISTS trg_tenant_fk_user_roles_branch_id ON public.user_roles;
CREATE TRIGGER trg_tenant_fk_user_roles_branch_id
BEFORE INSERT OR UPDATE OF branch_id, tenant_id ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION private.enforce_same_tenant_foreign_key('branches', 'branch_id', 'id');

DROP TRIGGER IF EXISTS trg_tenant_fk_profiles_branch_id ON public.profiles;
CREATE TRIGGER trg_tenant_fk_profiles_branch_id
BEFORE INSERT OR UPDATE OF branch_id, tenant_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.enforce_same_tenant_foreign_key('branches', 'branch_id', 'id');

DROP TRIGGER IF EXISTS trg_tenant_fk_employees_user_id ON public.employees;
CREATE TRIGGER trg_tenant_fk_employees_user_id
BEFORE INSERT OR UPDATE OF user_id, tenant_id ON public.employees
FOR EACH ROW EXECUTE FUNCTION private.enforce_same_tenant_foreign_key('profiles', 'user_id', 'id');

COMMIT;
