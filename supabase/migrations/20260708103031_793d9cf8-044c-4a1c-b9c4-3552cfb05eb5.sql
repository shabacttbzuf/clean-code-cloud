
-- =====================================================
-- ENUMS
-- =====================================================
CREATE TYPE public.inventory_txn_type AS ENUM ('in', 'out', 'adjust', 'sale', 'refund');
CREATE TYPE public.purchase_status AS ENUM ('draft', 'received', 'cancelled');

-- =====================================================
-- SUPPLIERS
-- =====================================================
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_suppliers_tenant ON public.suppliers(tenant_id);

CREATE POLICY "Members view suppliers" ON public.suppliers
  FOR SELECT TO authenticated USING (public.is_tenant_member(auth.uid(), tenant_id));
CREATE POLICY "Admins manage suppliers" ON public.suppliers
  FOR ALL TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));

-- =====================================================
-- INVENTORY (per-branch stock)
-- =====================================================
CREATE TABLE public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, branch_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO authenticated;
GRANT ALL ON public.inventory TO service_role;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_inventory_tenant ON public.inventory(tenant_id);
CREATE INDEX idx_inventory_branch ON public.inventory(branch_id);

CREATE POLICY "Members view inventory in accessible branches" ON public.inventory
  FOR SELECT TO authenticated
  USING (public.can_access_branch(auth.uid(), tenant_id, branch_id));

CREATE POLICY "Warehouse and admins manage inventory" ON public.inventory
  FOR ALL TO authenticated
  USING (
    public.is_tenant_admin(auth.uid(), tenant_id)
    OR (public.has_role(auth.uid(), tenant_id, 'warehouse') AND public.can_access_branch(auth.uid(), tenant_id, branch_id))
  )
  WITH CHECK (
    public.is_tenant_admin(auth.uid(), tenant_id)
    OR (public.has_role(auth.uid(), tenant_id, 'warehouse') AND public.can_access_branch(auth.uid(), tenant_id, branch_id))
  );

-- =====================================================
-- INVENTORY TRANSACTIONS
-- =====================================================
CREATE TABLE public.inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  txn_type public.inventory_txn_type NOT NULL,
  quantity NUMERIC(14,3) NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_transactions TO authenticated;
GRANT ALL ON public.inventory_transactions TO service_role;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_inv_txn_tenant ON public.inventory_transactions(tenant_id, created_at DESC);
CREATE INDEX idx_inv_txn_product ON public.inventory_transactions(product_id);
CREATE INDEX idx_inv_txn_branch ON public.inventory_transactions(branch_id);

CREATE POLICY "Members view txns in accessible branches" ON public.inventory_transactions
  FOR SELECT TO authenticated
  USING (public.can_access_branch(auth.uid(), tenant_id, branch_id));

CREATE POLICY "Warehouse and admins insert manual adjustments" ON public.inventory_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_tenant_member(auth.uid(), tenant_id)
    AND (
      public.is_tenant_admin(auth.uid(), tenant_id)
      OR (public.has_role(auth.uid(), tenant_id, 'warehouse') AND public.can_access_branch(auth.uid(), tenant_id, branch_id))
    )
  );

-- =====================================================
-- PURCHASES
-- =====================================================
CREATE TABLE public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reference TEXT,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  status public.purchase_status NOT NULL DEFAULT 'received',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_purchases_updated_at BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_purchases_tenant ON public.purchases(tenant_id, created_at DESC);

CREATE POLICY "Members view purchases in accessible branches" ON public.purchases
  FOR SELECT TO authenticated
  USING (public.can_access_branch(auth.uid(), tenant_id, branch_id));

CREATE POLICY "Warehouse and admins create purchases" ON public.purchases
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_tenant_member(auth.uid(), tenant_id)
    AND (
      public.is_tenant_admin(auth.uid(), tenant_id)
      OR (public.has_role(auth.uid(), tenant_id, 'warehouse') AND public.can_access_branch(auth.uid(), tenant_id, branch_id))
    )
  );

CREATE POLICY "Admins update/delete purchases" ON public.purchases
  FOR UPDATE TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));
CREATE POLICY "Admins delete purchases" ON public.purchases
  FOR DELETE TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id));

-- =====================================================
-- PURCHASE ITEMS
-- =====================================================
CREATE TABLE public.purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_items TO authenticated;
GRANT ALL ON public.purchase_items TO service_role;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_purchase_items_purchase ON public.purchase_items(purchase_id);
CREATE INDEX idx_purchase_items_tenant ON public.purchase_items(tenant_id);

CREATE POLICY "Members view purchase items via parent" ON public.purchase_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.purchases p
      WHERE p.id = purchase_items.purchase_id
        AND public.can_access_branch(auth.uid(), p.tenant_id, p.branch_id)
    )
  );

CREATE POLICY "Users insert items on their own purchase" ON public.purchase_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchases p
      WHERE p.id = purchase_items.purchase_id
        AND p.tenant_id = purchase_items.tenant_id
        AND (p.user_id = auth.uid() OR public.is_tenant_admin(auth.uid(), p.tenant_id))
    )
  );

CREATE POLICY "Admins manage purchase items" ON public.purchase_items
  FOR UPDATE TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));
CREATE POLICY "Admins delete purchase items" ON public.purchase_items
  FOR DELETE TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id));

-- =====================================================
-- STOCK ADJUSTMENT LOGIC
-- =====================================================
CREATE OR REPLACE FUNCTION public.apply_stock_change(
  _tenant_id uuid, _product_id uuid, _branch_id uuid, _delta numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.inventory (tenant_id, product_id, branch_id, quantity, updated_at)
  VALUES (_tenant_id, _product_id, _branch_id, _delta, now())
  ON CONFLICT (product_id, branch_id) DO UPDATE
  SET quantity = public.inventory.quantity + EXCLUDED.quantity,
      updated_at = now();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.apply_stock_change(uuid, uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;

-- Purchase item INSERT → +stock, +txn 'in'
CREATE OR REPLACE FUNCTION public.on_purchase_item_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_id uuid;
  v_user_id uuid;
BEGIN
  SELECT branch_id, user_id INTO v_branch_id, v_user_id FROM public.purchases WHERE id = NEW.purchase_id;

  PERFORM public.apply_stock_change(NEW.tenant_id, NEW.product_id, v_branch_id, NEW.quantity);

  INSERT INTO public.inventory_transactions
    (tenant_id, product_id, branch_id, user_id, txn_type, quantity, reference_type, reference_id, reason)
  VALUES
    (NEW.tenant_id, NEW.product_id, v_branch_id, v_user_id, 'in', NEW.quantity, 'purchase', NEW.purchase_id, 'دخول من مورد');

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.on_purchase_item_insert() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_purchase_item_stock
AFTER INSERT ON public.purchase_items
FOR EACH ROW EXECUTE FUNCTION public.on_purchase_item_insert();

-- Sale item INSERT → -stock, +txn 'sale'
CREATE OR REPLACE FUNCTION public.on_sale_item_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_id uuid;
  v_cashier_id uuid;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT branch_id, cashier_id INTO v_branch_id, v_cashier_id FROM public.sales WHERE id = NEW.sale_id;

  PERFORM public.apply_stock_change(NEW.tenant_id, NEW.product_id, v_branch_id, -NEW.quantity);

  INSERT INTO public.inventory_transactions
    (tenant_id, product_id, branch_id, user_id, txn_type, quantity, reference_type, reference_id, reason)
  VALUES
    (NEW.tenant_id, NEW.product_id, v_branch_id, v_cashier_id, 'sale', -NEW.quantity, 'sale', NEW.sale_id, 'خصم بيع');

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.on_sale_item_insert() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_sale_item_stock
AFTER INSERT ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.on_sale_item_insert();
