-- Final SECURITY DEFINER search-path hardening and strict warehouse branch scope.
BEGIN;

CREATE OR REPLACE FUNCTION public.adjust_inventory_balance(
  _tenant_id uuid,
  _product_id uuid,
  _branch_id uuid,
  _target_quantity numeric,
  _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_current numeric(14,3);
  v_delta numeric(14,3);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF _tenant_id IS NULL OR _product_id IS NULL OR _branch_id IS NULL
     OR _target_quantity IS NULL OR _target_quantity < 0
     OR _target_quantity > 999999999 OR _target_quantity = 'NaN'::numeric THEN
    RAISE EXCEPTION 'Target inventory quantity is invalid' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.branches
    WHERE id = _branch_id AND tenant_id = _tenant_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Branch does not belong to the requested tenant or is inactive'
      USING ERRCODE = '23503';
  END IF;

  IF NOT (
    private.is_tenant_admin(auth.uid(), _tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND tenant_id = _tenant_id
        AND role = 'warehouse'
        AND branch_id = _branch_id
    )
  ) THEN
    RAISE EXCEPTION 'You cannot adjust inventory in this branch'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.products
  WHERE id = _product_id AND tenant_id = _tenant_id AND is_active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product does not belong to the requested tenant or is inactive'
      USING ERRCODE = '23503';
  END IF;

  SELECT quantity INTO v_current
  FROM public.inventory
  WHERE tenant_id = _tenant_id AND product_id = _product_id AND branch_id = _branch_id
  FOR UPDATE;
  IF NOT FOUND THEN v_current := 0; END IF;

  v_delta := _target_quantity - v_current;
  IF v_delta <> 0 THEN
    PERFORM public.apply_stock_change(_tenant_id, _product_id, _branch_id, v_delta);
    INSERT INTO public.inventory_transactions (
      tenant_id, product_id, branch_id, user_id, txn_type, quantity, reason
    ) VALUES (
      _tenant_id, _product_id, _branch_id, auth.uid(), 'adjust', v_delta,
      COALESCE(NULLIF(btrim(_reason), ''), 'تعديل يدوي')
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_inventory_balance(uuid, uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_balance(uuid, uuid, uuid, numeric, text) TO authenticated, service_role;

-- Pin pg_catalog first for every remaining SECURITY DEFINER entry point.
ALTER FUNCTION public.assign_invoice_no() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.bootstrap_first_super_owner(uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.clone_role_permissions(uuid, uuid, public.app_role, uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.create_tenant_with_owner(text, text, numeric) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.handle_new_user() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.log_audit_change() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.on_purchase_item_insert() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.on_sale_item_insert() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.prevent_leave_self_approval() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.reject_payroll_run(uuid, uuid, text, uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.replace_user_role_in_tenant(uuid, uuid, public.app_role, uuid, uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.touch_last_login() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.transfer_user_role_branch(uuid, uuid, uuid) SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION private.can_access_branch(uuid, uuid, uuid) SET search_path = pg_catalog, public, private, pg_temp;
ALTER FUNCTION private.has_role(uuid, uuid, public.app_role) SET search_path = pg_catalog, public, private, pg_temp;
ALTER FUNCTION private.is_tenant_admin(uuid, uuid) SET search_path = pg_catalog, public, private, pg_temp;
ALTER FUNCTION private.is_tenant_member(uuid, uuid) SET search_path = pg_catalog, public, private, pg_temp;

COMMIT;
