
CREATE TABLE public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_expense_cat_updated_at BEFORE UPDATE ON public.expense_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_expense_cat_tenant ON public.expense_categories(tenant_id);

-- Only accountant/owner/manager see expenses
CREATE OR REPLACE FUNCTION public.can_manage_expenses(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND tenant_id = _tenant_id
      AND role IN ('owner','manager','accountant')
  );
$$;
REVOKE EXECUTE ON FUNCTION public.can_manage_expenses(uuid, uuid) FROM PUBLIC, anon;

CREATE POLICY "Managers view expense categories" ON public.expense_categories
  FOR SELECT TO authenticated USING (public.can_manage_expenses(auth.uid(), tenant_id));
CREATE POLICY "Admins manage expense categories" ON public.expense_categories
  FOR ALL TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));

CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  description TEXT,
  attachment_url TEXT,
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_expenses_tenant_paid ON public.expenses(tenant_id, paid_at DESC);

CREATE POLICY "Managers view expenses" ON public.expenses
  FOR SELECT TO authenticated USING (public.can_manage_expenses(auth.uid(), tenant_id));
CREATE POLICY "Managers create expenses" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.can_manage_expenses(auth.uid(), tenant_id)
  );
CREATE POLICY "Managers update expenses" ON public.expenses
  FOR UPDATE TO authenticated
  USING (public.can_manage_expenses(auth.uid(), tenant_id))
  WITH CHECK (public.can_manage_expenses(auth.uid(), tenant_id));
CREATE POLICY "Admins delete expenses" ON public.expenses
  FOR DELETE TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id));
