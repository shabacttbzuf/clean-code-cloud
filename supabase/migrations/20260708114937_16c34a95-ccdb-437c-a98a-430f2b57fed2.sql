
-- 1) Fix privilege escalation on user_roles bootstrap policy
DROP POLICY IF EXISTS "User bootstraps own owner role" ON public.user_roles;
CREATE POLICY "User bootstraps own owner role"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'::app_role
    AND EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = user_roles.tenant_id
        AND t.owner_id = auth.uid()
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.tenant_id = user_roles.tenant_id
        AND ur.role = 'owner'::app_role
        AND ur.user_id <> auth.uid()
    )
  );

-- 2) Revoke EXECUTE from PUBLIC and anon on all SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_tenant_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_branch(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_expenses(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_branch_id(uuid, uuid) FROM PUBLIC, anon;

-- Ensure authenticated retains EXECUTE (needed inside RLS policy evaluation)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_branch(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_expenses(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_branch_id(uuid, uuid) TO authenticated;

-- 3) Trigger-only functions: revoke EXECUTE from everyone except owner/service_role.
-- Triggers execute under table-owner privileges regardless of client grants.
REVOKE EXECUTE ON FUNCTION public.apply_stock_change(uuid, uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_invoice_no() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_purchase_item_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_sale_item_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
