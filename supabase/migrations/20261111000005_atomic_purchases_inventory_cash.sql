-- Atomic purchase receiving, inventory adjustments, and cash-session closing.
BEGIN;

-- Centralize stock writes and enforce product/branch tenant consistency.
CREATE OR REPLACE FUNCTION public.apply_stock_change(
  _tenant_id uuid,
  _product_id uuid,
  _branch_id uuid,
  _delta numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM 1
    FROM public.products
   WHERE id = _product_id
     AND tenant_id = _tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product does not belong to the requested tenant'
      USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.branches
     WHERE id = _branch_id AND tenant_id = _tenant_id
  ) THEN
    RAISE EXCEPTION 'Branch does not belong to the requested tenant'
      USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.inventory (tenant_id, product_id, branch_id, quantity, updated_at)
  VALUES (_tenant_id, _product_id, _branch_id, _delta, now())
  ON CONFLICT (product_id, branch_id) DO UPDATE
    SET quantity = public.inventory.quantity + EXCLUDED.quantity,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.create_purchase_with_items(
  _tenant_id uuid,
  _branch_id uuid,
  _user_id uuid,
  _supplier_id uuid,
  _reference text,
  _notes text,
  _items jsonb
)
RETURNS public.purchases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(14,3);
  v_cost_price numeric(12,2);
  v_line_total numeric(12,2);
  v_total numeric(12,2) := 0;
  v_purchase public.purchases%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'Authenticated purchaser identity mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (
    private.is_tenant_admin(auth.uid(), _tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = auth.uid()
         AND tenant_id = _tenant_id
         AND role = 'warehouse'
         AND (branch_id IS NULL OR branch_id = _branch_id)
    )
  )
  THEN
    RAISE EXCEPTION 'You cannot receive purchases in this branch'
      USING ERRCODE = '42501';
  END IF;

  IF _supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers
     WHERE id = _supplier_id AND tenant_id = _tenant_id
  ) THEN
    RAISE EXCEPTION 'Supplier does not belong to the requested tenant'
      USING ERRCODE = '23503';
  END IF;

  IF jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) = 0
     OR jsonb_array_length(_items) > 300 THEN
    RAISE EXCEPTION 'Purchase must contain between 1 and 300 items'
      USING ERRCODE = '22023';
  END IF;

  -- Validate all products and calculate the total server-side.
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(_items)
     ORDER BY (value->>'product_id')::uuid
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_cost_price := (v_item->>'cost_price')::numeric;

    IF v_quantity IS NULL OR v_quantity <= 0 OR v_quantity > 999999.999
       OR v_cost_price IS NULL OR v_cost_price < 0
    THEN
      RAISE EXCEPTION 'Invalid purchase quantity or cost price'
        USING ERRCODE = '22023';
    END IF;

    PERFORM 1
      FROM public.products
     WHERE id = v_product_id
       AND tenant_id = _tenant_id
       AND is_active = true
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Purchase product is unavailable or belongs to another tenant'
        USING ERRCODE = '23503';
    END IF;

    v_line_total := round(v_quantity * v_cost_price, 2);
    v_total := v_total + v_line_total;
  END LOOP;

  INSERT INTO public.purchases (
    tenant_id, branch_id, supplier_id, user_id,
    reference, notes, total, status
  )
  VALUES (
    _tenant_id, _branch_id, _supplier_id, _user_id,
    NULLIF(btrim(_reference), ''), NULLIF(btrim(_notes), ''),
    round(v_total, 2), 'received'
  )
  RETURNING * INTO v_purchase;

  -- Existing purchase-item trigger updates inventory and records the stock
  -- transaction in this same database transaction.
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(_items)
     ORDER BY (value->>'product_id')::uuid
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_cost_price := (v_item->>'cost_price')::numeric;

    INSERT INTO public.purchase_items (
      tenant_id, purchase_id, product_id, quantity, cost_price, line_total
    )
    VALUES (
      _tenant_id, v_purchase.id, v_product_id, v_quantity, v_cost_price,
      round(v_quantity * v_cost_price, 2)
    );
  END LOOP;

  RETURN v_purchase;
END;
$$;

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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current numeric(14,3);
  v_delta numeric(14,3);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF _target_quantity IS NULL OR _target_quantity < 0 OR _target_quantity > 999999999
  THEN
    RAISE EXCEPTION 'Target inventory quantity is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    private.is_tenant_admin(auth.uid(), _tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = auth.uid()
         AND tenant_id = _tenant_id
         AND role = 'warehouse'
         AND (branch_id IS NULL OR branch_id = _branch_id)
    )
  )
  THEN
    RAISE EXCEPTION 'You cannot adjust inventory in this branch'
      USING ERRCODE = '42501';
  END IF;

  -- Lock the product row to serialize manual adjustments with stock triggers.
  PERFORM 1
    FROM public.products
   WHERE id = _product_id
     AND tenant_id = _tenant_id
     AND is_active = true
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product does not belong to the requested tenant'
      USING ERRCODE = '23503';
  END IF;

  SELECT quantity
    INTO v_current
    FROM public.inventory
   WHERE tenant_id = _tenant_id
     AND product_id = _product_id
     AND branch_id = _branch_id
   FOR UPDATE;

  IF NOT FOUND THEN
    v_current := 0;
  END IF;

  v_delta := _target_quantity - v_current;

  IF v_delta <> 0 THEN
    PERFORM public.apply_stock_change(_tenant_id, _product_id, _branch_id, v_delta);

    INSERT INTO public.inventory_transactions (
      tenant_id, product_id, branch_id, user_id,
      txn_type, quantity, reason
    )
    VALUES (
      _tenant_id, _product_id, _branch_id, auth.uid(),
      'adjust', v_delta, COALESCE(NULLIF(btrim(_reason), ''), 'تعديل يدوي')
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_cash_session(
  _session_id uuid,
  _closing_balance numeric
)
RETURNS public.cash_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.cash_sessions%ROWTYPE;
  v_expected numeric(12,2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF _closing_balance IS NULL OR _closing_balance < 0 THEN
    RAISE EXCEPTION 'Closing balance must be zero or greater'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_session
    FROM public.cash_sessions
   WHERE id = _session_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cash session not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'Cash session is already closed'
      USING ERRCODE = '55000';
  END IF;

  IF auth.uid() <> v_session.cashier_id
     AND NOT private.is_tenant_admin(auth.uid(), v_session.tenant_id)
  THEN
    RAISE EXCEPTION 'You cannot close this cashier session'
      USING ERRCODE = '42501';
  END IF;

  SELECT round(
    v_session.opening_balance
    + COALESCE(sum(p.amount), 0),
    2
  )
    INTO v_expected
    FROM public.payments p
    JOIN public.sales s ON s.id = p.sale_id
   WHERE s.session_id = v_session.id
     AND s.tenant_id = v_session.tenant_id
     AND s.status = 'completed'
     AND p.method = 'cash';

  UPDATE public.cash_sessions
     SET status = 'closed',
         closing_balance = _closing_balance,
         expected_cash = v_expected,
         cash_difference = round(_closing_balance - v_expected, 2),
         closed_at = now(),
         updated_at = now()
   WHERE id = v_session.id
   RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;

REVOKE ALL ON FUNCTION public.create_purchase_with_items(uuid, uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_purchase_with_items(uuid, uuid, uuid, uuid, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.create_purchase_with_items(uuid, uuid, uuid, uuid, text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_with_items(uuid, uuid, uuid, uuid, text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.adjust_inventory_balance(uuid, uuid, uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adjust_inventory_balance(uuid, uuid, uuid, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.adjust_inventory_balance(uuid, uuid, uuid, numeric, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_balance(uuid, uuid, uuid, numeric, text) TO authenticated;

REVOKE ALL ON FUNCTION public.close_cash_session(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_cash_session(uuid, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.close_cash_session(uuid, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_session(uuid, numeric) TO authenticated;

COMMIT;
