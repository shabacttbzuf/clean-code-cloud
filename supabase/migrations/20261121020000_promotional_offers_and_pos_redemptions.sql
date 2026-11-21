-- Stage 9: promotional offers, scoped access, redemption analytics, and POS validation.
BEGIN;

INSERT INTO public.permissions (key, label_ar, label_en, category)
VALUES ('promotions.manage', 'إدارة العروض الترويجية', 'Manage promotional offers', 'marketing')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (tenant_id, role_kind, builtin_role, permission_key)
SELECT NULL, 'builtin', roles.role_name::public.app_role, 'promotions.manage'
FROM (VALUES ('owner'), ('manager')) AS roles(role_name)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.promotional_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT,
  branch_id uuid REFERENCES public.branches(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  offer_type text NOT NULL CHECK (offer_type IN ('percentage','fixed','buy_x_get_y')),
  discount_value numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  minimum_subtotal numeric(12,2) NOT NULL DEFAULT 0 CHECK (minimum_subtotal >= 0),
  max_discount numeric(12,2) CHECK (max_discount IS NULL OR max_discount > 0),
  product_id uuid REFERENCES public.products(id) ON DELETE RESTRICT,
  reward_product_id uuid REFERENCES public.products(id) ON DELETE RESTRICT,
  buy_quantity integer NOT NULL DEFAULT 1 CHECK (buy_quantity > 0),
  get_quantity integer NOT NULL DEFAULT 1 CHECK (get_quantity > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer CHECK (usage_limit IS NULL OR usage_limit > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotional_offer_dates_valid CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT promotional_offer_value_valid CHECK (
    (offer_type = 'percentage' AND discount_value > 0 AND discount_value <= 100)
    OR (offer_type = 'fixed' AND discount_value > 0)
    OR (offer_type = 'buy_x_get_y' AND product_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS promotional_offers_tenant_status_idx
  ON public.promotional_offers(tenant_id, status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS promotional_offers_company_branch_idx
  ON public.promotional_offers(tenant_id, company_id, branch_id, status);
CREATE INDEX IF NOT EXISTS promotional_offers_product_idx
  ON public.promotional_offers(product_id) WHERE product_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.promotion_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT,
  promotion_id uuid NOT NULL REFERENCES public.promotional_offers(id) ON DELETE RESTRICT,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  discount_amount numeric(12,2) NOT NULL CHECK (discount_amount > 0),
  redeemed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotion_redemptions_one_offer_per_sale UNIQUE (sale_id)
);
CREATE INDEX IF NOT EXISTS promotion_redemptions_tenant_promotion_idx
  ON public.promotion_redemptions(tenant_id, promotion_id, created_at DESC);
CREATE INDEX IF NOT EXISTS promotion_redemptions_tenant_branch_idx
  ON public.promotion_redemptions(tenant_id, branch_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.validate_promotional_offer_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
DECLARE
  v_branch_company uuid;
BEGIN
  IF NEW.branch_id IS NOT NULL THEN
    SELECT b.company_id INTO v_branch_company
    FROM public.branches b
    WHERE b.id=NEW.branch_id AND b.tenant_id=NEW.tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Promotion branch must belong to the selected tenant' USING ERRCODE='23503';
    END IF;
    IF NEW.company_id IS NULL THEN NEW.company_id := v_branch_company; END IF;
    IF NEW.company_id IS DISTINCT FROM v_branch_company THEN
      RAISE EXCEPTION 'Promotion company must match its branch company' USING ERRCODE='23514';
    END IF;
  END IF;

  IF NEW.company_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.companies c WHERE c.id=NEW.company_id AND c.tenant_id=NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Promotion company must belong to the selected tenant' USING ERRCODE='23503';
  END IF;

  IF NEW.product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.products p WHERE p.id=NEW.product_id AND p.tenant_id=NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Promotion product must belong to the selected tenant' USING ERRCODE='23503';
  END IF;
  IF NEW.reward_product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.products p WHERE p.id=NEW.reward_product_id AND p.tenant_id=NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Promotion reward product must belong to the selected tenant' USING ERRCODE='23503';
  END IF;
  IF NEW.offer_type='buy_x_get_y' AND NEW.product_id IS NULL THEN
    RAISE EXCEPTION 'Buy X Get Y offers require a qualifying product' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.validate_promotional_offer_scope() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_validate_promotional_offer_scope ON public.promotional_offers;
CREATE TRIGGER trg_validate_promotional_offer_scope
BEFORE INSERT OR UPDATE ON public.promotional_offers
FOR EACH ROW EXECUTE FUNCTION private.validate_promotional_offer_scope();

DROP TRIGGER IF EXISTS trg_promotional_offers_updated_at ON public.promotional_offers;
CREATE TRIGGER trg_promotional_offers_updated_at
BEFORE UPDATE ON public.promotional_offers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.promotional_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members read promotional offers" ON public.promotional_offers;
CREATE POLICY "Tenant members read promotional offers" ON public.promotional_offers
FOR SELECT TO authenticated
USING (
  public.is_super_owner((select auth.uid()))
  OR (
    private.is_tenant_member((select auth.uid()), tenant_id)
    AND (company_id IS NULL OR private.is_company_member(tenant_id, company_id))
    AND (branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id))
  )
);

DROP POLICY IF EXISTS "Promotion managers insert offers" ON public.promotional_offers;
CREATE POLICY "Promotion managers insert offers" ON public.promotional_offers
FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_owner((select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=promotional_offers.tenant_id
      AND ur.role='owner' AND ur.company_id IS NULL
  )
  OR (
    company_id IS NOT NULL
    AND public.has_permission((select auth.uid()), tenant_id, 'promotions.manage')
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=promotional_offers.tenant_id
        AND ur.company_id=promotional_offers.company_id AND ur.role IN ('owner','manager')
    )
    AND (branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id))
  )
);

DROP POLICY IF EXISTS "Promotion managers update offers" ON public.promotional_offers;
CREATE POLICY "Promotion managers update offers" ON public.promotional_offers
FOR UPDATE TO authenticated
USING (
  public.is_super_owner((select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=promotional_offers.tenant_id
      AND ur.role='owner' AND ur.company_id IS NULL
  )
  OR (
    company_id IS NOT NULL
    AND public.has_permission((select auth.uid()), tenant_id, 'promotions.manage')
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=promotional_offers.tenant_id
        AND ur.company_id=promotional_offers.company_id AND ur.role IN ('owner','manager')
    )
    AND (branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id))
  )
)
WITH CHECK (
  public.is_super_owner((select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=promotional_offers.tenant_id
      AND ur.role='owner' AND ur.company_id IS NULL
  )
  OR (
    company_id IS NOT NULL
    AND public.has_permission((select auth.uid()), tenant_id, 'promotions.manage')
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=promotional_offers.tenant_id
        AND ur.company_id=promotional_offers.company_id AND ur.role IN ('owner','manager')
    )
    AND (branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id))
  )
);

DROP POLICY IF EXISTS "Promotion managers delete offers" ON public.promotional_offers;
CREATE POLICY "Promotion managers delete offers" ON public.promotional_offers
FOR DELETE TO authenticated
USING (
  public.is_super_owner((select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=promotional_offers.tenant_id
      AND ur.role='owner' AND ur.company_id IS NULL
  )
  OR (
    company_id IS NOT NULL
    AND public.has_permission((select auth.uid()), tenant_id, 'promotions.manage')
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=promotional_offers.tenant_id
        AND ur.company_id=promotional_offers.company_id AND ur.role IN ('owner','manager')
    )
    AND (branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id))
  )
);

DROP POLICY IF EXISTS "Promotion managers read redemptions" ON public.promotion_redemptions;
CREATE POLICY "Promotion managers read redemptions" ON public.promotion_redemptions
FOR SELECT TO authenticated
USING (
  public.is_super_owner((select auth.uid()))
  OR (
    private.is_tenant_member((select auth.uid()), tenant_id)
    AND (company_id IS NULL OR private.is_company_member(tenant_id, company_id))
    AND private.can_access_branch((select auth.uid()), tenant_id, branch_id)
  )
);

-- POS redemption is validated server-side. The existing 15-argument POS RPC stays
-- untouched for backward compatibility; this overload adds an optional offer ID.
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
  IF v_subtotal < v_offer.minimum_subtotal THEN
    RAISE EXCEPTION 'Cart does not meet the promotion minimum subtotal' USING ERRCODE='22023';
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
    v_free_qty := least(v_reward_qty, (v_buy_qty / v_offer.buy_quantity) * v_offer.get_quantity);
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

-- Exposed RPC remains SECURITY INVOKER, matching the repository's private-wrapper security model.
CREATE OR REPLACE FUNCTION public.create_pos_order(
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
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public, private
AS $function$
  SELECT private.create_pos_order_with_promotion(
    _tenant_id,_branch_id,_cashier_id,_session_id,_discount,_customer_id,
    _paid_amount,_paid_method,_items,_order_type,_table_id,
    _delivery_customer_name,_delivery_customer_phone,_delivery_address,_delivery_fee,_promotion_id
  );
$function$;

REVOKE ALL ON FUNCTION public.create_pos_order(uuid,uuid,uuid,uuid,numeric,uuid,numeric,public.payment_method,jsonb,text,uuid,text,text,text,numeric,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_pos_order(uuid,uuid,uuid,uuid,numeric,uuid,numeric,public.payment_method,jsonb,text,uuid,text,text,text,numeric,uuid) TO authenticated;

COMMIT;
