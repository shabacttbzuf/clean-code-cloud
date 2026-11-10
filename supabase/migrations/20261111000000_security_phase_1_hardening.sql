-- Security hardening phase 1.
-- Additive migration: does not rewrite or delete historical migrations.
-- Apply only after the complete existing Supabase migration chain.

BEGIN;

-- 1) A tenant owner may bootstrap their own owner role, but cannot claim
-- owner privileges in an unrelated tenant.
DROP POLICY IF EXISTS "User bootstraps own owner role" ON public.user_roles;
CREATE POLICY "Tenant owner bootstraps own owner role"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'
    AND EXISTS (
      SELECT 1
      FROM public.tenants t
      WHERE t.id = tenant_id
        AND t.owner_id = auth.uid()
    )
  );

-- 2) A profile owner may edit public profile fields only. Administrative
-- fields (tenant, branch, status, activation, approval, employment data,
-- security metadata) remain writable only by trusted server-side operations.
REVOKE UPDATE ON TABLE public.profiles FROM authenticated;
GRANT UPDATE (full_name, username, phone, avatar_url)
  ON TABLE public.profiles TO authenticated;

-- 3) Prevent a requester from approving/rejecting their own leave request,
-- even if another permissive UPDATE policy exists. Service-role workflows
-- (auth.uid() IS NULL) remain available to trusted server-side code.
CREATE OR REPLACE FUNCTION public.prevent_leave_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (
       OLD.created_by = auth.uid()
       OR EXISTS (
         SELECT 1
           FROM public.employees e
          WHERE e.id = OLD.employee_id
            AND e.user_id = auth.uid()
       )
     )
     AND (
       NEW.status IS DISTINCT FROM OLD.status
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     )
  THEN
    RAISE EXCEPTION 'لا يمكنك اعتماد أو تغيير حالة طلب الإجازة الخاص بك'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_leave_self_approval ON public.leave_requests;
CREATE TRIGGER trg_prevent_leave_self_approval
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_leave_self_approval();

-- 4) Make first-super-owner bootstrap atomic. The caller must additionally
-- be allow-listed by the server environment variable
-- INITIAL_SUPER_OWNER_USER_ID. The RPC itself is executable only by service_role.
CREATE OR REPLACE FUNCTION public.bootstrap_first_super_owner(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required' USING ERRCODE = '22004';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.super_owners.first_bootstrap'));

  IF EXISTS (SELECT 1 FROM public.super_owners LIMIT 1) THEN
    RAISE EXCEPTION 'Initial super owner has already been configured'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user_id) THEN
    RAISE EXCEPTION 'The requested auth user does not exist'
      USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.super_owners (user_id, granted_by, notes)
  VALUES (_user_id, _user_id, 'Initial super owner bootstrap');
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_first_super_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_first_super_owner(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.bootstrap_first_super_owner(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_super_owner(uuid) TO service_role;

COMMIT;
