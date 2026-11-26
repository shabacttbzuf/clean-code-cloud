-- Direct Data API writes to permission overrides must enforce the same
-- authority checks as the validated setUserPermission server action.
-- These restrictive policies are ANDed with existing role/tenant policies.
BEGIN;

CREATE OR REPLACE FUNCTION private.can_manage_permission_override_target(
  _tenant_id uuid,
  _target_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
  SELECT
    (select auth.uid()) IS NOT NULL
    AND _tenant_id IS NOT NULL
    AND _target_user_id IS NOT NULL
    AND _target_user_id <> (select auth.uid())
    AND NOT private.is_super_owner_target((select auth.uid()), _target_user_id)
    AND EXISTS (
      SELECT 1
      FROM public.user_roles target_role
      WHERE target_role.user_id = _target_user_id
        AND target_role.tenant_id = _tenant_id
    )
    AND (
      public.is_super_owner((select auth.uid()))
      OR (
        -- A tenant-wide owner is the only tenant role that may manage
        -- managers or users outside a specific company/branch.
        EXISTS (
          SELECT 1
          FROM public.user_roles actor_role
          WHERE actor_role.user_id = (select auth.uid())
            AND actor_role.tenant_id = _tenant_id
            AND actor_role.role = 'owner'
            AND actor_role.company_id IS NULL
            AND actor_role.branch_id IS NULL
        )
        OR (
          NOT private.user_has_role_in_tenant(
            _target_user_id, _tenant_id, ARRAY['owner','manager']
          )
          -- Every target membership must match one complete actor scope tuple.
          AND NOT EXISTS (
            SELECT 1
            FROM public.user_roles target_role
            WHERE target_role.user_id = _target_user_id
              AND target_role.tenant_id = _tenant_id
              AND NOT EXISTS (
                SELECT 1
                FROM public.user_roles actor_role
                WHERE actor_role.user_id = (select auth.uid())
                  AND actor_role.tenant_id = _tenant_id
                  AND actor_role.role IN ('owner','manager')
                  AND (
                    (
                      actor_role.company_id IS NOT NULL
                      AND target_role.company_id = actor_role.company_id
                      AND (
                        actor_role.branch_id IS NULL
                        OR target_role.branch_id = actor_role.branch_id
                      )
                    )
                    OR (
                      actor_role.company_id IS NULL
                      AND actor_role.branch_id IS NOT NULL
                      AND target_role.branch_id = actor_role.branch_id
                    )
                  )
              )
          )
          -- Managers may manage only the employees they hired.
          AND private.can_access_creator_company(_tenant_id, _target_user_id)
          AND (
            NOT EXISTS (
              SELECT 1
              FROM public.user_roles actor_role
              WHERE actor_role.user_id = (select auth.uid())
                AND actor_role.tenant_id = _tenant_id
                AND actor_role.role = 'manager'
            )
            OR NOT EXISTS (
              SELECT 1
              FROM public.user_roles target_role
              WHERE target_role.user_id = _target_user_id
                AND target_role.tenant_id = _tenant_id
                AND target_role.hired_by IS DISTINCT FROM (select auth.uid())
            )
          )
        )
      )
    );
$function$;

REVOKE ALL ON FUNCTION private.can_manage_permission_override_target(uuid,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_manage_permission_override_target(uuid,uuid)
  TO authenticated, service_role;

-- Replace the earlier company-only UPO boundary with a complete
-- company+branch membership-tuple check. This remains restrictive.
DROP POLICY IF EXISTS company_scope_user_permission_overrides_insert
  ON public.user_permission_overrides;
CREATE POLICY company_scope_user_permission_overrides_insert
ON public.user_permission_overrides
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  private.can_manage_permission_override_target(tenant_id, user_id)
);

DROP POLICY IF EXISTS company_scope_user_permission_overrides_update
  ON public.user_permission_overrides;
CREATE POLICY company_scope_user_permission_overrides_update
ON public.user_permission_overrides
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  private.can_manage_permission_override_target(tenant_id, user_id)
)
WITH CHECK (
  private.can_manage_permission_override_target(tenant_id, user_id)
);

DROP POLICY IF EXISTS company_scope_user_permission_overrides_delete
  ON public.user_permission_overrides;
CREATE POLICY company_scope_user_permission_overrides_delete
ON public.user_permission_overrides
AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  private.can_manage_permission_override_target(tenant_id, user_id)
);

DROP POLICY IF EXISTS permission_gate_user_permission_overrides_insert
  ON public.user_permission_overrides;
CREATE POLICY permission_gate_user_permission_overrides_insert
ON public.user_permission_overrides
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  granted_by = (select auth.uid())
  AND (
    public.is_super_owner((select auth.uid()))
    OR (
      public.has_permission((select auth.uid()), tenant_id, 'permissions.manage')
      AND public.has_permission((select auth.uid()), tenant_id, permission_key)
    )
  )
);

DROP POLICY IF EXISTS permission_gate_user_permission_overrides_update
  ON public.user_permission_overrides;
CREATE POLICY permission_gate_user_permission_overrides_update
ON public.user_permission_overrides
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  public.is_super_owner((select auth.uid()))
  OR (
    public.has_permission((select auth.uid()), tenant_id, 'permissions.manage')
    AND public.has_permission((select auth.uid()), tenant_id, permission_key)
  )
)
WITH CHECK (
  granted_by = (select auth.uid())
  AND (
    public.is_super_owner((select auth.uid()))
    OR (
      public.has_permission((select auth.uid()), tenant_id, 'permissions.manage')
      AND public.has_permission((select auth.uid()), tenant_id, permission_key)
    )
  )
);

DROP POLICY IF EXISTS permission_gate_user_permission_overrides_delete
  ON public.user_permission_overrides;
CREATE POLICY permission_gate_user_permission_overrides_delete
ON public.user_permission_overrides
AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  public.is_super_owner((select auth.uid()))
  OR (
    public.has_permission((select auth.uid()), tenant_id, 'permissions.manage')
    AND public.has_permission((select auth.uid()), tenant_id, permission_key)
  )
);

COMMIT;
