-- Direct Data API writes to permission overrides must enforce the same
-- authority checks as the validated setUserPermission server action.
-- Existing permissive and company-scope policies remain in place; these
-- restrictive gates are ANDed with them and cannot widen access.
BEGIN;

DROP POLICY IF EXISTS permission_gate_user_permission_overrides_insert
  ON public.user_permission_overrides;
CREATE POLICY permission_gate_user_permission_overrides_insert
ON public.user_permission_overrides
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  user_id <> (select auth.uid())
  AND granted_by = (select auth.uid())
  AND NOT private.is_super_owner_target((select auth.uid()), user_id)
  AND (
    public.is_super_owner((select auth.uid()))
    OR (
      public.has_permission((select auth.uid()), tenant_id, 'permissions.manage')
      AND public.has_permission((select auth.uid()), tenant_id, permission_key)
      AND (
        EXISTS (
          SELECT 1
          FROM public.user_roles actor_role
          WHERE actor_role.user_id = (select auth.uid())
            AND actor_role.tenant_id = user_permission_overrides.tenant_id
            AND actor_role.role = 'owner'
            AND actor_role.company_id IS NULL
            AND actor_role.branch_id IS NULL
        )
        OR NOT public.user_has_role_in_tenant(
          user_id, tenant_id, ARRAY['owner','manager']
        )
      )
    )
  )
);

DROP POLICY IF EXISTS permission_gate_user_permission_overrides_update
  ON public.user_permission_overrides;
CREATE POLICY permission_gate_user_permission_overrides_update
ON public.user_permission_overrides
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  user_id <> (select auth.uid())
  AND NOT private.is_super_owner_target((select auth.uid()), user_id)
  AND (
    public.is_super_owner((select auth.uid()))
    OR (
      public.has_permission((select auth.uid()), tenant_id, 'permissions.manage')
      AND public.has_permission((select auth.uid()), tenant_id, permission_key)
      AND (
        EXISTS (
          SELECT 1
          FROM public.user_roles actor_role
          WHERE actor_role.user_id = (select auth.uid())
            AND actor_role.tenant_id = user_permission_overrides.tenant_id
            AND actor_role.role = 'owner'
            AND actor_role.company_id IS NULL
            AND actor_role.branch_id IS NULL
        )
        OR NOT public.user_has_role_in_tenant(
          user_id, tenant_id, ARRAY['owner','manager']
        )
      )
    )
  )
)
WITH CHECK (
  user_id <> (select auth.uid())
  AND granted_by = (select auth.uid())
  AND NOT private.is_super_owner_target((select auth.uid()), user_id)
  AND (
    public.is_super_owner((select auth.uid()))
    OR (
      public.has_permission((select auth.uid()), tenant_id, 'permissions.manage')
      AND public.has_permission((select auth.uid()), tenant_id, permission_key)
      AND (
        EXISTS (
          SELECT 1
          FROM public.user_roles actor_role
          WHERE actor_role.user_id = (select auth.uid())
            AND actor_role.tenant_id = user_permission_overrides.tenant_id
            AND actor_role.role = 'owner'
            AND actor_role.company_id IS NULL
            AND actor_role.branch_id IS NULL
        )
        OR NOT public.user_has_role_in_tenant(
          user_id, tenant_id, ARRAY['owner','manager']
        )
      )
    )
  )
);

DROP POLICY IF EXISTS permission_gate_user_permission_overrides_delete
  ON public.user_permission_overrides;
CREATE POLICY permission_gate_user_permission_overrides_delete
ON public.user_permission_overrides
AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  user_id <> (select auth.uid())
  AND NOT private.is_super_owner_target((select auth.uid()), user_id)
  AND (
    public.is_super_owner((select auth.uid()))
    OR (
      public.has_permission((select auth.uid()), tenant_id, 'permissions.manage')
      AND public.has_permission((select auth.uid()), tenant_id, permission_key)
      AND (
        EXISTS (
          SELECT 1
          FROM public.user_roles actor_role
          WHERE actor_role.user_id = (select auth.uid())
            AND actor_role.tenant_id = user_permission_overrides.tenant_id
            AND actor_role.role = 'owner'
            AND actor_role.company_id IS NULL
            AND actor_role.branch_id IS NULL
        )
        OR NOT public.user_has_role_in_tenant(
          user_id, tenant_id, ARRAY['owner','manager']
        )
      )
    )
  )
);

COMMIT;
