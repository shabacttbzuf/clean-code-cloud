
-- 1. hired_by tracking
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS hired_by uuid;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hired_by uuid;

-- 2. user_permission_overrides
CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  permission_key TEXT NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT true,
  granted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_upo_tenant_user ON public.user_permission_overrides(tenant_id, user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permission_overrides TO authenticated;
GRANT ALL ON public.user_permission_overrides TO service_role;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

-- Helper: does _user_id have any of these roles in _tenant_id?
CREATE OR REPLACE FUNCTION public.user_has_role_in_tenant(_user_id uuid, _tenant_id uuid, _roles text[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND tenant_id = _tenant_id
      AND role::text = ANY(_roles)
  );
$$;

-- Helper: was _target hired by _actor inside _tenant_id?
CREATE OR REPLACE FUNCTION public.was_hired_by(_target uuid, _actor uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _target AND tenant_id = _tenant_id AND hired_by = _actor
  );
$$;

-- SELECT policy
DROP POLICY IF EXISTS "upo_select" ON public.user_permission_overrides;
CREATE POLICY "upo_select" ON public.user_permission_overrides
FOR SELECT TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR user_id = auth.uid()
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner'])
  OR (
    public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['manager'])
    AND public.was_hired_by(user_id, auth.uid(), tenant_id)
  )
);

-- INSERT policy
DROP POLICY IF EXISTS "upo_insert" ON public.user_permission_overrides;
CREATE POLICY "upo_insert" ON public.user_permission_overrides
FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_owner(auth.uid())
  OR (
    public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner'])
    AND NOT public.user_has_role_in_tenant(user_id, tenant_id, ARRAY['owner'])
    AND (
      public.user_has_role_in_tenant(user_id, tenant_id, ARRAY['manager'])
      OR public.was_hired_by(user_id, auth.uid(), tenant_id)
    )
  )
  OR (
    public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['manager'])
    AND public.was_hired_by(user_id, auth.uid(), tenant_id)
  )
);

-- UPDATE policy
DROP POLICY IF EXISTS "upo_update" ON public.user_permission_overrides;
CREATE POLICY "upo_update" ON public.user_permission_overrides
FOR UPDATE TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR (
    public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner'])
    AND NOT public.user_has_role_in_tenant(user_id, tenant_id, ARRAY['owner'])
    AND (
      public.user_has_role_in_tenant(user_id, tenant_id, ARRAY['manager'])
      OR public.was_hired_by(user_id, auth.uid(), tenant_id)
    )
  )
  OR (
    public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['manager'])
    AND public.was_hired_by(user_id, auth.uid(), tenant_id)
  )
);

-- DELETE policy
DROP POLICY IF EXISTS "upo_delete" ON public.user_permission_overrides;
CREATE POLICY "upo_delete" ON public.user_permission_overrides
FOR DELETE TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR (
    public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner'])
    AND NOT public.user_has_role_in_tenant(user_id, tenant_id, ARRAY['owner'])
    AND (
      public.user_has_role_in_tenant(user_id, tenant_id, ARRAY['manager'])
      OR public.was_hired_by(user_id, auth.uid(), tenant_id)
    )
  )
  OR (
    public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['manager'])
    AND public.was_hired_by(user_id, auth.uid(), tenant_id)
  )
);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_upo_updated_at ON public.user_permission_overrides;
CREATE TRIGGER trg_upo_updated_at BEFORE UPDATE ON public.user_permission_overrides
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Update has_permission() to honor overrides
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _tenant_id uuid, _permission_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_override boolean;
BEGIN
  IF public.is_super_owner(_user_id) THEN
    RETURN true;
  END IF;

  SELECT granted INTO v_override
  FROM public.user_permission_overrides
  WHERE user_id = _user_id AND tenant_id = _tenant_id AND permission_key = _permission_key
  LIMIT 1;

  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp
      ON rp.builtin_role = ur.role AND rp.role_kind = 'builtin'
     AND (rp.tenant_id = _tenant_id OR rp.tenant_id IS NULL)
    WHERE ur.user_id = _user_id AND ur.tenant_id = _tenant_id
      AND rp.permission_key = _permission_key
  );
END;
$$;
