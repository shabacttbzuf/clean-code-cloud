-- Fix same-product Buy X Get Y calculations and enforce minimums on eligible items.
-- This is additive and does not rewrite existing sales, invoices, payments, or inventory movements.
BEGIN;

CREATE OR REPLACE FUNCTION private.create_pos_order_with_promotion(
  _tenant_id uuid,
  _branch_id uuid,
  _cashier_id uuid,
  _session_id uuid,
  _discount numeric,
  _customer_id uuid,
  _paid_amount numeric,
  _paid_method public.payment_method,
  _items jsonb,
  _order_type text,
  _table_id uuid,
  _delivery_customer_name text,
  _delivery_customer_phone text,
  _delivery_address text,
  _delivery_fee numeric,
  _promotion_id uuid
)
RETURNS public.sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
DECLARE
  v_offer public.promotional_offers%ROWTYPE;
  v_sale public.sales%ROWTYPE;
  v_branch_company uuid;
  v_subtotal numeric(12,2);
  v_eligible_subtotal numeric(12,2);
  v_buy_qty integer := 0;
  v_reward_qty integer := 0;
  v_free_qty integer := 0;
  v_reward_price numeric(12,2) := 0;
  v_promo_discount numeric(12,2) := 0;
  v_total_discount numeric(12,2);
  v_usage_count bigint;
BEGIN
  IF _promotion_id IS NULL THEN
    RETURN private.create_pos_order(
      _tenant_id,_branch_id,_cashier_id,_session_id,_discount,_customer_id,
      _paid_amount,_paid_method,_items,_order_type,_table_id,
      _delivery_customer_name,_delivery_customer_phone,_delivery_address,_delivery_fee
    );
  END IF;

  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM _cashier_id THEN
    RAISE EXCEPTION 'Authenticated cashier identity mismatch' USING ERRCODE='42501';
  END IF;
  IF NOT private.can_access_branch(auth.uid(), _tenant_id, _branch_id) THEN
    RAISE EXCEPTION 'Branch access denied' USING ERRCODE='42501';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(_items)=0 OR jsonb_array_length(_items)>300 THEN
    RAISE EXCEPTION 'Sale must contain between 1 and 300 items' USING ERRCODE='22023';
  END IF;
  IF coalesce(_discount,0)<0 THEN
    RAISE EXCEPTION 'Manual discount cannot be negative' USING ERRCODE='22023';
  END IF;

  SELECT b.company_id INTO v_branch_company
  FROM public.branches b
  WHERE b.id=_branch_id AND b.tenant_id=_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Branch not found' USING ERRCODE='23503'; END IF;

  SELECT * INTO v_offer
  FROM public.promotional_offers po
  WHERE po.id=_promotion_id
    AND po.tenant_id=_tenant_id
    AND po.status='active'
    AND (po.starts_at IS NULL OR po.starts_at<=now())
    AND (po.ends_at IS NULL OR po.ends_at>now())
    AND (po.branch_id IS NULL OR po.branch_id=_branch_id)
    AND (po.company_id IS NULL OR po.company_id=v_branch_company)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Promotion is not active or is outside this branch scope' USING ERRCODE='42501'; END IF;

  IF v_offer.usage_limit IS NOT NULL THEN
    SELECT count(*) INTO v_usage_count FROM public.promotion_redemptions pr
    WHERE pr.promotion_id=v_offer.id;
    IF v_usage_count >= v_offer.usage_limit THEN
      RAISE EXCEPTION 'Promotion usage limit has been reached' USING ERRCODE='22023';
    END IF;
  END IF;

  SELECT coalesce(sum(round(p.sale_price * (item->>'quantity')::numeric,2)),0)
  INTO v_subtotal
  FROM jsonb_array_elements(_items) item
  JOIN public.products p ON p.id=(item->>'product_id')::uuid
  WHERE p.tenant_id=_tenant_id AND p.is_active=true;

  SELECT coalesce(sum(round(p.sale_price * (item->>'quantity')::numeric,2)),0)
  INTO v_eligible_subtotal
  FROM jsonb_array_elements(_items) item
  JOIN public.products p ON p.id=(item->>'product_id')::uuid
  WHERE p.tenant_id=_tenant_id AND p.is_active=true
    AND (v_offer.product_id IS NULL OR p.id=v_offer.product_id);

  IF v_subtotal<=0 OR v_eligible_subtotal<=0 THEN
    RAISE EXCEPTION 'Promotion does not apply to the current cart' USING ERRCODE='22023';
  END IF;
  IF v_eligible_subtotal < v_offer.minimum_subtotal THEN
    RAISE EXCEPTION 'Eligible items do not meet the promotion minimum subtotal' USING ERRCODE='22023';
  END IF;

  IF v_offer.offer_type='percentage' THEN
    v_promo_discount := round(v_eligible_subtotal * v_offer.discount_value / 100, 2);
  ELSIF v_offer.offer_type='fixed' THEN
    v_promo_discount := least(v_eligible_subtotal, v_offer.discount_value);
  ELSE
    SELECT coalesce(sum((item->>'quantity')::integer),0) INTO v_buy_qty
    FROM jsonb_array_elements(_items) item
    WHERE (item->>'product_id')::uuid=v_offer.product_id;

    SELECT coalesce(sum((item->>'quantity')::integer),0) INTO v_reward_qty
    FROM jsonb_array_elements(_items) item
    WHERE (item->>'product_id')::uuid=coalesce(v_offer.reward_product_id,v_offer.product_id);

    IF coalesce(v_offer.reward_product_id,v_offer.product_id)=v_offer.product_id THEN
      -- Same-SKU bundles: buy X + get Y are fulfilled in complete (X+Y) bundles.
      v_free_qty := (v_reward_qty / (v_offer.buy_quantity + v_offer.get_quantity)) * v_offer.get_quantity;
    ELSE
      v_free_qty := least(v_reward_qty, (v_buy_qty / v_offer.buy_quantity) * v_offer.get_quantity);
    END IF;
    SELECT p.sale_price INTO v_reward_price
    FROM public.products p
    WHERE p.id=coalesce(v_offer.reward_product_id,v_offer.product_id)
      AND p.tenant_id=_tenant_id AND p.is_active=true;
    v_promo_discount := round(v_free_qty * coalesce(v_reward_price,0),2);
  END IF;

  IF v_offer.max_discount IS NOT NULL THEN
    v_promo_discount := least(v_promo_discount, v_offer.max_discount);
  END IF;
  v_total_discount := coalesce(_discount,0) + v_promo_discount;
  IF v_promo_discount<=0 OR v_total_discount>v_subtotal THEN
    RAISE EXCEPTION 'Promotion discount is invalid for this cart' USING ERRCODE='22023';
  END IF;

  v_sale := private.create_pos_order(
    _tenant_id,_branch_id,_cashier_id,_session_id,v_total_discount,_customer_id,
    _paid_amount,_paid_method,_items,_order_type,_table_id,
    _delivery_customer_name,_delivery_customer_phone,_delivery_address,_delivery_fee
  );

  INSERT INTO public.promotion_redemptions
    (tenant_id,company_id,promotion_id,sale_id,branch_id,discount_amount,redeemed_by)
  VALUES
    (_tenant_id,v_offer.company_id,v_offer.id,v_sale.id,_branch_id,v_promo_discount,_cashier_id);

  RETURN v_sale;
END;
$function$;

REVOKE ALL ON FUNCTION private.create_pos_order_with_promotion(uuid,uuid,uuid,uuid,numeric,uuid,numeric,public.payment_method,jsonb,text,uuid,text,text,text,numeric,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.create_pos_order_with_promotion(uuid,uuid,uuid,uuid,numeric,uuid,numeric,public.payment_method,jsonb,text,uuid,text,text,text,numeric,uuid) TO authenticated;

COMMIT;
