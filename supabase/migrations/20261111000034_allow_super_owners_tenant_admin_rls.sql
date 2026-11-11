CREATE OR REPLACE FUNCTION private.is_tenant_admin(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
AS $function$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.super_owners so
      WHERE so.user_id = _user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.tenant_id = _tenant_id
        AND ur.role IN ('owner', 'manager')
    );
$function$;