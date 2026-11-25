-- Preserve the already-private privileged implementations created by the
-- baseline hardening migration. Replace their bodies with the latest permission-
-- checked implementations rather than ALTER ... SET SCHEMA (which collides when
-- the private overload already exists).
BEGIN;

GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.create_purchase_with_items(
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
SET search_path = pg_catalog, public, private, pg_temp
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

ALTER FUNCTION private.create_purchase_with_items(uuid, uuid, uuid, uuid, text, text, jsonb)
  SET search_path = pg_catalog, public, private, pg_temp;
REVOKE ALL ON FUNCTION private.create_purchase_with_items(uuid, uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.create_purchase_with_items(uuid, uuid, uuid, uuid, text, text, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_purchase_with_items(
  _tenant_id uuid, _branch_id uuid, _user_id uuid, _supplier_id uuid,
  _reference text, _notes text, _items jsonb
)
RETURNS public.purchases
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
  SELECT private.create_purchase_with_items(
    _tenant_id, _branch_id, _user_id, _supplier_id, _reference, _notes, _items
  );
$function$;
REVOKE ALL ON FUNCTION public.create_purchase_with_items(uuid, uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_with_items(uuid, uuid, uuid, uuid, text, text, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.create_purchase_return(
  _tenant_id uuid,
  _purchase_id uuid,
  _reason text,
  _items jsonb
)
RETURNS public.purchase_returns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_purchase public.purchases%ROWTYPE;
  v_line public.purchase_items%ROWTYPE;
  v_item jsonb;
  v_return public.purchase_returns%ROWTYPE;
  v_item_id uuid;
  v_qty numeric(14,3);
  v_prior_qty numeric(14,3);
  v_total numeric(12,2) := 0;
  v_line_total numeric(12,2);
  v_last_product_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF _tenant_id IS NULL OR _purchase_id IS NULL OR _reason IS NULL OR length(btrim(_reason)) NOT BETWEEN 2 AND 500 THEN
    RAISE EXCEPTION 'Invalid supplier return details' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_purchase FROM public.purchases WHERE id = _purchase_id AND tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase not found in this tenant' USING ERRCODE = 'P0002'; END IF;
  IF v_purchase.status <> 'received' THEN RAISE EXCEPTION 'Only received purchases can be returned' USING ERRCODE = '55000'; END IF;
  IF NOT (
    (
      public.has_permission(auth.uid(), _tenant_id, 'purchases.returns.create')
      OR public.has_permission(auth.uid(), _tenant_id, 'purchases.manage')
    )
    AND private.can_access_branch(auth.uid(), _tenant_id, v_purchase.branch_id)
  ) THEN RAISE EXCEPTION 'You cannot return purchases from this branch' USING ERRCODE = '42501'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 OR jsonb_array_length(_items) > 300 THEN
    RAISE EXCEPTION 'Return must contain between 1 and 300 items' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(_items))
     <> (SELECT count(DISTINCT value->>'purchase_item_id') FROM jsonb_array_elements(_items)) THEN
    RAISE EXCEPTION 'A purchase item may appear only once in a return request' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_items) ORDER BY (value->>'purchase_item_id')::uuid LOOP
    v_item_id := (v_item->>'purchase_item_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    IF v_item_id IS NULL OR v_qty IS NULL OR v_qty <= 0 OR v_qty > 999999.999 THEN
      RAISE EXCEPTION 'Invalid purchase return item or quantity' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_line FROM public.purchase_items
    WHERE id = v_item_id AND purchase_id = _purchase_id AND tenant_id = _tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Return item does not belong to this purchase' USING ERRCODE = '23503'; END IF;
    SELECT COALESCE(sum(ri.quantity),0) INTO v_prior_qty
    FROM public.purchase_return_items ri
    JOIN public.purchase_returns r ON r.id = ri.purchase_return_id
    WHERE ri.purchase_item_id = v_item_id AND r.purchase_id = _purchase_id;
    IF v_prior_qty + v_qty > v_line.quantity THEN
      RAISE EXCEPTION 'Return quantity exceeds the remaining purchased quantity for %', v_line.id USING ERRCODE = '23514';
    END IF;
    v_total := v_total + round(v_line.cost_price * v_qty, 2);
  END LOOP;

  INSERT INTO public.purchase_returns (tenant_id, purchase_id, branch_id, processed_by, total, reason)
  VALUES (_tenant_id, _purchase_id, v_purchase.branch_id, auth.uid(), round(v_total,2), btrim(_reason))
  RETURNING * INTO v_return;

  FOR v_item IN SELECT value FROM jsonb_array_elements(_items) ORDER BY (value->>'purchase_item_id')::uuid LOOP
    v_item_id := (v_item->>'purchase_item_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    SELECT * INTO v_line FROM public.purchase_items WHERE id = v_item_id AND purchase_id = _purchase_id AND tenant_id = _tenant_id;
    v_line_total := round(v_line.cost_price * v_qty, 2);

    INSERT INTO public.purchase_return_items (
      tenant_id, purchase_return_id, purchase_item_id, product_id,
      product_name, quantity, cost_price, line_total
    ) VALUES (
      _tenant_id, v_return.id, v_line.id, v_line.product_id,
      COALESCE((SELECT p.name FROM public.products p WHERE p.id=v_line.product_id), 'منتج محذوف'),
      v_qty, v_line.cost_price, v_line_total
    );

    PERFORM public.apply_stock_change(_tenant_id, v_line.product_id, v_purchase.branch_id, -v_qty);
    INSERT INTO public.inventory_transactions (
      tenant_id, product_id, branch_id, user_id, txn_type, quantity,
      reference_type, reference_id, reason
    ) VALUES (
      _tenant_id, v_line.product_id, v_purchase.branch_id, auth.uid(), 'out', -v_qty,
      'purchase_return', v_return.id, 'إرجاع بضاعة إلى المورد'
    );
  END LOOP;
  RETURN v_return;
END;
$$;

ALTER FUNCTION private.create_purchase_return(uuid, uuid, text, jsonb)
  SET search_path = pg_catalog, public, private, pg_temp;
REVOKE ALL ON FUNCTION private.create_purchase_return(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.create_purchase_return(uuid, uuid, text, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_purchase_return(
  _tenant_id uuid, _purchase_id uuid, _reason text, _items jsonb
)
RETURNS public.purchase_returns
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
  SELECT private.create_purchase_return(_tenant_id, _purchase_id, _reason, _items);
$function$;
REVOKE ALL ON FUNCTION public.create_purchase_return(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_return(uuid, uuid, text, jsonb) TO authenticated, service_role;

COMMIT;
