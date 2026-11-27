-- Preserve existing settings-based uploads while allowing the dedicated ads permission.
BEGIN;

CREATE OR REPLACE FUNCTION private.can_manage_company_assets(
  _actor_id uuid,
  _tenant_id uuid,
  _company_id uuid,
  _asset_folder text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
  SELECT _actor_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.companies c
        ON c.id = _company_id
       AND c.tenant_id = _tenant_id
      WHERE ur.user_id = _actor_id
        AND ur.tenant_id = _tenant_id
        AND ur.company_id = _company_id
        AND ur.role IN ('owner', 'manager')
    )
    AND CASE _asset_folder
      WHEN 'branding' THEN public.has_permission(_actor_id, _tenant_id, 'settings.manage')
      WHEN 'marketing' THEN (
        public.has_permission(_actor_id, _tenant_id, 'settings.manage')
        OR public.has_permission(_actor_id, _tenant_id, 'ads.manage')
      )
      WHEN 'products' THEN public.has_permission(_actor_id, _tenant_id, 'products.manage')
      WHEN 'branches' THEN public.has_permission(_actor_id, _tenant_id, 'branches.manage')
      WHEN 'categories' THEN public.has_permission(_actor_id, _tenant_id, 'categories.manage')
      WHEN 'avatars' THEN public.has_permission(_actor_id, _tenant_id, 'hr.employees.manage')
      ELSE false
    END;
$function$;

REVOKE ALL ON FUNCTION private.can_manage_company_assets(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_manage_company_assets(uuid, uuid, uuid, text) TO authenticated, service_role;

COMMIT;
