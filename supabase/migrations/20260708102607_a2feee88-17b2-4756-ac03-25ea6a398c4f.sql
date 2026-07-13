
-- =====================================================
-- ENUMS
-- =====================================================
CREATE TYPE public.cash_session_status AS ENUM ('open', 'closed');
CREATE TYPE public.sale_status AS ENUM ('completed', 'refunded', 'void');
CREATE TYPE public.payment_method AS ENUM ('cash', 'card', 'transfer', 'mixed');

-- =====================================================
-- HELPER: user's branch (returns branch_id from user_roles for cashier scoping)
-- =====================================================
CREATE OR REPLACE FUNCTION public.user_branch_id(_user_id uuid, _tenant_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT branch_id FROM public.user_roles
  WHERE user_id = _user_id AND tenant_id = _tenant_id
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.user_branch_id(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_access_branch(_user_id uuid, _tenant_id uuid, _branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND tenant_id = _tenant_id
      AND (role IN ('owner','manager','accountant') OR branch_id = _branch_id)
  );
$$;
GRANT EXECUTE ON FUNCTION public.can_access_branch(uuid, uuid, uuid) TO authenticated;

-- =====================================================
-- CASH SESSIONS
-- =====================================================
CREATE TABLE public.cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  cashier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  closing_balance NUMERIC(12,2),
  expected_cash NUMERIC(12,2),
  cash_difference NUMERIC(12,2),
  status public.cash_session_status NOT NULL DEFAULT 'open',
  notes TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_sessions TO authenticated;
GRANT ALL ON public.cash_sessions TO service_role;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_cash_sessions_updated_at
BEFORE UPDATE ON public.cash_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_cash_sessions_tenant ON public.cash_sessions(tenant_id);
CREATE INDEX idx_cash_sessions_cashier ON public.cash_sessions(cashier_id);
CREATE INDEX idx_cash_sessions_status ON public.cash_sessions(tenant_id, status) WHERE status = 'open';

-- Only ONE open session per cashier at a time
CREATE UNIQUE INDEX ux_cash_sessions_one_open_per_cashier
  ON public.cash_sessions(cashier_id) WHERE status = 'open';

-- Policies
CREATE POLICY "Members view sessions in accessible branches" ON public.cash_sessions
  FOR SELECT TO authenticated
  USING (public.can_access_branch(auth.uid(), tenant_id, branch_id));

CREATE POLICY "Cashier opens own session" ON public.cash_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    cashier_id = auth.uid()
    AND public.is_tenant_member(auth.uid(), tenant_id)
    AND public.can_access_branch(auth.uid(), tenant_id, branch_id)
  );

CREATE POLICY "Cashier closes own session" ON public.cash_sessions
  FOR UPDATE TO authenticated
  USING (cashier_id = auth.uid() OR public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (cashier_id = auth.uid() OR public.is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Admins delete sessions" ON public.cash_sessions
  FOR DELETE TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id));

-- =====================================================
-- SALES
-- =====================================================
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  cashier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  session_id UUID REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
  invoice_no INTEGER NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  status public.sale_status NOT NULL DEFAULT 'completed',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, invoice_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_sales_updated_at
BEFORE UPDATE ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_sales_tenant_created ON public.sales(tenant_id, created_at DESC);
CREATE INDEX idx_sales_branch_created ON public.sales(branch_id, created_at DESC);
CREATE INDEX idx_sales_cashier ON public.sales(cashier_id);
CREATE INDEX idx_sales_session ON public.sales(session_id);

-- Auto-assign invoice_no per branch
CREATE OR REPLACE FUNCTION public.assign_invoice_no()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_no INTEGER;
BEGIN
  IF NEW.invoice_no IS NULL OR NEW.invoice_no = 0 THEN
    SELECT COALESCE(MAX(invoice_no), 0) + 1
      INTO next_no
      FROM public.sales
      WHERE branch_id = NEW.branch_id;
    NEW.invoice_no := next_no;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sales_invoice_no
BEFORE INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.assign_invoice_no();

-- Policies
CREATE POLICY "Members view sales in accessible branches" ON public.sales
  FOR SELECT TO authenticated
  USING (public.can_access_branch(auth.uid(), tenant_id, branch_id));

CREATE POLICY "Cashiers create sales in own branch" ON public.sales
  FOR INSERT TO authenticated
  WITH CHECK (
    cashier_id = auth.uid()
    AND public.is_tenant_member(auth.uid(), tenant_id)
    AND public.can_access_branch(auth.uid(), tenant_id, branch_id)
  );

CREATE POLICY "Admins update/refund sales" ON public.sales
  FOR UPDATE TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Admins delete sales" ON public.sales
  FOR DELETE TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id));

-- =====================================================
-- SALE ITEMS
-- =====================================================
CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_sale_items_sale ON public.sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON public.sale_items(product_id);
CREATE INDEX idx_sale_items_tenant ON public.sale_items(tenant_id);

CREATE POLICY "Members view sale items via parent" ON public.sale_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_items.sale_id
        AND public.can_access_branch(auth.uid(), s.tenant_id, s.branch_id)
    )
  );

CREATE POLICY "Cashiers insert sale items for own sale" ON public.sale_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_items.sale_id
        AND s.cashier_id = auth.uid()
        AND s.tenant_id = sale_items.tenant_id
    )
  );

CREATE POLICY "Admins update sale items" ON public.sale_items
  FOR UPDATE TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Admins delete sale items" ON public.sale_items
  FOR DELETE TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id));

-- =====================================================
-- PAYMENTS
-- =====================================================
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  method public.payment_method NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_payments_sale ON public.payments(sale_id);
CREATE INDEX idx_payments_tenant ON public.payments(tenant_id);

CREATE POLICY "Members view payments via parent" ON public.payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = payments.sale_id
        AND public.can_access_branch(auth.uid(), s.tenant_id, s.branch_id)
    )
  );

CREATE POLICY "Cashiers insert payments for own sale" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = payments.sale_id
        AND s.cashier_id = auth.uid()
        AND s.tenant_id = payments.tenant_id
    )
  );

CREATE POLICY "Admins manage payments" ON public.payments
  FOR ALL TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));
