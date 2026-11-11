-- Enforce the permission catalogue at the database boundary.
-- Restrictive policies are ANDed with existing tenant/branch isolation policies.
BEGIN;

DO $permission_gates$
DECLARE
  r record;
  v_cmd text;
  v_key text;
  v_policy text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('attendance', 'hr.attendance.view', 'hr.attendance.manage', 'hr.attendance.manage', 'hr.attendance.manage'),
    ('audit_logs', 'audit.view', NULL, NULL, NULL),
    ('bonuses', 'hr.compensation.view', 'hr.compensation.manage', 'hr.compensation.manage', 'hr.compensation.manage'),
    ('branches', 'branches.view', 'branches.create', 'branches.edit', 'branches.delete'),
    ('cash_sessions', 'cash.view', 'cash.open', 'cash.close', NULL),
    ('categories', 'categories.view', 'categories.manage', 'categories.manage', 'categories.manage'),
    ('companies', 'companies.view', 'companies.manage', 'companies.manage', 'companies.manage'),
    ('custom_roles', 'roles.view', 'roles.manage', 'roles.manage', 'roles.manage'),
    ('customers', 'customers.view', 'customers.manage', 'customers.manage', 'customers.manage'),
    ('deductions', 'hr.compensation.view', 'hr.compensation.manage', 'hr.compensation.manage', 'hr.compensation.manage'),
    ('departments', 'departments.view', 'departments.manage', 'departments.manage', 'departments.manage'),
    ('employees', 'hr.employees.view', 'hr.employees.manage', 'hr.employees.manage', 'hr.employees.manage'),
    ('employment_types', 'employment_types.view', 'employment_types.manage', 'employment_types.manage', 'employment_types.manage'),
    ('expense_categories', 'expenses.view', 'expense_categories.manage', 'expense_categories.manage', 'expense_categories.manage'),
    ('expenses', 'expenses.view', 'expenses.manage', 'expenses.manage', 'expenses.manage'),
    ('inventory', 'inventory.view', 'inventory.adjust', 'inventory.adjust', 'inventory.adjust'),
    ('inventory_transactions', 'inventory.movements.view', 'inventory.adjust', NULL, NULL),
    ('job_titles', 'job_titles.view', 'job_titles.manage', 'job_titles.manage', 'job_titles.manage'),
    ('leave_requests', 'hr.leaves.view', NULL, NULL, NULL),
    ('leave_types', 'hr.leaves.view', 'hr.manage', 'hr.manage', 'hr.manage'),
    ('login_history', 'login_history.view', NULL, NULL, NULL),
    ('notifications', 'notifications.view', 'notifications.manage', 'notifications.manage', 'notifications.manage'),
    ('payments', 'sales.view', 'pos.create_sale', 'sales.approve', 'sales.delete'),
    ('payroll_items', 'hr.payroll.view', 'payroll.run', 'payroll.approve', 'payroll.approve'),
    ('payroll_runs', 'hr.payroll.view', 'payroll.run', 'payroll.approve', 'payroll.approve'),
    ('products', 'products.view', 'products.create', 'products.edit', 'products.delete'),
    ('purchase_items', 'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.delete'),
    ('purchase_return_items', 'purchases.view', 'purchases.manage', 'purchases.manage', 'purchases.manage'),
    ('purchase_returns', 'purchases.view', 'purchases.manage', 'purchases.manage', 'purchases.manage'),
    ('purchases', 'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.delete'),
    ('role_permissions', 'roles.view', 'roles.manage', 'roles.manage', 'roles.manage'),
    ('sale_items', 'sales.view', 'pos.create_sale', 'sales.approve', 'sales.delete'),
    ('sale_refund_items', 'sales.view', 'sales.refund', 'sales.refund', 'sales.refund'),
    ('sale_refunds', 'sales.view', 'sales.refund', 'sales.refund', 'sales.refund'),
    ('sales', 'sales.view', 'pos.create_sale', 'sales.approve', 'sales.delete'),
    ('suppliers', 'suppliers.view', 'suppliers.manage', 'suppliers.manage', 'suppliers.manage'),
    ('user_permission_overrides', 'permissions.view', 'permissions.manage', 'permissions.manage', 'permissions.manage')
  ) AS m(table_name, select_key, insert_key, update_key, delete_key)
  LOOP
    IF to_regclass(format('public.%I', r.table_name)) IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=r.table_name AND column_name='tenant_id'
    ) THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.table_name);
    FOREACH v_cmd IN ARRAY ARRAY['select','insert','update','delete'] LOOP
      v_key := CASE v_cmd
        WHEN 'select' THEN r.select_key
        WHEN 'insert' THEN r.insert_key
        WHEN 'update' THEN r.update_key
        ELSE r.delete_key
      END;
      IF v_key IS NULL THEN CONTINUE; END IF;
      v_policy := 'permission_gate_' || r.table_name || '_' || v_cmd;
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy, r.table_name);
      IF v_cmd='select' THEN
        IF r.table_name='role_permissions' THEN
          EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (tenant_id IS NULL OR public.has_permission((select auth.uid()), tenant_id, %L))', v_policy, r.table_name, v_key);
        ELSE
          EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.has_permission((select auth.uid()), tenant_id, %L))', v_policy, r.table_name, v_key);
        END IF;
      ELSIF v_cmd='insert' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.has_permission((select auth.uid()), tenant_id, %L))', v_policy, r.table_name, v_key);
      ELSIF v_cmd='update' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.has_permission((select auth.uid()), tenant_id, %L)) WITH CHECK (public.has_permission((select auth.uid()), tenant_id, %L))', v_policy, r.table_name, v_key, v_key);
      ELSE
        EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.has_permission((select auth.uid()), tenant_id, %L))', v_policy, r.table_name, v_key);
      END IF;
    END LOOP;
  END LOOP;
END
$permission_gates$;


CREATE OR REPLACE FUNCTION public.adjust_inventory_balance(_tenant_id uuid, _product_id uuid, _branch_id uuid, _target_quantity numeric, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  v_current numeric(14,3);
  v_delta numeric(14,3);
BEGIN

  IF NOT public.has_permission(auth.uid(), _tenant_id, 'inventory.adjust') THEN RAISE EXCEPTION 'Permission denied: inventory.adjust' USING ERRCODE = '42501'; END IF;
  IF auth.uid() IS NULL THEN
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
    private.is_tenant_admin(auth.uid(), _tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND tenant_id = _tenant_id
        AND role = 'warehouse'
        AND branch_id = _branch_id
    )
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
  IF NOT FOUND THEN v_current := 0; END IF;

  v_delta := _target_quantity - v_current;
  IF v_delta <> 0 THEN
    PERFORM public.apply_stock_change(_tenant_id, _product_id, _branch_id, v_delta);
    INSERT INTO public.inventory_transactions (
      tenant_id, product_id, branch_id, user_id, txn_type, quantity, reason
    ) VALUES (
      _tenant_id, _product_id, _branch_id, auth.uid(), 'adjust', v_delta,
      COALESCE(NULLIF(btrim(_reason), ''), 'تعديل يدوي')
    );
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_cash_session(_session_id uuid, _closing_balance numeric)
 RETURNS cash_sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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
  IF NOT public.has_permission(auth.uid(), v_session.tenant_id, 'cash.close') THEN RAISE EXCEPTION 'Permission denied: cash.close' USING ERRCODE = '42501'; END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.create_purchase_return(_tenant_id uuid, _purchase_id uuid, _reason text, _items jsonb)
 RETURNS purchase_returns
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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

  IF NOT public.has_permission(auth.uid(), _tenant_id, 'purchases.manage') THEN RAISE EXCEPTION 'Permission denied: purchases.manage' USING ERRCODE = '42501'; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF _tenant_id IS NULL OR _purchase_id IS NULL OR _reason IS NULL OR length(btrim(_reason)) NOT BETWEEN 2 AND 500 THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.create_purchase_with_items(_tenant_id uuid, _branch_id uuid, _user_id uuid, _supplier_id uuid, _reference text, _notes text, _items jsonb)
 RETURNS purchases
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_item jsonb; v_product_id uuid; v_quantity numeric(14,3); v_cost_price numeric(12,2);
  v_total numeric(12,2) := 0; v_purchase public.purchases%ROWTYPE;
BEGIN

  IF NOT public.has_permission(auth.uid(), _tenant_id, 'purchases.create') THEN RAISE EXCEPTION 'Permission denied: purchases.create' USING ERRCODE = '42501'; END IF;
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN RAISE EXCEPTION 'Authenticated purchaser identity mismatch' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.branches WHERE id = _branch_id AND tenant_id = _tenant_id AND is_active = true) THEN
    RAISE EXCEPTION 'Branch does not belong to the requested tenant or is inactive' USING ERRCODE = '23503';
  END IF;
  IF NOT (private.is_tenant_admin(auth.uid(), _tenant_id) OR EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND tenant_id = _tenant_id
      AND role = 'warehouse' AND branch_id = _branch_id
  )) THEN RAISE EXCEPTION 'You cannot receive purchases in this branch' USING ERRCODE = '42501'; END IF;
  IF _supplier_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = _supplier_id AND tenant_id = _tenant_id) THEN
    RAISE EXCEPTION 'Supplier does not belong to the requested tenant' USING ERRCODE = '23503';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 OR jsonb_array_length(_items) > 300 THEN
    RAISE EXCEPTION 'Purchase must contain between 1 and 300 items' USING ERRCODE = '22023';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(_items) ORDER BY (value->>'product_id')::uuid LOOP
    v_product_id := (v_item->>'product_id')::uuid; v_quantity := (v_item->>'quantity')::numeric; v_cost_price := (v_item->>'cost_price')::numeric;
    IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity <= 0 OR v_quantity > 999999.999
       OR v_cost_price IS NULL OR v_cost_price < 0 OR v_cost_price = 'NaN'::numeric THEN
      RAISE EXCEPTION 'Invalid purchase quantity or cost price' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM public.products WHERE id = v_product_id AND tenant_id = _tenant_id AND is_active = true FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Purchase product is unavailable or belongs to another tenant' USING ERRCODE = '23503'; END IF;
    v_total := v_total + round(v_quantity * v_cost_price, 2);
  END LOOP;
  INSERT INTO public.purchases (tenant_id, branch_id, supplier_id, user_id, reference, notes, total, status)
  VALUES (_tenant_id, _branch_id, _supplier_id, _user_id, NULLIF(btrim(_reference), ''), NULLIF(btrim(_notes), ''), round(v_total, 2), 'received')
  RETURNING * INTO v_purchase;
  FOR v_item IN SELECT value FROM jsonb_array_elements(_items) ORDER BY (value->>'product_id')::uuid LOOP
    v_product_id := (v_item->>'product_id')::uuid; v_quantity := (v_item->>'quantity')::numeric; v_cost_price := (v_item->>'cost_price')::numeric;
    INSERT INTO public.purchase_items (tenant_id, purchase_id, product_id, quantity, cost_price, line_total)
    VALUES (_tenant_id, v_purchase.id, v_product_id, v_quantity, v_cost_price, round(v_quantity * v_cost_price, 2));
  END LOOP;
  RETURN v_purchase;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_sale_refund(_tenant_id uuid, _sale_id uuid, _reason text, _refund_method payment_method, _items jsonb)
 RETURNS sale_refunds
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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

  IF NOT public.has_permission(auth.uid(), _tenant_id, 'sales.refund') THEN RAISE EXCEPTION 'Permission denied: sales.refund' USING ERRCODE = '42501'; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF _tenant_id IS NULL OR _sale_id IS NULL OR _reason IS NULL OR length(btrim(_reason)) NOT BETWEEN 2 AND 500
     OR _refund_method IS NULL OR _refund_method NOT IN ('cash','card','transfer') THEN
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
      + COALESCE((SELECT sum((req.value->>'quantity')::numeric) FROM jsonb_array_elements(_items) AS req(value)
        WHERE req.value->>'sale_item_id'=si.id::text),0) < si.quantity
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
$function$;

CREATE OR REPLACE FUNCTION public.create_sale_with_items(_tenant_id uuid, _branch_id uuid, _cashier_id uuid, _session_id uuid, _discount numeric, _payment_method payment_method, _items jsonb)
 RETURNS sales
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_tax_rate numeric(5,2); v_subtotal numeric(12,2) := 0; v_discount numeric(12,2);
  v_taxable numeric(12,2); v_tax_amount numeric(12,2); v_total numeric(12,2);
  v_item jsonb; v_product public.products%ROWTYPE; v_product_id uuid; v_quantity numeric(12,3); v_sale public.sales%ROWTYPE;
BEGIN

  IF NOT public.has_permission(auth.uid(), _tenant_id, 'pos.create_sale') THEN RAISE EXCEPTION 'Permission denied: pos.create_sale' USING ERRCODE = '42501'; END IF;
  IF auth.uid() IS NULL OR auth.uid() <> _cashier_id THEN RAISE EXCEPTION 'Authenticated cashier identity mismatch' USING ERRCODE = '42501'; END IF;
  IF NOT private.can_access_branch(auth.uid(), _tenant_id, _branch_id) THEN RAISE EXCEPTION 'You cannot create sales in this branch' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.cash_sessions cs WHERE cs.id = _session_id AND cs.tenant_id = _tenant_id
    AND cs.branch_id = _branch_id AND cs.cashier_id = _cashier_id AND cs.status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'An open cashier session for this branch is required' USING ERRCODE = '55000'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 OR jsonb_array_length(_items) > 300 THEN
    RAISE EXCEPTION 'Sale must contain between 1 and 300 items' USING ERRCODE = '22023';
  END IF;
  IF _payment_method IS NULL THEN RAISE EXCEPTION 'Payment method is required' USING ERRCODE = '22023'; END IF;
  SELECT tax_rate INTO v_tax_rate FROM public.tenants WHERE id = _tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found' USING ERRCODE = 'P0002'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(_items) ORDER BY (value->>'product_id')::uuid LOOP
    v_product_id := (v_item->>'product_id')::uuid; v_quantity := (v_item->>'quantity')::numeric;
    IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity <= 0 OR v_quantity > 999999.999 THEN
      RAISE EXCEPTION 'Invalid item quantity or product' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_product FROM public.products WHERE id = v_product_id AND tenant_id = _tenant_id AND is_active = true FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product is unavailable or belongs to another tenant' USING ERRCODE = '23503'; END IF;
    IF v_product.cost_price < 0 OR v_product.sale_price < 0 OR v_product.cost_price = 'NaN'::numeric OR v_product.sale_price = 'NaN'::numeric THEN
      RAISE EXCEPTION 'Product prices cannot be negative or invalid' USING ERRCODE = '22023';
    END IF;
    v_subtotal := v_subtotal + round(v_product.sale_price * v_quantity, 2);
  END LOOP;
  v_discount := COALESCE(_discount, 0);
  IF v_discount < 0 OR v_discount > v_subtotal OR v_discount = 'NaN'::numeric THEN
    RAISE EXCEPTION 'Discount must be between zero and the subtotal' USING ERRCODE = '22023';
  END IF;
  v_taxable := greatest(v_subtotal - v_discount, 0); v_tax_amount := round(v_taxable * (v_tax_rate / 100), 2); v_total := round(v_taxable + v_tax_amount, 2);
  INSERT INTO public.sales (tenant_id, branch_id, cashier_id, session_id, invoice_no, subtotal, discount, tax_amount, total, payment_method)
  VALUES (_tenant_id, _branch_id, _cashier_id, _session_id, 0, v_subtotal, v_discount, v_tax_amount, v_total, _payment_method)
  RETURNING * INTO v_sale;
  FOR v_item IN SELECT value FROM jsonb_array_elements(_items) ORDER BY (value->>'product_id')::uuid LOOP
    v_product_id := (v_item->>'product_id')::uuid; v_quantity := (v_item->>'quantity')::numeric;
    SELECT * INTO v_product FROM public.products WHERE id = v_product_id AND tenant_id = _tenant_id AND is_active = true FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product became unavailable during checkout' USING ERRCODE = '23503'; END IF;
    INSERT INTO public.sale_items (tenant_id, sale_id, product_id, product_name, quantity, unit_price, tax_rate, line_total, cost_price_snapshot)
    VALUES (_tenant_id, v_sale.id, v_product.id, v_product.name, v_quantity, v_product.sale_price, v_tax_rate,
      round(v_product.sale_price * v_quantity, 2), v_product.cost_price);
  END LOOP;
  INSERT INTO public.payments(tenant_id, sale_id, method, amount) VALUES (_tenant_id, v_sale.id, _payment_method, v_total);
  RETURN v_sale;
END;
$function$;



-- Leave decisions accept either the approval or rejection permission.
DROP POLICY IF EXISTS permission_gate_leave_requests_update_decision ON public.leave_requests;
CREATE POLICY permission_gate_leave_requests_update_decision
ON public.leave_requests AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  public.has_permission((select auth.uid()), tenant_id, 'hr.leaves.approve')
  OR public.has_permission((select auth.uid()), tenant_id, 'hr.leaves.reject')
)
WITH CHECK (
  public.has_permission((select auth.uid()), tenant_id, 'hr.leaves.approve')
  OR public.has_permission((select auth.uid()), tenant_id, 'hr.leaves.reject')
);



-- Return the effective permission set for the signed-in member in one round trip.
CREATE OR REPLACE FUNCTION public.get_my_permissions(_tenant_id uuid)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_permissions text[];
BEGIN
  IF auth.uid() IS NULL OR _tenant_id IS NULL THEN
    RAISE EXCEPTION 'Authentication and tenant are required' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.is_super_owner(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND tenant_id = _tenant_id
    )
  ) THEN
    RAISE EXCEPTION 'You are not a member of this tenant' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(p.key ORDER BY p.key), ARRAY[]::text[])
    INTO v_permissions
  FROM public.permissions p
  WHERE public.has_permission(auth.uid(), _tenant_id, p.key);

  RETURN v_permissions;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_permissions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_permissions(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_permissions(uuid) TO authenticated;



-- POS staff need to see the catalog and available stock to prevent overselling.
INSERT INTO public.role_permissions (tenant_id, role_kind, builtin_role, permission_key)
VALUES
  (NULL, 'builtin', 'cashier'::public.app_role, 'categories.view'),
  (NULL, 'builtin', 'cashier'::public.app_role, 'inventory.view'),
  (NULL, 'builtin', 'waiter'::public.app_role, 'categories.view'),
  (NULL, 'builtin', 'waiter'::public.app_role, 'inventory.view'),
  (NULL, 'builtin', 'warehouse'::public.app_role, 'categories.view')
ON CONFLICT DO NOTHING;

-- Waiters create table orders; they do not own cash sessions or finalize payments.
DELETE FROM public.role_permissions
WHERE tenant_id IS NULL
  AND role_kind = 'builtin'
  AND builtin_role = 'waiter'::public.app_role
  AND permission_key = 'pos.create_sale';


COMMIT;
