-- Replace the purchase receiving RPC role-name gate with an explicit action permission.
-- Inventory and purchase writes remain atomic and all original validation is preserved.
BEGIN;

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
SET search_path = pg_catalog, public, pg_temp
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

  IF _branch_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.branches
     WHERE id = _branch_id AND tenant_id = _tenant_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Branch does not belong to the requested tenant or is inactive'
      USING ERRCODE = '23503';
  END IF;

  IF NOT (
    (
      public.has_permission(auth.uid(), _tenant_id, 'purchases.create')
      OR public.has_permission(auth.uid(), _tenant_id, 'purchases.manage')
    )
    AND private.can_access_branch(auth.uid(), _tenant_id, _branch_id)
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

  IF _items IS NULL OR jsonb_typeof(_items) IS DISTINCT FROM 'array'
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

COMMIT;
