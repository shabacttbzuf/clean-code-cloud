-- Auditable sale refunds and supplier returns. Never delete financial source rows.
BEGIN;

CREATE TABLE public.sale_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  cash_session_id uuid NULL REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
  processed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  refund_method public.payment_method NOT NULL,
  subtotal numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  tax_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total numeric(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 2 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sale_refund_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  refund_id uuid NOT NULL REFERENCES public.sale_refunds(id) ON DELETE RESTRICT,
  sale_item_id uuid NOT NULL REFERENCES public.sale_items(id) ON DELETE RESTRICT,
  product_id uuid NULL REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  cost_price_snapshot numeric(12,2) NULL,
  subtotal_amount numeric(12,2) NOT NULL CHECK (subtotal_amount >= 0),
  discount_amount numeric(12,2) NOT NULL CHECK (discount_amount >= 0),
  tax_amount numeric(12,2) NOT NULL CHECK (tax_amount >= 0),
  total_amount numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  restocked boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.purchase_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  processed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  total numeric(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 2 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.purchase_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  purchase_return_id uuid NOT NULL REFERENCES public.purchase_returns(id) ON DELETE RESTRICT,
  purchase_item_id uuid NOT NULL REFERENCES public.purchase_items(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  cost_price numeric(12,2) NOT NULL CHECK (cost_price >= 0),
  line_total numeric(12,2) NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sale_refunds_tenant_created ON public.sale_refunds(tenant_id, created_at DESC);
CREATE INDEX idx_sale_refunds_sale ON public.sale_refunds(sale_id, created_at DESC);
CREATE INDEX idx_sale_refunds_cash_session ON public.sale_refunds(cash_session_id) WHERE cash_session_id IS NOT NULL;
CREATE INDEX idx_sale_refund_items_refund ON public.sale_refund_items(refund_id);
CREATE INDEX idx_sale_refund_items_sale_item ON public.sale_refund_items(sale_item_id);
CREATE INDEX idx_purchase_returns_tenant_created ON public.purchase_returns(tenant_id, created_at DESC);
CREATE INDEX idx_purchase_returns_purchase ON public.purchase_returns(purchase_id, created_at DESC);
CREATE INDEX idx_purchase_return_items_return ON public.purchase_return_items(purchase_return_id);
CREATE INDEX idx_purchase_return_items_purchase_item ON public.purchase_return_items(purchase_item_id);

ALTER TABLE public.sale_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_refund_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view refunds in accessible branches"
ON public.sale_refunds FOR SELECT TO authenticated
USING (private.can_access_branch(auth.uid(), tenant_id, branch_id));

CREATE POLICY "Members view refund items via refund"
ON public.sale_refund_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.sale_refunds r
  WHERE r.id = refund_id AND r.tenant_id = sale_refund_items.tenant_id
    AND private.can_access_branch(auth.uid(), r.tenant_id, r.branch_id)
));

CREATE POLICY "Members view supplier returns in accessible branches"
ON public.purchase_returns FOR SELECT TO authenticated
USING (private.can_access_branch(auth.uid(), tenant_id, branch_id));

CREATE POLICY "Members view supplier return items via return"
ON public.purchase_return_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.purchase_returns r
  WHERE r.id = purchase_return_id AND r.tenant_id = purchase_return_items.tenant_id
    AND private.can_access_branch(auth.uid(), r.tenant_id, r.branch_id)
));

GRANT SELECT ON public.sale_refunds, public.sale_refund_items,
  public.purchase_returns, public.purchase_return_items TO authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.sale_refunds, public.sale_refund_items,
  public.purchase_returns, public.purchase_return_items FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_sale_refund(
  _tenant_id uuid,
  _sale_id uuid,
  _reason text,
  _refund_method public.payment_method,
  _items jsonb
)
RETURNS public.sale_refunds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_line public.sale_items%ROWTYPE;
  v_item jsonb;
  v_refund public.sale_refunds%ROWTYPE;
  v_sale_item_id uuid;
  v_qty numeric(14,3);
  v_prior_qty numeric(14,3);
  v_prior_subtotal numeric(12,2);
  v_prior_discount numeric(12,2);
  v_prior_tax numeric(12,2);
  v_target_discount numeric(12,2);
  v_target_tax numeric(12,2);
  v_line_subtotal numeric(12,2);
  v_line_discount numeric(12,2);
  v_line_tax numeric(12,2);
  v_line_total numeric(12,2);
  v_restock boolean;
  v_session_id uuid;
  v_is_full boolean := true;
  v_last_item_id uuid;
  v_prior_sale_subtotal numeric(12,2);
  v_prior_sale_discount numeric(12,2);
  v_prior_sale_tax numeric(12,2);
  v_sum_subtotal numeric(12,2);
  v_sum_discount numeric(12,2);
  v_sum_tax numeric(12,2);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF _tenant_id IS NULL OR _sale_id IS NULL OR length(btrim(COALESCE(_reason,''))) NOT BETWEEN 2 AND 500
     OR _refund_method NOT IN ('cash','card','transfer') THEN
    RAISE EXCEPTION 'Invalid refund details or payment method' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_sale FROM public.sales
  WHERE id = _sale_id AND tenant_id = _tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found in this tenant' USING ERRCODE = 'P0002'; END IF;
  IF v_sale.status <> 'completed' THEN RAISE EXCEPTION 'Only completed sales can be refunded' USING ERRCODE = '55000'; END IF;
  IF NOT private.is_tenant_admin(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'Only tenant owners or managers can approve sale refunds' USING ERRCODE = '42501';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) = 0 OR jsonb_array_length(_items) > 300 THEN
    RAISE EXCEPTION 'Refund must contain between 1 and 300 items' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(_items))
     <> (SELECT count(DISTINCT value->>'sale_item_id') FROM jsonb_array_elements(_items)) THEN
    RAISE EXCEPTION 'A sale item may appear only once in a refund request' USING ERRCODE = '22023';
  END IF;

  IF _refund_method = 'cash' THEN
    SELECT id INTO v_session_id FROM public.cash_sessions
    WHERE tenant_id = _tenant_id AND branch_id = v_sale.branch_id
      AND cashier_id = auth.uid() AND status = 'open'
    ORDER BY opened_at DESC LIMIT 1 FOR UPDATE;
    IF v_session_id IS NULL THEN
      RAISE EXCEPTION 'Open a cash session in this branch before issuing a cash refund' USING ERRCODE = '55000';
    END IF;
  END IF;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(_items)
    ORDER BY (value->>'sale_item_id')::uuid
  LOOP
    v_sale_item_id := (v_item->>'sale_item_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_restock := COALESCE((v_item->>'restock')::boolean, true);
    IF v_sale_item_id IS NULL OR v_qty IS NULL OR v_qty <= 0 OR v_qty > 999999.999 THEN
      RAISE EXCEPTION 'Invalid refund item or quantity' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_line FROM public.sale_items
    WHERE id = v_sale_item_id AND sale_id = _sale_id AND tenant_id = _tenant_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Refund item does not belong to this sale' USING ERRCODE = '23503'; END IF;
    IF v_restock AND v_line.product_id IS NULL THEN
      RAISE EXCEPTION 'A deleted product cannot be restocked; mark this returned item as not restocked' USING ERRCODE = '22023';
    END IF;
    SELECT COALESCE(sum(ri.quantity),0), COALESCE(sum(ri.subtotal_amount),0),
           COALESCE(sum(ri.discount_amount),0), COALESCE(sum(ri.tax_amount),0)
      INTO v_prior_qty, v_prior_subtotal, v_prior_discount, v_prior_tax
    FROM public.sale_refund_items ri
    JOIN public.sale_refunds r ON r.id = ri.refund_id
    WHERE ri.sale_item_id = v_sale_item_id AND r.sale_id = _sale_id;
    IF v_prior_qty + v_qty > v_line.quantity THEN
      RAISE EXCEPTION 'Refund quantity exceeds the remaining quantity for product %', v_line.product_name
        USING ERRCODE = '23514';
    END IF;
  END LOOP;

  SELECT COALESCE(sum(subtotal),0), COALESCE(sum(discount),0), COALESCE(sum(tax_amount),0)
    INTO v_prior_sale_subtotal, v_prior_sale_discount, v_prior_sale_tax
  FROM public.sale_refunds WHERE sale_id = _sale_id;

  IF EXISTS (
    SELECT 1 FROM public.sale_items si
    WHERE si.sale_id = _sale_id
      AND COALESCE((SELECT sum(ri.quantity) FROM public.sale_refund_items ri
        JOIN public.sale_refunds r ON r.id=ri.refund_id WHERE ri.sale_item_id=si.id AND r.sale_id=_sale_id),0)
      + COALESCE((SELECT sum((j->>'quantity')::numeric) FROM jsonb_array_elements(_items) j
        WHERE j->>'sale_item_id'=si.id::text),0) < si.quantity
  ) THEN v_is_full := false; END IF;

  INSERT INTO public.sale_refunds (
    tenant_id, sale_id, branch_id, cash_session_id, processed_by,
    refund_method, subtotal, discount, tax_amount, total, reason
  ) VALUES (
    _tenant_id, _sale_id, v_sale.branch_id, v_session_id, auth.uid(),
    _refund_method, 0, 0, 0, 0, btrim(_reason)
  ) RETURNING * INTO v_refund;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(_items)
    ORDER BY (value->>'sale_item_id')::uuid
  LOOP
    v_sale_item_id := (v_item->>'sale_item_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_restock := COALESCE((v_item->>'restock')::boolean, true);
    SELECT * INTO v_line FROM public.sale_items
    WHERE id = v_sale_item_id AND sale_id = _sale_id AND tenant_id = _tenant_id;

    SELECT COALESCE(sum(ri.quantity),0), COALESCE(sum(ri.subtotal_amount),0),
           COALESCE(sum(ri.discount_amount),0), COALESCE(sum(ri.tax_amount),0)
      INTO v_prior_qty, v_prior_subtotal, v_prior_discount, v_prior_tax
    FROM public.sale_refund_items ri
    JOIN public.sale_refunds r ON r.id = ri.refund_id
    WHERE ri.sale_item_id = v_sale_item_id AND r.sale_id = _sale_id;

    v_target_discount := CASE WHEN v_sale.subtotal = 0 THEN 0
      ELSE round(v_sale.discount * (v_line.line_total / v_sale.subtotal), 2) END;
    v_target_tax := CASE WHEN (v_sale.subtotal - v_sale.discount) = 0 THEN 0
      ELSE round(v_sale.tax_amount * ((v_line.line_total - v_target_discount) /
        (v_sale.subtotal - v_sale.discount)), 2) END;

    IF v_prior_qty + v_qty = v_line.quantity THEN
      v_line_subtotal := v_line.line_total - v_prior_subtotal;
      v_line_discount := v_target_discount - v_prior_discount;
      v_line_tax := v_target_tax - v_prior_tax;
    ELSE
      v_line_subtotal := round(v_line.line_total * v_qty / v_line.quantity, 2);
      v_line_discount := round(v_target_discount * v_qty / v_line.quantity, 2);
      v_line_tax := round(v_target_tax * v_qty / v_line.quantity, 2);
    END IF;
    v_line_total := greatest(v_line_subtotal - v_line_discount + v_line_tax, 0);

    INSERT INTO public.sale_refund_items (
      tenant_id, refund_id, sale_item_id, product_id, product_name,
      quantity, unit_price, cost_price_snapshot, subtotal_amount,
      discount_amount, tax_amount, total_amount, restocked
    ) VALUES (
      _tenant_id, v_refund.id, v_line.id, v_line.product_id, v_line.product_name,
      v_qty, v_line.unit_price, v_line.cost_price_snapshot, v_line_subtotal,
      v_line_discount, v_line_tax, v_line_total, v_restock
    ) RETURNING id INTO v_last_item_id;

    IF v_restock THEN
      PERFORM public.apply_stock_change(_tenant_id, v_line.product_id, v_sale.branch_id, v_qty);
      INSERT INTO public.inventory_transactions (
        tenant_id, product_id, branch_id, user_id, txn_type, quantity,
        reference_type, reference_id, reason
      ) VALUES (
        _tenant_id, v_line.product_id, v_sale.branch_id, auth.uid(), 'refund', v_qty,
        'sale_refund', v_refund.id, 'إرجاع صنف من فاتورة بيع'
      );
    END IF;
  END LOOP;

  IF v_is_full AND v_last_item_id IS NOT NULL THEN
    SELECT COALESCE(sum(subtotal_amount),0), COALESCE(sum(discount_amount),0), COALESCE(sum(tax_amount),0)
      INTO v_sum_subtotal, v_sum_discount, v_sum_tax
    FROM public.sale_refund_items WHERE refund_id = v_refund.id;
    UPDATE public.sale_refund_items
       SET subtotal_amount = subtotal_amount + ((v_sale.subtotal - v_prior_sale_subtotal) - v_sum_subtotal),
           discount_amount = discount_amount + ((v_sale.discount - v_prior_sale_discount) - v_sum_discount),
           tax_amount = tax_amount + ((v_sale.tax_amount - v_prior_sale_tax) - v_sum_tax),
           total_amount = total_amount
             + ((v_sale.subtotal - v_prior_sale_subtotal) - v_sum_subtotal)
             - ((v_sale.discount - v_prior_sale_discount) - v_sum_discount)
             + ((v_sale.tax_amount - v_prior_sale_tax) - v_sum_tax)
     WHERE id = v_last_item_id;
  END IF;

  UPDATE public.sale_refunds r
     SET subtotal = x.subtotal, discount = x.discount, tax_amount = x.tax_amount,
         total = x.subtotal - x.discount + x.tax_amount
    FROM (
      SELECT COALESCE(sum(subtotal_amount),0) subtotal,
             COALESCE(sum(discount_amount),0) discount,
             COALESCE(sum(tax_amount),0) tax_amount
      FROM public.sale_refund_items WHERE refund_id = v_refund.id
    ) x
   WHERE r.id = v_refund.id
  RETURNING * INTO v_refund;

  IF v_refund.total <= 0 THEN RAISE EXCEPTION 'Refund total must be greater than zero' USING ERRCODE = '22023'; END IF;

  IF v_is_full THEN
    UPDATE public.sales SET status = 'refunded', updated_at = now()
    WHERE id = _sale_id AND tenant_id = _tenant_id;
  END IF;

  RETURN v_refund;
END;
$$;

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
  IF _tenant_id IS NULL OR _purchase_id IS NULL OR length(btrim(COALESCE(_reason,''))) NOT BETWEEN 2 AND 500 THEN
    RAISE EXCEPTION 'Invalid supplier return details' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_purchase FROM public.purchases WHERE id = _purchase_id AND tenant_id = _tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase not found in this tenant' USING ERRCODE = 'P0002'; END IF;
  IF v_purchase.status <> 'received' THEN RAISE EXCEPTION 'Only received purchases can be returned' USING ERRCODE = '55000'; END IF;
  IF NOT (
    private.is_tenant_admin(auth.uid(), _tenant_id)
    OR EXISTS (SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND tenant_id = _tenant_id
        AND role = 'warehouse' AND branch_id = v_purchase.branch_id)
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

REVOKE ALL ON FUNCTION public.create_sale_refund(uuid, uuid, text, public.payment_method, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sale_refund(uuid, uuid, text, public.payment_method, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_purchase_return(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_return(uuid, uuid, text, jsonb) TO authenticated, service_role;

-- Cash closing is net of cash refunds issued from that same open session.
CREATE OR REPLACE FUNCTION public.close_cash_session(_session_id uuid, _closing_balance numeric)
RETURNS public.cash_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_session public.cash_sessions%ROWTYPE;
  v_expected numeric(12,2);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF _closing_balance IS NULL OR _closing_balance < 0 OR _closing_balance = 'NaN'::numeric THEN
    RAISE EXCEPTION 'Closing balance must be zero or greater' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_session FROM public.cash_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cash session not found' USING ERRCODE = 'P0002'; END IF;
  IF v_session.status <> 'open' THEN RAISE EXCEPTION 'Cash session is already closed' USING ERRCODE = '55000'; END IF;
  IF auth.uid() <> v_session.cashier_id AND NOT private.is_tenant_admin(auth.uid(), v_session.tenant_id) THEN
    RAISE EXCEPTION 'You cannot close this cashier session' USING ERRCODE = '42501';
  END IF;
  SELECT round(v_session.opening_balance
      + COALESCE((SELECT sum(p.amount) FROM public.payments p
        JOIN public.sales s ON s.id=p.sale_id
        WHERE s.session_id=v_session.id AND s.tenant_id=v_session.tenant_id
          AND s.status IN ('completed','refunded') AND p.method='cash'),0)
      - COALESCE((SELECT sum(r.total) FROM public.sale_refunds r
        WHERE r.cash_session_id=v_session.id AND r.tenant_id=v_session.tenant_id
          AND r.refund_method='cash'),0), 2)
    INTO v_expected;
  UPDATE public.cash_sessions SET status='closed', closing_balance=_closing_balance,
    expected_cash=v_expected, cash_difference=round(_closing_balance-v_expected,2),
    closed_at=now(), updated_at=now()
  WHERE id=v_session.id RETURNING * INTO v_session;
  RETURN v_session;
END;
$$;
REVOKE ALL ON FUNCTION public.close_cash_session(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_cash_session(uuid, numeric) TO authenticated, service_role;

-- Profitability now reflects partial/full customer returns and the cost of
-- returned stock, without inventing costs for historical rows.
CREATE OR REPLACE VIEW public.sales_profitability
WITH (security_invoker = true)
AS
WITH refunded AS (
  SELECT ri.sale_item_id,
         sum(ri.quantity) FILTER (WHERE ri.restocked) AS restocked_quantity
  FROM public.sale_refund_items ri
  GROUP BY ri.sale_item_id
),
refund_totals AS (
  SELECT sale_id,
         sum(subtotal - discount) AS refunded_net_revenue
  FROM public.sale_refunds
  GROUP BY sale_id
),
item_costs AS (
  SELECT s.id AS sale_id,
         sum(COALESCE(si.quantity - COALESCE(r.restocked_quantity,0), si.quantity)
             * si.cost_price_snapshot) AS remaining_cogs,
         count(*) FILTER (
           WHERE si.cost_price_snapshot IS NULL
             AND si.quantity - COALESCE(r.restocked_quantity,0) > 0
         ) AS unknown_cost_items
  FROM public.sales s
  LEFT JOIN public.sale_items si ON si.sale_id=s.id AND si.tenant_id=s.tenant_id
  LEFT JOIN refunded r ON r.sale_item_id=si.id
  GROUP BY s.id
)
SELECT s.id AS sale_id, s.tenant_id, s.branch_id, s.invoice_no, s.created_at,
       s.status, s.subtotal, s.discount,
       (s.subtotal - s.discount - COALESCE(rt.refunded_net_revenue,0)) AS net_revenue_before_tax,
       CASE WHEN ic.unknown_cost_items > 0 THEN NULL ELSE COALESCE(ic.remaining_cogs,0) END AS cost_of_goods_sold,
       CASE WHEN ic.unknown_cost_items > 0 THEN NULL
            ELSE (s.subtotal - s.discount - COALESCE(rt.refunded_net_revenue,0)) - COALESCE(ic.remaining_cogs,0)
       END AS gross_profit,
       ic.unknown_cost_items AS items_with_unknown_cost
FROM public.sales s
LEFT JOIN refund_totals rt ON rt.sale_id=s.id
LEFT JOIN item_costs ic ON ic.sale_id=s.id
WHERE s.status IN ('completed','refunded');

COMMENT ON VIEW public.sales_profitability IS
  'Gross profitability after customer returns, before operating expenses and tax. Unknown remaining item costs yield NULL.';

COMMIT;
