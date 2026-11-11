-- Preserve product acquisition cost at the moment of sale.
-- Historical rows remain NULL: their original cost cannot be reconstructed reliably.
BEGIN;

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS cost_price_snapshot numeric(12,2);

COMMENT ON COLUMN public.sale_items.cost_price_snapshot IS
  'Product cost captured at checkout. NULL means historical cost is unknown; never backfill from current product cost.';

CREATE OR REPLACE FUNCTION public.create_sale_with_items(
  _tenant_id uuid,
  _branch_id uuid,
  _cashier_id uuid,
  _session_id uuid,
  _discount numeric,
  _payment_method public.payment_method,
  _items jsonb
)
RETURNS public.sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE
  v_tax_rate numeric(5,2);
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2);
  v_taxable numeric(12,2);
  v_tax_amount numeric(12,2);
  v_total numeric(12,2);
  v_item jsonb;
  v_product public.products%ROWTYPE;
  v_product_id uuid;
  v_quantity numeric(12,3);
  v_sale public.sales%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _cashier_id THEN
    RAISE EXCEPTION 'Authenticated cashier identity mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF NOT private.can_access_branch(auth.uid(), _tenant_id, _branch_id) THEN
    RAISE EXCEPTION 'You cannot create sales in this branch'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.cash_sessions cs
     WHERE cs.id = _session_id
       AND cs.tenant_id = _tenant_id
       AND cs.branch_id = _branch_id
       AND cs.cashier_id = _cashier_id
       AND cs.status = 'open'
  ) THEN
    RAISE EXCEPTION 'An open cashier session for this branch is required'
      USING ERRCODE = '55000';
  END IF;

  IF jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) = 0
     OR jsonb_array_length(_items) > 300 THEN
    RAISE EXCEPTION 'Sale must contain between 1 and 300 items'
      USING ERRCODE = '22023';
  END IF;

  SELECT tax_rate
    INTO v_tax_rate
    FROM public.tenants
   WHERE id = _tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Lock products in a stable order and derive prices/costs from trusted rows.
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(_items)
     ORDER BY (value->>'product_id')::uuid
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;

    IF v_quantity IS NULL OR v_quantity <= 0 OR v_quantity > 999999.999 THEN
      RAISE EXCEPTION 'Invalid item quantity'
        USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO v_product
      FROM public.products
     WHERE id = v_product_id
       AND tenant_id = _tenant_id
       AND is_active = true
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product is unavailable or belongs to another tenant'
        USING ERRCODE = '23503';
    END IF;

    IF v_product.cost_price < 0 OR v_product.sale_price < 0 THEN
      RAISE EXCEPTION 'Product prices cannot be negative'
        USING ERRCODE = '22023';
    END IF;

    v_subtotal := v_subtotal + round(v_product.sale_price * v_quantity, 2);
  END LOOP;

  v_discount := COALESCE(_discount, 0);
  IF v_discount < 0 OR v_discount > v_subtotal THEN
    RAISE EXCEPTION 'Discount must be between zero and the subtotal'
      USING ERRCODE = '22023';
  END IF;

  v_taxable := greatest(v_subtotal - v_discount, 0);
  v_tax_amount := round(v_taxable * (v_tax_rate / 100), 2);
  v_total := round(v_taxable + v_tax_amount, 2);

  INSERT INTO public.sales (
    tenant_id, branch_id, cashier_id, session_id, invoice_no,
    subtotal, discount, tax_amount, total, payment_method
  )
  VALUES (
    _tenant_id, _branch_id, _cashier_id, _session_id, 0,
    v_subtotal, v_discount, v_tax_amount, v_total, _payment_method
  )
  RETURNING * INTO v_sale;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(_items)
     ORDER BY (value->>'product_id')::uuid
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;

    SELECT *
      INTO v_product
      FROM public.products
     WHERE id = v_product_id
       AND tenant_id = _tenant_id
       AND is_active = true
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product became unavailable during checkout'
        USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.sale_items (
      tenant_id, sale_id, product_id, product_name,
      quantity, unit_price, tax_rate, line_total, cost_price_snapshot
    )
    VALUES (
      _tenant_id, v_sale.id, v_product.id, v_product.name,
      v_quantity, v_product.sale_price, v_tax_rate,
      round(v_product.sale_price * v_quantity, 2),
      v_product.cost_price
    );
  END LOOP;

  INSERT INTO public.payments(tenant_id, sale_id, method, amount)
  VALUES (_tenant_id, v_sale.id, _payment_method, v_total);

  RETURN v_sale;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sale_with_items(
  uuid, uuid, uuid, uuid, numeric, public.payment_method, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sale_with_items(
  uuid, uuid, uuid, uuid, numeric, public.payment_method, jsonb
) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.sales_profitability
WITH (security_invoker = true)
AS
SELECT
  s.id AS sale_id,
  s.tenant_id,
  s.branch_id,
  s.invoice_no,
  s.created_at,
  s.status,
  s.subtotal,
  s.discount,
  (s.subtotal - s.discount) AS net_revenue_before_tax,
  CASE
    WHEN count(si.id) = 0 THEN NULL
    WHEN count(*) FILTER (WHERE si.cost_price_snapshot IS NULL) > 0 THEN NULL
    ELSE sum(si.cost_price_snapshot * si.quantity)
  END AS cost_of_goods_sold,
  CASE
    WHEN count(si.id) = 0 THEN NULL
    WHEN count(*) FILTER (WHERE si.cost_price_snapshot IS NULL) > 0 THEN NULL
    ELSE (s.subtotal - s.discount) - sum(si.cost_price_snapshot * si.quantity)
  END AS gross_profit,
  count(*) FILTER (WHERE si.cost_price_snapshot IS NULL) AS items_with_unknown_cost
FROM public.sales s
LEFT JOIN public.sale_items si
  ON si.sale_id = s.id AND si.tenant_id = s.tenant_id
WHERE s.status = 'completed'
GROUP BY s.id;

COMMENT ON VIEW public.sales_profitability IS
  'Completed-sale gross profitability before operating expenses and tax. Historical rows with unknown item cost return NULL COGS/profit.';

GRANT SELECT ON public.sales_profitability TO authenticated, service_role;

COMMIT;
