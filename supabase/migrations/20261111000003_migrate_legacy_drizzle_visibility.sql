-- Bring the legacy Drizzle visibility migration into the Supabase
-- migration chain so clean database rebuilds do not silently omit it.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.is_tenant_member(
  _user_id uuid,
  _tenant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_roles
     WHERE user_id = _user_id
       AND tenant_id = _tenant_id
  );
$$;

REVOKE ALL ON FUNCTION private.is_tenant_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_tenant_member(uuid, uuid) FROM anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_tenant_member(uuid, uuid) TO authenticated, service_role;

ALTER TABLE public.super_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View super owners" ON public.super_owners;
CREATE POLICY "View super owners"
  ON public.super_owners
  FOR SELECT
  TO authenticated
  USING (public.is_super_owner(auth.uid()));

DROP POLICY IF EXISTS "View role permissions" ON public.role_permissions;
CREATE POLICY "View role permissions"
  ON public.role_permissions
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_owner(auth.uid())
    OR tenant_id IS NULL
    OR private.is_tenant_member(auth.uid(), tenant_id)
  );

DROP POLICY IF EXISTS "View permissions" ON public.permissions;
CREATE POLICY "View permissions"
  ON public.permissions
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_owner(auth.uid())
    OR EXISTS (
      SELECT 1
        FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.tenant_id IS NOT NULL
    )
  );

COMMIT;
