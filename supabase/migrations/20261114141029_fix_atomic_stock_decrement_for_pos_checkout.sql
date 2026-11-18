-- Fix POS checkout stock decrement with the nonnegative inventory constraint.
-- Negative deltas must UPDATE the existing row directly: INSERT ... ON CONFLICT
-- evaluates CHECK constraints on the proposed row before conflict resolution.
CREATE OR REPLACE FUNCTION public.apply_stock_change(
  _tenant_id uuid,
  _product_id uuid,
  _branch_id uuid,
  _delta numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_rows integer;
BEGIN
  IF _tenant_id IS NULL OR _product_id IS NULL OR _branch_id IS NULL
     OR _delta IS NULL OR _delta = 'NaN'::numeric
     OR abs(_delta) > 999999999 THEN
    RAISE EXCEPTION 'Invalid stock change request' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.products
   WHERE id = _product_id AND tenant_id = _tenant_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product does not belong to the requested tenant' USING ERRCODE = '23503';
  END IF;

  PERFORM 1 FROM public.branches
   WHERE id = _branch_id AND tenant_id = _tenant_id
   FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Branch does not belong to the requested tenant' USING ERRCODE = '23503';
  END IF;

  IF _delta < 0 THEN
    UPDATE public.inventory
       SET quantity = quantity + _delta,
           updated_at = now()
     WHERE tenant_id = _tenant_id
       AND product_id = _product_id
       AND branch_id = _branch_id
       AND quantity + _delta >= 0;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'Insufficient stock or inventory record missing'
        USING ERRCODE = '23514';
    END IF;
    RETURN;
  END IF;

  INSERT INTO public.inventory (tenant_id, product_id, branch_id, quantity, updated_at)
  VALUES (_tenant_id, _product_id, _branch_id, _delta, now())
  ON CONFLICT (product_id, branch_id) DO UPDATE
    SET quantity = public.inventory.quantity + EXCLUDED.quantity,
        updated_at = now()
    WHERE public.inventory.tenant_id = EXCLUDED.tenant_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Inventory tenant mismatch' USING ERRCODE = '23514';
  END IF;
END;
$function$;
