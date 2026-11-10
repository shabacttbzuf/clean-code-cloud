-- Lock down custom-role permission cloning. The application invokes this
-- SECURITY DEFINER helper only through its trusted service-role server action.
BEGIN;

CREATE OR REPLACE FUNCTION public.clone_role_permissions(
  _tenant_id uuid,
  _dst_custom_role_id uuid,
  _src_builtin public.app_role DEFAULT NULL,
  _src_custom_role_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF _tenant_id IS NULL OR _dst_custom_role_id IS NULL THEN
    RAISE EXCEPTION 'Tenant and destination custom role are required'
      USING ERRCODE = '22023';
  END IF;

  IF (_src_builtin IS NULL AND _src_custom_role_id IS NULL)
     OR (_src_builtin IS NOT NULL AND _src_custom_role_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Provide exactly one permission source'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.custom_roles
     WHERE id = _dst_custom_role_id
       AND tenant_id = _tenant_id
  ) THEN
    RAISE EXCEPTION 'Destination custom role does not belong to the tenant'
      USING ERRCODE = '23503';
  END IF;

  IF _src_custom_role_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.custom_roles
     WHERE id = _src_custom_role_id
       AND tenant_id = _tenant_id
  ) THEN
    RAISE EXCEPTION 'Source custom role does not belong to the tenant'
      USING ERRCODE = '23503';
  END IF;

  IF _src_builtin IS NOT NULL THEN
    INSERT INTO public.role_permissions (
      tenant_id, role_kind, custom_role_id, permission_key
    )
    SELECT
      _tenant_id, 'custom', _dst_custom_role_id, permission_key
    FROM public.role_permissions
    WHERE role_kind = 'builtin'
      AND builtin_role = _src_builtin
      AND (tenant_id IS NULL OR tenant_id = _tenant_id)
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.role_permissions (
      tenant_id, role_kind, custom_role_id, permission_key
    )
    SELECT
      _tenant_id, 'custom', _dst_custom_role_id, permission_key
    FROM public.role_permissions
    WHERE role_kind = 'custom'
      AND custom_role_id = _src_custom_role_id
      AND tenant_id = _tenant_id
    ON CONFLICT DO NOTHING;
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.clone_role_permissions(uuid, uuid, public.app_role, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clone_role_permissions(uuid, uuid, public.app_role, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.clone_role_permissions(uuid, uuid, public.app_role, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.clone_role_permissions(uuid, uuid, public.app_role, uuid) TO service_role;

COMMIT;
