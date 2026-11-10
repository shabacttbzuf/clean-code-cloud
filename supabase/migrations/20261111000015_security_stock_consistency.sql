-- Final security and inventory consistency hardening.
BEGIN;

-- These two helpers are only required by RLS predicates. Moving them out of
-- the exposed public API prevents arbitrary RPC probing while preserving the
-- dependency-bound policies (PostgreSQL tracks function OIDs in expressions).
ALTER FUNCTION public.user_has_role_in_tenant(uuid, uuid, text[]) SET SCHEMA private;
ALTER FUNCTION private.user_has_role_in_tenant(uuid, uuid, text[])
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION private.user_has_role_in_tenant(uuid, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.user_has_role_in_tenant(uuid, uuid, text[]) TO authenticated, service_role;

ALTER FUNCTION public.was_hired_by(uuid, uuid, uuid) SET SCHEMA private;
ALTER FUNCTION private.was_hired_by(uuid, uuid, uuid)
  SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION private.was_hired_by(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.was_hired_by(uuid, uuid, uuid) TO authenticated, service_role;

-- Public helper RPCs must never answer questions about another user's
-- permissions or super-owner status.
CREATE OR REPLACE FUNCTION public.is_super_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR _user_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (SELECT 1 FROM public.super_owners WHERE user_id = auth.uid())
  END;
$$;

CREATE OR REPLACE FUNCTION public.has_permission(
  _user_id uuid,
  _tenant_id uuid,
  _permission_key text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_override boolean;
BEGIN
  IF auth.uid() IS NULL OR _user_id IS DISTINCT FROM auth.uid()
     OR _tenant_id IS NULL OR NULLIF(btrim(_permission_key), '') IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_super_owner(auth.uid()) THEN
    RETURN true;
  END IF;

  SELECT granted INTO v_override
  FROM public.user_permission_overrides
  WHERE user_id = auth.uid()
    AND tenant_id = _tenant_id
    AND permission_key = _permission_key
  LIMIT 1;

  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp
      ON rp.builtin_role = ur.role
     AND rp.role_kind = 'builtin'
     AND (rp.tenant_id = _tenant_id OR rp.tenant_id IS NULL)
    WHERE ur.user_id = auth.uid()
      AND ur.tenant_id = _tenant_id
      AND rp.permission_key = _permission_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_super_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_owner(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_permission(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, uuid, text) TO authenticated, service_role;

-- Atomic stock changes reject negative balances and enforce tenant ownership
-- of both product and branch. The conditional upsert closes the oversell race.
CREATE OR REPLACE FUNCTION public.apply_stock_change(
  _tenant_id uuid,
  _product_id uuid,
  _branch_id uuid,
  _delta numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF _tenant_id IS NULL OR _product_id IS NULL OR _branch_id IS NULL
     OR _delta IS NULL OR _delta = 'NaN'::numeric
     OR abs(_delta) > 999999999 THEN
    RAISE EXCEPTION 'Invalid stock change request' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
    FROM public.products
   WHERE id = _product_id AND tenant_id = _tenant_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product does not belong to the requested tenant'
      USING ERRCODE = '23503';
  END IF;

  PERFORM 1
    FROM public.branches
   WHERE id = _branch_id AND tenant_id = _tenant_id
   FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Branch does not belong to the requested tenant'
      USING ERRCODE = '23503';
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
    RAISE EXCEPTION 'Insufficient stock or inventory tenant mismatch'
      USING ERRCODE = '23514';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_stock_change(uuid, uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stock_change(uuid, uuid, uuid, numeric) TO service_role;

-- Purchase receiving now validates the branch explicitly. A warehouse role
-- must be assigned to the selected branch; a NULL branch is not global access.
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
  v_total numeric(12,2) := 0;
  v_purchase public.purchases%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'Authenticated purchaser identity mismatch'
      USING ERRCODE = '42501';
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

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) = 0
     OR jsonb_array_length(_items) > 300 THEN
    RAISE EXCEPTION 'Purchase must contain between 1 and 300 items'
      USING ERRCODE = '22023';
  END IF;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(_items)
    ORDER BY (value->>'product_id')::uuid
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_cost_price := (v_item->>'cost_price')::numeric;

    IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity <= 0
       OR v_quantity > 999999.999 OR v_cost_price IS NULL
       OR v_cost_price < 0 OR v_cost_price = 'NaN'::numeric THEN
      RAISE EXCEPTION 'Invalid purchase quantity or cost price'
        USING ERRCODE = '22023';
    END IF;

    PERFORM 1 FROM public.products
    WHERE id = v_product_id AND tenant_id = _tenant_id AND is_active = true
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Purchase product is unavailable or belongs to another tenant'
        USING ERRCODE = '23503';
    END IF;

    v_total := v_total + round(v_quantity * v_cost_price, 2);
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

REVOKE ALL ON FUNCTION public.create_purchase_with_items(uuid, uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_with_items(uuid, uuid, uuid, uuid, text, text, jsonb) TO authenticated, service_role;

-- Serialize checkout with cash-session closure. A checkout cannot commit
-- against a session being closed concurrently.
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
SET search_path = pg_catalog, public, pg_temp
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

  PERFORM 1
    FROM public.cash_sessions cs
   WHERE cs.id = _session_id
     AND cs.tenant_id = _tenant_id
     AND cs.branch_id = _branch_id
     AND cs.cashier_id = _cashier_id
     AND cs.status = 'open'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'An open cashier session for this branch is required'
      USING ERRCODE = '55000';
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) = 0
     OR jsonb_array_length(_items) > 300 THEN
    RAISE EXCEPTION 'Sale must contain between 1 and 300 items'
      USING ERRCODE = '22023';
  END IF;

  IF _payment_method IS NULL THEN
    RAISE EXCEPTION 'Payment method is required' USING ERRCODE = '22023';
  END IF;

  SELECT tax_rate INTO v_tax_rate
  FROM public.tenants WHERE id = _tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found' USING ERRCODE = 'P0002';
  END IF;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(_items)
    ORDER BY (value->>'product_id')::uuid
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity <= 0
       OR v_quantity > 999999.999 THEN
      RAISE EXCEPTION 'Invalid item quantity or product'
        USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_product_id AND tenant_id = _tenant_id AND is_active = true
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product is unavailable or belongs to another tenant'
        USING ERRCODE = '23503';
    END IF;
    IF v_product.cost_price < 0 OR v_product.sale_price < 0
       OR v_product.cost_price = 'NaN'::numeric
       OR v_product.sale_price = 'NaN'::numeric THEN
      RAISE EXCEPTION 'Product prices cannot be negative or invalid'
        USING ERRCODE = '22023';
    END IF;
    v_subtotal := v_subtotal + round(v_product.sale_price * v_quantity, 2);
  END LOOP;

  v_discount := COALESCE(_discount, 0);
  IF v_discount < 0 OR v_discount > v_subtotal OR v_discount = 'NaN'::numeric THEN
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
    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_product_id AND tenant_id = _tenant_id AND is_active = true
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
      round(v_product.sale_price * v_quantity, 2), v_product.cost_price
    );
  END LOOP;

  INSERT INTO public.payments(tenant_id, sale_id, method, amount)
  VALUES (_tenant_id, v_sale.id, _payment_method, v_total);

  RETURN v_sale;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sale_with_items(uuid, uuid, uuid, uuid, numeric, public.payment_method, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sale_with_items(uuid, uuid, uuid, uuid, numeric, public.payment_method, jsonb) TO authenticated, service_role;

COMMIT;
