-- Minimize direct client write privileges on authorization tables.
-- All supported mutations now pass through validated server actions or
-- SECURITY DEFINER transactional RPCs.
BEGIN;

REVOKE INSERT ON TABLE public.tenants FROM PUBLIC;
REVOKE INSERT ON TABLE public.tenants FROM anon;
REVOKE INSERT ON TABLE public.tenants FROM authenticated;

REVOKE INSERT ON TABLE public.profiles FROM PUBLIC;
REVOKE INSERT ON TABLE public.profiles FROM anon;
REVOKE INSERT ON TABLE public.profiles FROM authenticated;

-- The tenant's owner_id is a security boundary for first-owner onboarding.
-- Ownership transfer must be implemented as an explicit audited server flow.
CREATE OR REPLACE FUNCTION public.prevent_tenant_owner_id_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'Tenant ownership cannot be changed through a direct client update'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_tenant_owner_id_change ON public.tenants;
CREATE TRIGGER trg_prevent_tenant_owner_id_change
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tenant_owner_id_change();

REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_roles FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_roles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_roles FROM authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.custom_roles FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.custom_roles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.custom_roles FROM authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.role_permissions FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.role_permissions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.role_permissions FROM authenticated;

COMMIT;
