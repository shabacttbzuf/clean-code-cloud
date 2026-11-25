-- Use a dedicated return permission while retaining the legacy manage grant.
-- Inventory reversal and return ledger writes remain atomic and unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_purchase_return(
  _tenant_id uuid,
  _purchase_id uuid,
  _reason text,
  _items jsonb
)
RETURNS public.purchase_returns
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
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

COMMIT;
