-- Tighten tenant immutability: only a profile's first assignment may move NULL -> tenant.
BEGIN;

CREATE OR REPLACE FUNCTION private.prevent_tenant_scope_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'A record cannot be reassigned to another tenant'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.prevent_profile_tenant_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
BEGIN
  IF OLD.tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'A profile cannot be reassigned after its first tenant assignment'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_tenant_scope_reassignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.prevent_profile_tenant_reassignment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.prevent_tenant_scope_reassignment() TO service_role;
GRANT EXECUTE ON FUNCTION private.prevent_profile_tenant_reassignment() TO service_role;

DROP TRIGGER IF EXISTS trg_immutable_tenant_scope ON public.profiles;
CREATE TRIGGER trg_immutable_tenant_scope
BEFORE UPDATE OF tenant_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.prevent_profile_tenant_reassignment();

COMMIT;
