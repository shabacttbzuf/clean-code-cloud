-- Prevent negative stock from being created when a product has no inventory row.
-- Existing negative balances are preserved for physical reconciliation; NOT VALID
-- enforces the constraint for every new or updated row without rewriting history.

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_quantity_nonnegative'
      AND conrelid = 'public.inventory'::regclass
  ) THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT inventory_quantity_nonnegative
      CHECK (quantity >= 0 AND quantity <> 'NaN'::numeric) NOT VALID;
  END IF;
END
$migration$;

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
  v_current_quantity numeric(14,3);
BEGIN
  IF _tenant_id IS NULL OR _product_id IS NULL OR _branch_id IS NULL OR _delta IS NULL
     OR _delta = 'NaN'::numeric OR abs(_delta) > 999999999 THEN
    RAISE EXCEPTION 'Invalid stock change request' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
  FROM public.products
  WHERE id = _product_id AND tenant_id = _tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product does not belong to the requested tenant' USING ERRCODE = '23503';
  END IF;

  PERFORM 1
  FROM public.branches
  WHERE id = _branch_id AND tenant_id = _tenant_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Branch does not belong to the requested tenant' USING ERRCODE = '23503';
  END IF;

  IF _delta < 0 THEN
    SELECT quantity
    INTO v_current_quantity
    FROM public.inventory
    WHERE tenant_id = _tenant_id
      AND product_id = _product_id
      AND branch_id = _branch_id
    FOR UPDATE;

    IF NOT FOUND OR v_current_quantity + _delta < 0 THEN
      RAISE EXCEPTION 'Insufficient stock or inventory record missing' USING ERRCODE = '23514';
    END IF;
  END IF;

  INSERT INTO public.inventory (tenant_id, product_id, branch_id, quantity, updated_at)
  VALUES (_tenant_id, _product_id, _branch_id, _delta, now())
  ON CONFLICT (product_id, branch_id) DO UPDATE
    SET quantity = public.inventory.quantity + EXCLUDED.quantity,
        updated_at = now()
    WHERE public.inventory.tenant_id = EXCLUDED.tenant_id
      AND public.inventory.quantity + EXCLUDED.quantity >= 0;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Insufficient stock or inventory tenant mismatch' USING ERRCODE = '23514';
  END IF;
END;
$function$;
