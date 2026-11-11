-- Keep role assignment and branch transfer synchronized in one transaction.
BEGIN;

CREATE OR REPLACE FUNCTION public.replace_user_role_in_tenant(
  _user_id uuid,
  _tenant_id uuid,
  _role public.app_role,
  _branch_id uuid,
  _actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM 1
    FROM public.user_roles
   WHERE user_id = _user_id
     AND tenant_id = _tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user does not belong to this tenant'
      USING ERRCODE = 'P0002';
  END IF;

  IF _branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches
     WHERE id = _branch_id AND tenant_id = _tenant_id
  ) THEN
    RAISE EXCEPTION 'Branch does not belong to the requested tenant'
      USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.user_roles
   WHERE user_id = _user_id AND tenant_id = _tenant_id;

  INSERT INTO public.user_roles (user_id, tenant_id, role, branch_id, hired_by)
  VALUES (_user_id, _tenant_id, _role, _branch_id, _actor_id);

  UPDATE public.profiles
     SET branch_id = _branch_id
   WHERE id = _user_id
     AND tenant_id = _tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_user_role_branch(
  _user_role_id uuid,
  _tenant_id uuid,
  _branch_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_user_id uuid;
  updated_profiles integer;
BEGIN
  SELECT user_id
    INTO target_user_id
    FROM public.user_roles
   WHERE id = _user_role_id
     AND tenant_id = _tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role assignment not found in the requested tenant'
      USING ERRCODE = 'P0002';
  END IF;

  IF _branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches
     WHERE id = _branch_id AND tenant_id = _tenant_id
  ) THEN
    RAISE EXCEPTION 'Branch does not belong to the requested tenant'
      USING ERRCODE = '23503';
  END IF;

  UPDATE public.user_roles
     SET branch_id = _branch_id
   WHERE id = _user_role_id
     AND tenant_id = _tenant_id;

  UPDATE public.profiles
     SET branch_id = _branch_id
   WHERE id = target_user_id
     AND tenant_id = _tenant_id;

  GET DIAGNOSTICS updated_profiles = ROW_COUNT;
  IF updated_profiles = 0 THEN
    RAISE EXCEPTION 'Target profile was not found in the requested tenant'
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_user_role_in_tenant(uuid, uuid, public.app_role, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_user_role_in_tenant(uuid, uuid, public.app_role, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.replace_user_role_in_tenant(uuid, uuid, public.app_role, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.replace_user_role_in_tenant(uuid, uuid, public.app_role, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.transfer_user_role_branch(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_user_role_branch(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.transfer_user_role_branch(uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_user_role_branch(uuid, uuid, uuid) TO service_role;

COMMIT;
