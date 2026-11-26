-- Require the granular inventory.adjust permission and branch access for manual stock changes.
-- Revoke direct client writes so every balance change creates an inventory transaction.
BEGIN;

DROP POLICY IF EXISTS "Warehouse and admins manage inventory" ON public.inventory;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.inventory FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.inventory TO service_role;

CREATE OR REPLACE FUNCTION private.adjust_inventory_balance(
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
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_current numeric(14,3);
  v_delta numeric(14,3);
BEGIN
  IF v_actor_id IS NULL THEN
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
    public.is_super_owner(v_actor_id)
    OR public.has_permission(v_actor_id, _tenant_id, 'inventory.adjust')
  ) THEN
    RAISE EXCEPTION 'Permission denied: inventory.adjust'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_super_owner(v_actor_id)
    OR private.can_access_branch(v_actor_id, _tenant_id, _branch_id)
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
  IF NOT FOUND THEN
    v_current := 0;
  END IF;

  v_delta := _target_quantity - v_current;
  IF v_delta <> 0 THEN
    PERFORM public.apply_stock_change(_tenant_id, _product_id, _branch_id, v_delta);
    INSERT INTO public.inventory_transactions (
      tenant_id, product_id, branch_id, user_id, txn_type, quantity, reason
    ) VALUES (
      _tenant_id, _product_id, _branch_id, v_actor_id, 'adjust', v_delta,
      COALESCE(NULLIF(btrim(_reason), ''), 'تعديل يدوي')
    );
  END IF;
END;
$function$;

GRANT USAGE ON SCHEMA private TO authenticated, service_role;
REVOKE ALL ON FUNCTION private.adjust_inventory_balance(uuid, uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.adjust_inventory_balance(uuid, uuid, uuid, numeric, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.adjust_inventory_balance(
  _tenant_id uuid,
  _product_id uuid,
  _branch_id uuid,
  _target_quantity numeric,
  _reason text
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
  SELECT private.adjust_inventory_balance(
    _tenant_id, _product_id, _branch_id, _target_quantity, _reason
  );
$function$;

REVOKE ALL ON FUNCTION public.adjust_inventory_balance(uuid, uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_balance(uuid, uuid, uuid, numeric, text) TO authenticated, service_role;

COMMIT;
