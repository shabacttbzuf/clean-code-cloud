-- Extend profiles table with new fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- Unique username (case-insensitive) when set
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

-- Super owner sees/edits everything
DROP POLICY IF EXISTS "super_owner_all_profiles" ON public.profiles;
CREATE POLICY "super_owner_all_profiles"
  ON public.profiles
  FOR ALL
  TO authenticated
  USING (public.is_super_owner(auth.uid()))
  WITH CHECK (public.is_super_owner(auth.uid()));

-- Tenant owner/manager: read & update profiles of users in same tenant
DROP POLICY IF EXISTS "tenant_admin_read_profiles" ON public.profiles;
CREATE POLICY "tenant_admin_read_profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.tenant_id = public.profiles.tenant_id
        AND ur.role IN ('owner','manager')
    )
  );

DROP POLICY IF EXISTS "tenant_admin_update_profiles" ON public.profiles;
CREATE POLICY "tenant_admin_update_profiles"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.tenant_id = public.profiles.tenant_id
        AND ur.role IN ('owner','manager')
    )
  )
  WITH CHECK (
    tenant_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.tenant_id = public.profiles.tenant_id
        AND ur.role IN ('owner','manager')
    )
  );

-- Function to update last_login_at (callable via RPC by authenticated user for themselves)
CREATE OR REPLACE FUNCTION public.touch_last_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET last_login_at = now() WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_last_login() TO authenticated;