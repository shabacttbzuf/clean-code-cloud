-- COMPLETE DATABASE REBUILD SNAPSHOT
-- Generated from the ordered Supabase migration chain in this repository.
-- IMPORTANT:
-- 1) This file is for a completely EMPTY Supabase database only.
-- 2) Preferred/recommended deployment is: supabase db push (uses the individual
--    files in supabase/migrations and records migration history correctly).
-- 3) If this snapshot is executed manually in the SQL Editor, DO NOT later run
--    supabase db push against the same database unless migration history has
--    been reconciled deliberately.
-- 4) This is a generated snapshot, not an incremental migration.
-- 5) Historical source files remain authoritative and are not modified.



-- =====================================================================
-- SOURCE MIGRATION: 20260708094803_0abf76e5-e999-489c-9f9f-af2ec48c2447.sql
-- =====================================================================


-- =====================================================
-- ENUMS
-- =====================================================
CREATE TYPE public.app_role AS ENUM (
  'owner', 'manager', 'accountant', 'cashier', 'warehouse', 'waiter'
);

-- =====================================================
-- HELPER: updated_at trigger fn
-- =====================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =====================================================
-- TENANTS
-- =====================================================
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  currency TEXT NOT NULL DEFAULT 'SAR',
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 15.00,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_tenants_updated_at
BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================
-- PROFILES
-- =====================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  branch_id UUID,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================
-- USER ROLES (separate table for security)
-- =====================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  branch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- SECURITY DEFINER HELPERS (prevent RLS recursion)
-- =====================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _tenant_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND tenant_id = _tenant_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND tenant_id = _tenant_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND tenant_id = _tenant_id AND role IN ('owner','manager')
  );
$$;

-- =====================================================
-- BRANCHES
-- =====================================================
CREATE TABLE public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  tax_number TEXT,
  currency TEXT NOT NULL DEFAULT 'SAR',
  logo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_branches_updated_at
BEFORE UPDATE ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_branches_tenant ON public.branches(tenant_id);

-- =====================================================
-- CATEGORIES
-- =====================================================
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_categories_updated_at
BEFORE UPDATE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_categories_tenant ON public.categories(tenant_id);

-- =====================================================
-- PRODUCTS
-- =====================================================
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  sku TEXT,
  image_url TEXT,
  cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  sale_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'piece',
  min_stock NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_products_tenant ON public.products(tenant_id);
CREATE INDEX idx_products_category ON public.products(category_id);

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- tenants: members can read, owner can update, anyone authenticated can insert (during onboarding)
CREATE POLICY "Members can view their tenant" ON public.tenants
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), id) OR owner_id = auth.uid());

CREATE POLICY "Authenticated can create tenant" ON public.tenants
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner can update tenant" ON public.tenants
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), id, 'owner'))
  WITH CHECK (public.has_role(auth.uid(), id, 'owner'));

CREATE POLICY "Owner can delete tenant" ON public.tenants
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- profiles: user can see own profile; tenant admins can see tenant profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Tenant admins can view tenant profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (tenant_id IS NOT NULL AND public.is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Tenant admins can update tenant profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (tenant_id IS NOT NULL AND public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (tenant_id IS NOT NULL AND public.is_tenant_admin(auth.uid(), tenant_id));

-- user_roles: user sees own roles; admins see tenant roles; only owner mutates
CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Tenant admins view tenant roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id));

CREATE POLICY "Owner manages roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), tenant_id, 'owner'))
  WITH CHECK (public.has_role(auth.uid(), tenant_id, 'owner'));

-- Allow a user to bootstrap themselves as owner when creating a tenant
CREATE POLICY "User bootstraps own owner role" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND role = 'owner');

-- branches
CREATE POLICY "Tenant members view branches" ON public.branches
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins manage branches" ON public.branches
  FOR ALL TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));

-- categories
CREATE POLICY "Tenant members view categories" ON public.categories
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins manage categories" ON public.categories
  FOR ALL TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));

-- products
CREATE POLICY "Tenant members view products" ON public.products
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(auth.uid(), tenant_id));

CREATE POLICY "Tenant admins manage products" ON public.products
  FOR ALL TO authenticated
  USING (public.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (public.is_tenant_admin(auth.uid(), tenant_id));

-- =====================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- =====================================================================
-- SOURCE MIGRATION: 20260708094827_ba868018-6233-4a11-b86d-ec87b34d165f.sql
-- =====================================================================


REVOKE EXECUTE ON FUNCTION public.has_role(UUID, UUID, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_tenant_admin(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;


-- =====================================================================
-- SOURCE MIGRATION: 20260708094855_2d42d4d3-974b-41f1-a822-d4af29ba3fa4.sql
-- =====================================================================


-- Storage policies for restaurant-assets bucket
-- Path convention: {tenant_id}/{...}

CREATE POLICY "Tenant members read their assets"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'restaurant-assets'
  AND public.is_tenant_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Tenant admins upload assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'restaurant-assets'
  AND public.is_tenant_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Tenant admins update assets"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'restaurant-assets'
  AND public.is_tenant_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Tenant admins delete assets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'restaurant-assets'
  AND public.is_tenant_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
);


-- =====================================================================
-- SOURCE MIGRATION: 20260708095952_8c2590f8-b111-43db-9c5b-240523fb0b88.sql
-- =====================================================================


GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;

GRANT ALL ON public.tenants TO service_role;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.user_roles TO service_role;
GRANT ALL ON public.branches TO service_role;
GRANT ALL ON public.categories TO service_role;
GRANT ALL ON public.products TO service_role;


-- =====================================================================
-- SOURCE MIGRATION: 20260708100059_a041ad16-4ef9-4902-9c28-f630f405cf7b.sql
-- =====================================================================


GRANT EXECUTE ON FUNCTION public.has_role(UUID, UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin(UUID, UUID) TO authenticated;


-- =====================================================================
-- SOURCE MIGRATION: 20260708102607_a2feee88-17b2-4756-ac03-25ea6a398c4f.sql
-- =====================================================================


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


-- =====================================================================
-- SOURCE MIGRATION: 20260708102622_4a6a58b6-aaf2-4cc7-81c1-7ed10d9f7d49.sql
-- =====================================================================


REVOKE EXECUTE ON FUNCTION public.user_branch_id(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_branch(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assign_invoice_no() FROM PUBLIC, anon, authenticated;


-- =====================================================================
-- SOURCE MIGRATION: 20260708103031_793d9cf8-044c-4a1c-b9c4-3552cfb05eb5.sql
-- =====================================================================


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


-- =====================================================================
-- SOURCE MIGRATION: 20260708103319_4726725b-f908-4f4d-b4a9-483be8635d1c.sql
-- =====================================================================


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


-- =====================================================================
-- SOURCE MIGRATION: 20260708114937_16c34a95-ccdb-437c-a98a-430f2b57fed2.sql
-- =====================================================================


-- 1) Fix privilege escalation on user_roles bootstrap policy
DROP POLICY IF EXISTS "User bootstraps own owner role" ON public.user_roles;
CREATE POLICY "User bootstraps own owner role"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'::app_role
    AND EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = user_roles.tenant_id
        AND t.owner_id = auth.uid()
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.tenant_id = user_roles.tenant_id
        AND ur.role = 'owner'::app_role
        AND ur.user_id <> auth.uid()
    )
  );

-- 2) Revoke EXECUTE from PUBLIC and anon on all SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_tenant_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_tenant_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_branch(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_expenses(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_branch_id(uuid, uuid) FROM PUBLIC, anon;

-- Ensure authenticated retains EXECUTE (needed inside RLS policy evaluation)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_branch(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_expenses(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_branch_id(uuid, uuid) TO authenticated;

-- 3) Trigger-only functions: revoke EXECUTE from everyone except owner/service_role.
-- Triggers execute under table-owner privileges regardless of client grants.
REVOKE EXECUTE ON FUNCTION public.apply_stock_change(uuid, uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_invoice_no() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_purchase_item_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_sale_item_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;


-- =====================================================================
-- SOURCE MIGRATION: 20260708115005_d3758a2a-cb16-420a-8b5b-434296fffdee.sql
-- =====================================================================


-- Create an internal schema that is NOT exposed by the Data API
CREATE SCHEMA IF NOT EXISTS private;

-- Allow authenticated to use the schema (needed so RLS can call the functions)
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- Move RLS helper functions out of the exposed 'public' schema.
-- Policies reference functions by OID, so they follow the function automatically.
ALTER FUNCTION public.has_role(uuid, uuid, app_role) SET SCHEMA private;
ALTER FUNCTION public.is_tenant_admin(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.is_tenant_member(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.can_access_branch(uuid, uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.can_manage_expenses(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.user_branch_id(uuid, uuid) SET SCHEMA private;

-- Keep search_path clean now that they live in a different schema
ALTER FUNCTION private.has_role(uuid, uuid, app_role) SET search_path = public, private;
ALTER FUNCTION private.is_tenant_admin(uuid, uuid) SET search_path = public, private;
ALTER FUNCTION private.is_tenant_member(uuid, uuid) SET search_path = public, private;
ALTER FUNCTION private.can_access_branch(uuid, uuid, uuid) SET search_path = public, private;
ALTER FUNCTION private.can_manage_expenses(uuid, uuid) SET search_path = public, private;
ALTER FUNCTION private.user_branch_id(uuid, uuid) SET search_path = public, private;

-- Ensure only the roles that need it can execute
REVOKE EXECUTE ON FUNCTION private.has_role(uuid, uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.is_tenant_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.is_tenant_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.can_access_branch(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.can_manage_expenses(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.user_branch_id(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.has_role(uuid, uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_tenant_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_tenant_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_branch(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_expenses(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.user_branch_id(uuid, uuid) TO authenticated;


-- =====================================================================
-- SOURCE MIGRATION: 20260708121532_63109e4a-4999-48fa-ba26-c9c6968a0477.sql
-- =====================================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'kitchen';

-- =====================================================================
-- SOURCE MIGRATION: 20260708121621_9e9eb7c7-2705-4c85-9804-140bbf71e04d.sql
-- =====================================================================


-- 1. Super Owners table
CREATE TABLE IF NOT EXISTS public.super_owners (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text
);
GRANT SELECT ON public.super_owners TO authenticated;
GRANT ALL ON public.super_owners TO service_role;
ALTER TABLE public.super_owners ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_super_owner(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.super_owners WHERE user_id = _user_id);
$$;
REVOKE EXECUTE ON FUNCTION public.is_super_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_owner(uuid) TO authenticated, service_role;

CREATE POLICY "View super owners" ON public.super_owners
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Grant super owner" ON public.super_owners
  FOR INSERT TO authenticated WITH CHECK (public.is_super_owner(auth.uid()));
CREATE POLICY "Revoke super owner" ON public.super_owners
  FOR DELETE TO authenticated
  USING (public.is_super_owner(auth.uid()) AND user_id <> auth.uid());

-- 2. Permissions catalog
CREATE TABLE IF NOT EXISTS public.permissions (
  key text PRIMARY KEY,
  label_ar text NOT NULL,
  label_en text NOT NULL,
  category text NOT NULL,
  description text
);
GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View permissions" ON public.permissions
  FOR SELECT TO authenticated USING (true);

-- 3. Custom roles
CREATE TABLE IF NOT EXISTS public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_roles TO authenticated;
GRANT ALL ON public.custom_roles TO service_role;
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view custom roles" ON public.custom_roles
  FOR SELECT TO authenticated
  USING (private.is_tenant_member(auth.uid(), tenant_id) OR public.is_super_owner(auth.uid()));
CREATE POLICY "Owners manage custom roles" ON public.custom_roles
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), tenant_id, 'owner') OR public.is_super_owner(auth.uid()))
  WITH CHECK (private.has_role(auth.uid(), tenant_id, 'owner') OR public.is_super_owner(auth.uid()));
CREATE TRIGGER trg_custom_roles_updated_at
  BEFORE UPDATE ON public.custom_roles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Role Permissions
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  role_kind text NOT NULL CHECK (role_kind IN ('builtin','custom')),
  builtin_role app_role,
  custom_role_id uuid REFERENCES public.custom_roles(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (role_kind='builtin' AND builtin_role IS NOT NULL AND custom_role_id IS NULL) OR
    (role_kind='custom'  AND custom_role_id IS NOT NULL AND builtin_role IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_builtin_uk
  ON public.role_permissions (COALESCE(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid), builtin_role, permission_key)
  WHERE role_kind = 'builtin';
CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_custom_uk
  ON public.role_permissions (tenant_id, custom_role_id, permission_key)
  WHERE role_kind = 'custom';

GRANT SELECT, INSERT, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View role permissions" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert role permissions" ON public.role_permissions
  FOR INSERT TO authenticated WITH CHECK (
    public.is_super_owner(auth.uid()) OR
    (tenant_id IS NOT NULL AND private.has_role(auth.uid(), tenant_id, 'owner'))
  );
CREATE POLICY "Delete role permissions" ON public.role_permissions
  FOR DELETE TO authenticated USING (
    public.is_super_owner(auth.uid()) OR
    (tenant_id IS NOT NULL AND private.has_role(auth.uid(), tenant_id, 'owner'))
  );

-- 5. has_permission function
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _tenant_id uuid, _permission_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_super_owner(_user_id) OR
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.role_permissions rp
        ON rp.builtin_role = ur.role AND rp.role_kind = 'builtin'
       AND (rp.tenant_id = _tenant_id OR rp.tenant_id IS NULL)
      WHERE ur.user_id = _user_id AND ur.tenant_id = _tenant_id
        AND rp.permission_key = _permission_key
    );
$$;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid,uuid,text) TO authenticated, service_role;

-- 6. Super owner extended policies on core tables
CREATE POLICY "Super owner all roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_super_owner(auth.uid()))
  WITH CHECK (public.is_super_owner(auth.uid()));

CREATE POLICY "Super owner view tenants" ON public.tenants
  FOR SELECT TO authenticated USING (public.is_super_owner(auth.uid()));
CREATE POLICY "Super owner update tenants" ON public.tenants
  FOR UPDATE TO authenticated
  USING (public.is_super_owner(auth.uid()))
  WITH CHECK (public.is_super_owner(auth.uid()));

CREATE POLICY "Super owner view profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_super_owner(auth.uid()));
CREATE POLICY "Super owner update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_super_owner(auth.uid()))
  WITH CHECK (public.is_super_owner(auth.uid()));

-- 7. Seed permissions
INSERT INTO public.permissions (key, label_ar, label_en, category) VALUES
  ('branches.view','عرض الفروع','View branches','branches'),
  ('branches.manage','إدارة الفروع','Manage branches','branches'),
  ('users.view','عرض المستخدمين','View users','users'),
  ('users.manage','إدارة المستخدمين','Manage users','users'),
  ('users.change_password','تغيير كلمات المرور','Change passwords','users'),
  ('products.view','عرض المنتجات','View products','catalog'),
  ('products.manage','إدارة المنتجات','Manage products','catalog'),
  ('categories.manage','إدارة الأقسام','Manage categories','catalog'),
  ('pos.use','استخدام نقطة البيع','Use POS','sales'),
  ('sales.view','عرض الفواتير','View sales','sales'),
  ('sales.refund','استرجاع فاتورة','Refund sales','sales'),
  ('cash.open_close','فتح/إغلاق الصندوق','Open/close cash','sales'),
  ('inventory.view','عرض المخزون','View inventory','inventory'),
  ('inventory.adjust','تعديل المخزون','Adjust inventory','inventory'),
  ('suppliers.manage','إدارة الموردين','Manage suppliers','inventory'),
  ('purchases.manage','إدارة المشتريات','Manage purchases','inventory'),
  ('customers.manage','إدارة العملاء','Manage customers','crm'),
  ('expenses.view','عرض المصروفات','View expenses','finance'),
  ('expenses.manage','إدارة المصروفات','Manage expenses','finance'),
  ('reports.view','عرض التقارير','View reports','reports'),
  ('reports.export','تصدير التقارير','Export reports','reports'),
  ('audit.view','عرض سجل العمليات','View audit log','system'),
  ('kitchen.view','عرض طلبات المطبخ','View kitchen','operations'),
  ('waiter.orders','إدارة طلبات النادل','Manage waiter orders','operations')
ON CONFLICT (key) DO NOTHING;

-- 8. Seed default role -> permissions (global defaults with tenant_id NULL)
INSERT INTO public.role_permissions (tenant_id, role_kind, builtin_role, permission_key)
SELECT NULL, 'builtin', 'owner'::app_role, key FROM public.permissions
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (tenant_id, role_kind, builtin_role, permission_key)
SELECT NULL, 'builtin', 'manager'::app_role, key FROM public.permissions
WHERE key NOT IN ('users.change_password','audit.view')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (tenant_id, role_kind, builtin_role, permission_key) VALUES
  (NULL,'builtin','cashier','pos.use'),
  (NULL,'builtin','cashier','sales.view'),
  (NULL,'builtin','cashier','cash.open_close'),
  (NULL,'builtin','cashier','products.view'),
  (NULL,'builtin','cashier','customers.manage'),
  (NULL,'builtin','accountant','sales.view'),
  (NULL,'builtin','accountant','expenses.view'),
  (NULL,'builtin','accountant','expenses.manage'),
  (NULL,'builtin','accountant','reports.view'),
  (NULL,'builtin','accountant','reports.export'),
  (NULL,'builtin','accountant','inventory.view'),
  (NULL,'builtin','warehouse','inventory.view'),
  (NULL,'builtin','warehouse','inventory.adjust'),
  (NULL,'builtin','warehouse','suppliers.manage'),
  (NULL,'builtin','warehouse','purchases.manage'),
  (NULL,'builtin','warehouse','products.view'),
  (NULL,'builtin','waiter','waiter.orders'),
  (NULL,'builtin','waiter','products.view'),
  (NULL,'builtin','waiter','customers.manage'),
  (NULL,'builtin','kitchen','kitchen.view')
ON CONFLICT DO NOTHING;


-- =====================================================================
-- SOURCE MIGRATION: 20260708122804_4488bafc-2277-466d-8627-9a82d5e82e32.sql
-- =====================================================================

-- Extend profiles table with new fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- Unique username (case-insensitive) when set
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

-- Super owner sees/edits everything
DROP POLICY IF EXISTS "super_owner_all_profiles" ON public.profiles;
CREATE POLICY "super_owner_all_profiles"
  ON public.profiles
  FOR ALL
  TO authenticated
  USING (public.is_super_owner(auth.uid()))
  WITH CHECK (public.is_super_owner(auth.uid()));

-- Tenant owner/manager: read & update profiles of users in same tenant
DROP POLICY IF EXISTS "tenant_admin_read_profiles" ON public.profiles;
CREATE POLICY "tenant_admin_read_profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.tenant_id = public.profiles.tenant_id
        AND ur.role IN ('owner','manager')
    )
  );

DROP POLICY IF EXISTS "tenant_admin_update_profiles" ON public.profiles;
CREATE POLICY "tenant_admin_update_profiles"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.tenant_id = public.profiles.tenant_id
        AND ur.role IN ('owner','manager')
    )
  )
  WITH CHECK (
    tenant_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.tenant_id = public.profiles.tenant_id
        AND ur.role IN ('owner','manager')
    )
  );

-- Function to update last_login_at (callable via RPC by authenticated user for themselves)
CREATE OR REPLACE FUNCTION public.touch_last_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET last_login_at = now() WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_last_login() TO authenticated;

-- =====================================================================
-- SOURCE MIGRATION: 20260708132855_24cda317-e651-4e4d-96e6-aa91149d44c8.sql
-- =====================================================================


-- Phase 3: Catalog extensions + customers table

-- BRANCHES
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS working_hours jsonb,
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- CATEGORIES
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- PRODUCTS
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gallery_urls text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ingredients text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS size text,
  ADD COLUMN IF NOT EXISTS addons jsonb;

-- SUPPLIERS
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS logo_url text;

-- CUSTOMERS
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  avatar_url text,
  address text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members view customers" ON public.customers;
CREATE POLICY "Tenant members view customers" ON public.customers
  FOR SELECT TO authenticated
  USING (private.is_tenant_member(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "Tenant admins manage customers" ON public.customers;
CREATE POLICY "Tenant admins manage customers" ON public.customers
  FOR ALL TO authenticated
  USING (private.is_tenant_admin(auth.uid(), tenant_id))
  WITH CHECK (private.is_tenant_admin(auth.uid(), tenant_id));

DROP TRIGGER IF EXISTS trg_customers_updated ON public.customers;
CREATE TRIGGER trg_customers_updated
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_customers_tenant ON public.customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);


-- =====================================================================
-- SOURCE MIGRATION: 20260708141902_50aeceea-6624-4c01-9c18-59b23a39f358.sql
-- =====================================================================


-- Audit logs table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  user_id UUID,
  action TEXT NOT NULL, -- INSERT | UPDATE | DELETE
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  changes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_tenant ON public.audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select" ON public.audit_logs
FOR SELECT TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.tenant_id = audit_logs.tenant_id
      AND ur.role IN ('owner','manager')
  )
);

CREATE POLICY "audit_logs_insert" ON public.audit_logs
FOR INSERT TO authenticated WITH CHECK (true);

-- Generic trigger fn
CREATE OR REPLACE FUNCTION public.log_audit_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
  v_entity_id TEXT;
  v_changes JSONB;
  v_user UUID := auth.uid();
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_tenant := (to_jsonb(OLD)->>'tenant_id')::UUID;
    v_entity_id := (to_jsonb(OLD)->>'id');
    v_changes := jsonb_build_object('before', to_jsonb(OLD));
  ELSIF TG_OP = 'INSERT' THEN
    v_tenant := (to_jsonb(NEW)->>'tenant_id')::UUID;
    v_entity_id := (to_jsonb(NEW)->>'id');
    v_changes := jsonb_build_object('after', to_jsonb(NEW));
  ELSE
    v_tenant := (to_jsonb(NEW)->>'tenant_id')::UUID;
    v_entity_id := (to_jsonb(NEW)->>'id');
    v_changes := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
  END IF;

  INSERT INTO public.audit_logs(tenant_id, user_id, action, entity_type, entity_id, changes)
  VALUES (v_tenant, v_user, TG_OP, TG_TABLE_NAME, v_entity_id, v_changes);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach triggers to sensitive tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products','branches','categories','suppliers','customers',
    'expenses','purchases','sales','user_roles','tenants'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON public.%1$s', t);
    EXECUTE format(
      'CREATE TRIGGER trg_audit_%1$s
       AFTER INSERT OR UPDATE OR DELETE ON public.%1$s
       FOR EACH ROW EXECUTE FUNCTION public.log_audit_change()', t);
  END LOOP;
END $$;


-- =====================================================================
-- SOURCE MIGRATION: 20260708142949_ceaaa981-625e-4dcc-a9ae-70db885a420d.sql
-- =====================================================================


-- 1. hired_by tracking
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS hired_by uuid;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hired_by uuid;

-- 2. user_permission_overrides
CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  permission_key TEXT NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT true,
  granted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_upo_tenant_user ON public.user_permission_overrides(tenant_id, user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permission_overrides TO authenticated;
GRANT ALL ON public.user_permission_overrides TO service_role;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

-- Helper: does _user_id have any of these roles in _tenant_id?
CREATE OR REPLACE FUNCTION public.user_has_role_in_tenant(_user_id uuid, _tenant_id uuid, _roles text[])
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND tenant_id = _tenant_id
      AND role::text = ANY(_roles)
  );
$$;

-- Helper: was _target hired by _actor inside _tenant_id?
CREATE OR REPLACE FUNCTION public.was_hired_by(_target uuid, _actor uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _target AND tenant_id = _tenant_id AND hired_by = _actor
  );
$$;

-- SELECT policy
DROP POLICY IF EXISTS "upo_select" ON public.user_permission_overrides;
CREATE POLICY "upo_select" ON public.user_permission_overrides
FOR SELECT TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR user_id = auth.uid()
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner'])
  OR (
    public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['manager'])
    AND public.was_hired_by(user_id, auth.uid(), tenant_id)
  )
);

-- INSERT policy
DROP POLICY IF EXISTS "upo_insert" ON public.user_permission_overrides;
CREATE POLICY "upo_insert" ON public.user_permission_overrides
FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_owner(auth.uid())
  OR (
    public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner'])
    AND NOT public.user_has_role_in_tenant(user_id, tenant_id, ARRAY['owner'])
    AND (
      public.user_has_role_in_tenant(user_id, tenant_id, ARRAY['manager'])
      OR public.was_hired_by(user_id, auth.uid(), tenant_id)
    )
  )
  OR (
    public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['manager'])
    AND public.was_hired_by(user_id, auth.uid(), tenant_id)
  )
);

-- UPDATE policy
DROP POLICY IF EXISTS "upo_update" ON public.user_permission_overrides;
CREATE POLICY "upo_update" ON public.user_permission_overrides
FOR UPDATE TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR (
    public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner'])
    AND NOT public.user_has_role_in_tenant(user_id, tenant_id, ARRAY['owner'])
    AND (
      public.user_has_role_in_tenant(user_id, tenant_id, ARRAY['manager'])
      OR public.was_hired_by(user_id, auth.uid(), tenant_id)
    )
  )
  OR (
    public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['manager'])
    AND public.was_hired_by(user_id, auth.uid(), tenant_id)
  )
);

-- DELETE policy
DROP POLICY IF EXISTS "upo_delete" ON public.user_permission_overrides;
CREATE POLICY "upo_delete" ON public.user_permission_overrides
FOR DELETE TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR (
    public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner'])
    AND NOT public.user_has_role_in_tenant(user_id, tenant_id, ARRAY['owner'])
    AND (
      public.user_has_role_in_tenant(user_id, tenant_id, ARRAY['manager'])
      OR public.was_hired_by(user_id, auth.uid(), tenant_id)
    )
  )
  OR (
    public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['manager'])
    AND public.was_hired_by(user_id, auth.uid(), tenant_id)
  )
);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_upo_updated_at ON public.user_permission_overrides;
CREATE TRIGGER trg_upo_updated_at BEFORE UPDATE ON public.user_permission_overrides
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Update has_permission() to honor overrides
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _tenant_id uuid, _permission_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_override boolean;
BEGIN
  IF public.is_super_owner(_user_id) THEN
    RETURN true;
  END IF;

  SELECT granted INTO v_override
  FROM public.user_permission_overrides
  WHERE user_id = _user_id AND tenant_id = _tenant_id AND permission_key = _permission_key
  LIMIT 1;

  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.role_permissions rp
      ON rp.builtin_role = ur.role AND rp.role_kind = 'builtin'
     AND (rp.tenant_id = _tenant_id OR rp.tenant_id IS NULL)
    WHERE ur.user_id = _user_id AND ur.tenant_id = _tenant_id
      AND rp.permission_key = _permission_key
  );
END;
$$;


-- =====================================================================
-- SOURCE MIGRATION: 20260708154516_12f5c89f-0f7d-4cb2-a3e5-89ac8612169c.sql
-- =====================================================================


-- =========================================================
-- HR / Payroll system
-- =========================================================

-- Employees ------------------------------------------------
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  employee_no TEXT,
  full_name TEXT NOT NULL,
  job_title TEXT,
  department TEXT,
  phone TEXT,
  email TEXT,
  national_id TEXT,
  hire_date DATE NOT NULL DEFAULT CURRENT_DATE,
  contract_type TEXT NOT NULL DEFAULT 'full_time' CHECK (contract_type IN ('full_time','part_time','contract','hourly')),
  base_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  bank_name TEXT,
  bank_account TEXT,
  emergency_contact TEXT,
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','terminated')),
  termination_date DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, employee_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employees_read" ON public.employees FOR SELECT TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner'])
  OR (public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['manager','accountant']) AND (branch_id IS NULL OR branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())))
  OR user_id = auth.uid()
);
CREATE POLICY "employees_write" ON public.employees FOR ALL TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner'])
  OR (public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['manager']) AND (branch_id IS NULL OR branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())))
)
WITH CHECK (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner'])
  OR (public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['manager']) AND (branch_id IS NULL OR branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())))
);

CREATE TRIGGER employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_employees_tenant ON public.employees(tenant_id);
CREATE INDEX idx_employees_branch ON public.employees(branch_id);
CREATE INDEX idx_employees_user ON public.employees(user_id);

-- Leave types ---------------------------------------------
CREATE TABLE public.leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  days_per_year INTEGER NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT true,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  color TEXT DEFAULT '#3b82f6',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_types TO authenticated;
GRANT ALL ON public.leave_types TO service_role;
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leave_types_read" ON public.leave_types FOR SELECT TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND tenant_id = leave_types.tenant_id)
);
CREATE POLICY "leave_types_write" ON public.leave_types FOR ALL TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])
) WITH CHECK (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])
);
CREATE TRIGGER leave_types_updated_at BEFORE UPDATE ON public.leave_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Leave requests ------------------------------------------
CREATE TABLE public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type_id UUID REFERENCES public.leave_types(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_count NUMERIC(5,2) NOT NULL DEFAULT 1,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_requests TO authenticated;
GRANT ALL ON public.leave_requests TO service_role;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leave_requests_read" ON public.leave_requests FOR SELECT TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager','accountant'])
  OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = leave_requests.employee_id AND e.user_id = auth.uid())
);
CREATE POLICY "leave_requests_write" ON public.leave_requests FOR ALL TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])
  OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = leave_requests.employee_id AND e.user_id = auth.uid() AND leave_requests.status = 'pending')
) WITH CHECK (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])
  OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = leave_requests.employee_id AND e.user_id = auth.uid())
);
CREATE TRIGGER leave_requests_updated_at BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_leave_requests_employee ON public.leave_requests(employee_id);
CREATE INDEX idx_leave_requests_tenant_status ON public.leave_requests(tenant_id, status);

-- Attendance ----------------------------------------------
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  hours_worked NUMERIC(6,2) NOT NULL DEFAULT 0,
  is_late BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','leave','holiday','half_day')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_read" ON public.attendance FOR SELECT TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager','accountant'])
  OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = attendance.employee_id AND e.user_id = auth.uid())
);
CREATE POLICY "attendance_write" ON public.attendance FOR ALL TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])
) WITH CHECK (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])
);
CREATE TRIGGER attendance_updated_at BEFORE UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_attendance_employee_date ON public.attendance(employee_id, date DESC);

-- Bonuses -------------------------------------------------
CREATE TABLE public.bonuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  reason TEXT,
  bonus_type TEXT NOT NULL DEFAULT 'other' CHECK (bonus_type IN ('performance','eid','annual','overtime','other')),
  applied_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payroll_item_id UUID,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bonuses TO authenticated;
GRANT ALL ON public.bonuses TO service_role;
ALTER TABLE public.bonuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bonuses_read" ON public.bonuses FOR SELECT TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager','accountant'])
  OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = bonuses.employee_id AND e.user_id = auth.uid())
);
CREATE POLICY "bonuses_write" ON public.bonuses FOR ALL TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])
) WITH CHECK (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])
);
CREATE TRIGGER bonuses_updated_at BEFORE UPDATE ON public.bonuses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_bonuses_employee ON public.bonuses(employee_id);

-- Deductions ----------------------------------------------
CREATE TABLE public.deductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  reason TEXT,
  deduction_type TEXT NOT NULL DEFAULT 'other' CHECK (deduction_type IN ('absence','late','advance','insurance','loan','other')),
  applied_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payroll_item_id UUID,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deductions TO authenticated;
GRANT ALL ON public.deductions TO service_role;
ALTER TABLE public.deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deductions_read" ON public.deductions FOR SELECT TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager','accountant'])
  OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = deductions.employee_id AND e.user_id = auth.uid())
);
CREATE POLICY "deductions_write" ON public.deductions FOR ALL TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])
) WITH CHECK (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])
);
CREATE TRIGGER deductions_updated_at BEFORE UPDATE ON public.deductions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_deductions_employee ON public.deductions(employee_id);

-- Payroll runs --------------------------------------------
CREATE TABLE public.payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year INTEGER NOT NULL CHECK (period_year BETWEEN 2020 AND 2100),
  total_gross NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_bonuses NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_deductions NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_net NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid','cancelled')),
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, branch_id, period_year, period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_runs TO authenticated;
GRANT ALL ON public.payroll_runs TO service_role;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_runs_read" ON public.payroll_runs FOR SELECT TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','accountant'])
  OR (public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['manager']) AND (branch_id IS NULL OR branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())))
);
CREATE POLICY "payroll_runs_write" ON public.payroll_runs FOR ALL TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner'])
  OR (public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['manager']) AND (branch_id IS NULL OR branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())))
) WITH CHECK (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner'])
  OR (public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['manager']) AND (branch_id IS NULL OR branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())))
);
CREATE TRIGGER payroll_runs_updated_at BEFORE UPDATE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Payroll items -------------------------------------------
CREATE TABLE public.payroll_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payroll_run_id UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  base_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  bonuses_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  deductions_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  overtime_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  gross NUMERIC(12,2) NOT NULL DEFAULT 0,
  net NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(payroll_run_id, employee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_items TO authenticated;
GRANT ALL ON public.payroll_items TO service_role;
ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_items_read" ON public.payroll_items FOR SELECT TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager','accountant'])
  OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = payroll_items.employee_id AND e.user_id = auth.uid())
);
CREATE POLICY "payroll_items_write" ON public.payroll_items FOR ALL TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])
) WITH CHECK (
  public.is_super_owner(auth.uid())
  OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])
);
CREATE TRIGGER payroll_items_updated_at BEFORE UPDATE ON public.payroll_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_payroll_items_run ON public.payroll_items(payroll_run_id);

-- Add FK from bonuses/deductions.payroll_item_id ----------
ALTER TABLE public.bonuses ADD CONSTRAINT bonuses_payroll_item_fk FOREIGN KEY (payroll_item_id) REFERENCES public.payroll_items(id) ON DELETE SET NULL;
ALTER TABLE public.deductions ADD CONSTRAINT deductions_payroll_item_fk FOREIGN KEY (payroll_item_id) REFERENCES public.payroll_items(id) ON DELETE SET NULL;

-- Audit triggers on new HR tables -------------------------
CREATE TRIGGER audit_employees AFTER INSERT OR UPDATE OR DELETE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
CREATE TRIGGER audit_payroll_runs AFTER INSERT OR UPDATE OR DELETE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
CREATE TRIGGER audit_leave_requests AFTER INSERT OR UPDATE OR DELETE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
CREATE TRIGGER audit_bonuses AFTER INSERT OR UPDATE OR DELETE ON public.bonuses FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
CREATE TRIGGER audit_deductions AFTER INSERT OR UPDATE OR DELETE ON public.deductions FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();

-- Permissions catalog additions ---------------------------
INSERT INTO public.permissions(key, label_ar, label_en, category) VALUES
  ('hr.view', 'عرض الموارد البشرية', 'View HR', 'hr'),
  ('hr.manage', 'إدارة الموارد البشرية', 'Manage HR', 'hr'),
  ('leaves.approve', 'اعتماد الإجازات', 'Approve leaves', 'hr'),
  ('payroll.run', 'تشغيل الرواتب', 'Run payroll', 'payroll'),
  ('payroll.approve', 'اعتماد الرواتب', 'Approve payroll', 'payroll')
ON CONFLICT (key) DO NOTHING;

-- Wire defaults to builtin roles --------------------------
INSERT INTO public.role_permissions(role_kind, builtin_role, permission_key, tenant_id) VALUES
  ('builtin', 'owner', 'hr.view', NULL),
  ('builtin', 'owner', 'hr.manage', NULL),
  ('builtin', 'owner', 'leaves.approve', NULL),
  ('builtin', 'owner', 'payroll.run', NULL),
  ('builtin', 'owner', 'payroll.approve', NULL),
  ('builtin', 'manager', 'hr.view', NULL),
  ('builtin', 'manager', 'hr.manage', NULL),
  ('builtin', 'manager', 'leaves.approve', NULL),
  ('builtin', 'manager', 'payroll.run', NULL),
  ('builtin', 'accountant', 'hr.view', NULL),
  ('builtin', 'accountant', 'payroll.run', NULL)
ON CONFLICT DO NOTHING;


-- =====================================================================
-- SOURCE MIGRATION: 20260713042737_a94617b9-318b-412a-85c3-7a9fad166275.sql
-- =====================================================================


-- Attendance: prepare for richer statuses + biometric integration
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS device_id TEXT,
  ADD COLUMN IF NOT EXISTS biometric_ref TEXT,
  ADD COLUMN IF NOT EXISTS late_minutes NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS early_leave_minutes NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC(6,2) DEFAULT 0;

-- Employees: salary type + auto-derived rates + schedule
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS salary_type TEXT DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS daily_salary NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS hourly_salary NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS working_hours_per_day NUMERIC(4,2) DEFAULT 8,
  ADD COLUMN IF NOT EXISTS working_days_per_month INTEGER DEFAULT 26,
  ADD COLUMN IF NOT EXISTS work_schedule JSONB;

-- Payroll items: enterprise breakdown
ALTER TABLE public.payroll_items
  ADD COLUMN IF NOT EXISTS working_hours NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attendance_days NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS incentives_total NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS absence_deduction NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_deduction NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS holidays_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leave_days INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_rate NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(12,2);

-- Payroll runs: reject reason
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID;


-- =====================================================================
-- SOURCE MIGRATION: 20260713052537_47658ce2-66b0-4b5a-8503-949464409d3c.sql
-- =====================================================================


-- Release 1.2 — Enterprise User Management (additive, backward compatible)

-- 1) account_status enum
DO $$ BEGIN
  CREATE TYPE public.account_status AS ENUM ('active','suspended','frozen','pending_approval','password_expired','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Extend profiles (all nullable / safe defaults)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_no TEXT,
  ADD COLUMN IF NOT EXISTS national_id TEXT,
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS department_id UUID,
  ADD COLUMN IF NOT EXISTS company_id UUID,
  ADD COLUMN IF NOT EXISTS employment_date DATE,
  ADD COLUMN IF NOT EXISTS status public.account_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_ip TEXT,
  ADD COLUMN IF NOT EXISTS last_device TEXT,
  ADD COLUMN IF NOT EXISTS last_user_agent TEXT,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- 3) Extend branches
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- 4) Extend user_roles
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS department_id UUID,
  ADD COLUMN IF NOT EXISTS company_id UUID;

-- 5) Tenants — password policy
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS password_max_age_days INTEGER,
  ADD COLUMN IF NOT EXISTS require_owner_approval BOOLEAN NOT NULL DEFAULT true;

-- 6) Companies (architecture only)
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  legal_name TEXT,
  tax_number TEXT,
  logo_url TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "companies_tenant_read" ON public.companies;
CREATE POLICY "companies_tenant_read" ON public.companies FOR SELECT TO authenticated
  USING (public.is_super_owner(auth.uid()) OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.tenant_id = companies.tenant_id));
DROP POLICY IF EXISTS "companies_admin_write" ON public.companies;
CREATE POLICY "companies_admin_write" ON public.companies FOR ALL TO authenticated
  USING (public.is_super_owner(auth.uid()) OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager']))
  WITH CHECK (public.is_super_owner(auth.uid()) OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager']));

-- 7) Departments
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  photo_url TEXT,
  manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "departments_tenant_read" ON public.departments;
CREATE POLICY "departments_tenant_read" ON public.departments FOR SELECT TO authenticated
  USING (public.is_super_owner(auth.uid()) OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.tenant_id = departments.tenant_id));
DROP POLICY IF EXISTS "departments_admin_write" ON public.departments;
CREATE POLICY "departments_admin_write" ON public.departments FOR ALL TO authenticated
  USING (public.is_super_owner(auth.uid()) OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager']))
  WITH CHECK (public.is_super_owner(auth.uid()) OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager']));

-- 8) Job titles
CREATE TABLE IF NOT EXISTS public.job_titles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_titles TO authenticated;
GRANT ALL ON public.job_titles TO service_role;
ALTER TABLE public.job_titles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "job_titles_tenant_read" ON public.job_titles;
CREATE POLICY "job_titles_tenant_read" ON public.job_titles FOR SELECT TO authenticated
  USING (public.is_super_owner(auth.uid()) OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.tenant_id = job_titles.tenant_id));
DROP POLICY IF EXISTS "job_titles_admin_write" ON public.job_titles;
CREATE POLICY "job_titles_admin_write" ON public.job_titles FOR ALL TO authenticated
  USING (public.is_super_owner(auth.uid()) OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager']))
  WITH CHECK (public.is_super_owner(auth.uid()) OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager']));

-- 9) Employment types
CREATE TABLE IF NOT EXISTS public.employment_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employment_types TO authenticated;
GRANT ALL ON public.employment_types TO service_role;
ALTER TABLE public.employment_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "employment_types_tenant_read" ON public.employment_types;
CREATE POLICY "employment_types_tenant_read" ON public.employment_types FOR SELECT TO authenticated
  USING (public.is_super_owner(auth.uid()) OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.tenant_id = employment_types.tenant_id));
DROP POLICY IF EXISTS "employment_types_admin_write" ON public.employment_types;
CREATE POLICY "employment_types_admin_write" ON public.employment_types FOR ALL TO authenticated
  USING (public.is_super_owner(auth.uid()) OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager']))
  WITH CHECK (public.is_super_owner(auth.uid()) OR public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager']));

-- 10) Login history
CREATE TABLE IF NOT EXISTS public.login_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  event TEXT NOT NULL DEFAULT 'login',
  login_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  logout_at TIMESTAMPTZ,
  ip TEXT,
  user_agent TEXT,
  browser TEXT,
  os TEXT,
  device TEXT,
  session_duration_seconds INTEGER
);
GRANT SELECT, INSERT, UPDATE ON public.login_history TO authenticated;
GRANT ALL ON public.login_history TO service_role;
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_login_history_user ON public.login_history(user_id, login_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_history_tenant ON public.login_history(tenant_id, login_at DESC);
DROP POLICY IF EXISTS "login_history_self_read" ON public.login_history;
CREATE POLICY "login_history_self_read" ON public.login_history FOR SELECT TO authenticated
  USING (auth.uid() = user_id
    OR public.is_super_owner(auth.uid())
    OR (tenant_id IS NOT NULL AND public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])));
DROP POLICY IF EXISTS "login_history_self_write" ON public.login_history;
CREATE POLICY "login_history_self_write" ON public.login_history FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "login_history_self_update" ON public.login_history;
CREATE POLICY "login_history_self_update" ON public.login_history FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 11) Notifications architecture
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  audience_type TEXT NOT NULL CHECK (audience_type IN ('owner','manager','branch','department','user','all')),
  audience_id UUID,
  kind TEXT NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low','normal','urgent','critical')),
  title TEXT NOT NULL,
  body TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_for TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON public.notifications(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_audience ON public.notifications(audience_type, audience_id);
DROP POLICY IF EXISTS "notifications_read" ON public.notifications;
CREATE POLICY "notifications_read" ON public.notifications FOR SELECT TO authenticated
  USING (public.is_super_owner(auth.uid())
    OR (tenant_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.tenant_id = notifications.tenant_id)));
DROP POLICY IF EXISTS "notifications_admin_write" ON public.notifications;
CREATE POLICY "notifications_admin_write" ON public.notifications FOR ALL TO authenticated
  USING (public.is_super_owner(auth.uid()) OR (tenant_id IS NOT NULL AND public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])))
  WITH CHECK (public.is_super_owner(auth.uid()) OR (tenant_id IS NOT NULL AND public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY['owner','manager'])));

-- 12) Custom roles — copied_from
ALTER TABLE public.custom_roles
  ADD COLUMN IF NOT EXISTS copied_from_builtin public.app_role,
  ADD COLUMN IF NOT EXISTS copied_from_custom UUID REFERENCES public.custom_roles(id) ON DELETE SET NULL;

-- 13) Immutable audit_logs — revoke delete
REVOKE DELETE ON public.audit_logs FROM PUBLIC;
REVOKE DELETE ON public.audit_logs FROM authenticated;
REVOKE DELETE ON public.audit_logs FROM anon;
DROP POLICY IF EXISTS "audit_logs_no_delete" ON public.audit_logs;
CREATE POLICY "audit_logs_no_delete" ON public.audit_logs FOR DELETE TO authenticated USING (false);

-- 14) Permission catalog seed (idempotent — ~150 keys)
INSERT INTO public.permissions (key, label_ar, label_en, category, description) VALUES
  -- dashboard
  ('dashboard.view','عرض لوحة التحكم','View Dashboard','dashboard',NULL),
  -- pos / sales
  ('pos.view','عرض نقطة البيع','View POS','sales',NULL),
  ('pos.create_sale','إنشاء بيع','Create sale','sales',NULL),
  ('pos.refund','استرجاع','Refund','sales',NULL),
  ('pos.hold','تعليق فاتورة','Hold ticket','sales',NULL),
  ('sales.view','عرض المبيعات','View sales','sales',NULL),
  ('sales.export','تصدير المبيعات','Export sales','sales',NULL),
  ('sales.print','طباعة الفاتورة','Print invoice','sales',NULL),
  ('sales.delete','حذف بيع','Delete sale','sales',NULL),
  ('sales.approve','اعتماد بيع','Approve sale','sales',NULL),
  ('sales.reject','رفض بيع','Reject sale','sales',NULL),
  -- cash sessions
  ('cash.view','عرض جلسات الصندوق','View cash sessions','sales',NULL),
  ('cash.open','فتح صندوق','Open cash session','sales',NULL),
  ('cash.close','إغلاق صندوق','Close cash session','sales',NULL),
  -- products / catalog
  ('products.view','عرض المنتجات','View products','catalog',NULL),
  ('products.create','إضافة منتج','Create product','catalog',NULL),
  ('products.edit','تعديل منتج','Edit product','catalog',NULL),
  ('products.delete','حذف منتج','Delete product','catalog',NULL),
  ('products.import','استيراد منتجات','Import products','catalog',NULL),
  ('products.export','تصدير منتجات','Export products','catalog',NULL),
  ('categories.view','عرض الأقسام','View categories','catalog',NULL),
  ('categories.manage','إدارة الأقسام','Manage categories','catalog',NULL),
  -- inventory
  ('inventory.view','عرض المخزون','View inventory','inventory',NULL),
  ('inventory.adjust','تعديل المخزون','Adjust inventory','inventory',NULL),
  ('inventory.transfer','نقل المخزون','Transfer inventory','inventory',NULL),
  ('inventory.movements.view','عرض حركات المخزون','View inventory movements','inventory',NULL),
  ('inventory.export','تصدير المخزون','Export inventory','inventory',NULL),
  -- purchases
  ('purchases.view','عرض المشتريات','View purchases','inventory',NULL),
  ('purchases.create','إنشاء أمر شراء','Create purchase','inventory',NULL),
  ('purchases.edit','تعديل مشتريات','Edit purchase','inventory',NULL),
  ('purchases.approve','اعتماد مشتريات','Approve purchase','inventory',NULL),
  ('purchases.delete','حذف مشتريات','Delete purchase','inventory',NULL),
  ('suppliers.view','عرض الموردين','View suppliers','inventory',NULL),
  ('suppliers.manage','إدارة الموردين','Manage suppliers','inventory',NULL),
  -- crm
  ('customers.view','عرض العملاء','View customers','crm',NULL),
  ('customers.manage','إدارة العملاء','Manage customers','crm',NULL),
  ('customers.export','تصدير العملاء','Export customers','crm',NULL),
  -- finance
  ('expenses.view','عرض المصاريف','View expenses','finance',NULL),
  ('expenses.manage','إدارة المصاريف','Manage expenses','finance',NULL),
  ('expenses.approve','اعتماد مصروف','Approve expense','finance',NULL),
  ('expense_categories.manage','إدارة أقسام المصاريف','Manage expense categories','finance',NULL),
  -- reports
  ('reports.view','عرض التقارير','View reports','reports',NULL),
  ('reports.export','تصدير التقارير','Export reports','reports',NULL),
  ('reports.filter','تصفية التقارير','Filter reports','reports',NULL),
  -- branches
  ('branches.view','عرض الفروع','View branches','branches',NULL),
  ('branches.create','إضافة فرع','Create branch','branches',NULL),
  ('branches.edit','تعديل فرع','Edit branch','branches',NULL),
  ('branches.delete','حذف فرع','Delete branch','branches',NULL),
  ('branches.manage','إدارة الفروع','Manage branches','branches',NULL),
  -- users
  ('users.view','عرض المستخدمين','View users','users',NULL),
  ('users.create','إضافة مستخدم','Create user','users',NULL),
  ('users.edit','تعديل مستخدم','Edit user','users',NULL),
  ('users.delete','حذف مستخدم','Delete user','users',NULL),
  ('users.suspend','تعليق مستخدم','Suspend user','users',NULL),
  ('users.freeze','تجميد مستخدم','Freeze user','users',NULL),
  ('users.archive','أرشفة مستخدم','Archive user','users',NULL),
  ('users.approve','اعتماد مستخدم','Approve user','users',NULL),
  ('users.reset_password','إعادة تعيين كلمة السر','Reset password','users',NULL),
  ('users.change_role','تغيير الدور','Change role','users',NULL),
  ('users.change_branch','تغيير الفرع','Change branch','users',NULL),
  ('users.change_department','تغيير القسم','Change department','users',NULL),
  ('users.change_company','تغيير الشركة','Change company','users',NULL),
  ('users.force_password_reset','إجبار تغيير كلمة السر','Force password reset','users',NULL),
  ('users.export','تصدير المستخدمين','Export users','users',NULL),
  -- roles / permissions
  ('roles.view','عرض الأدوار','View roles','system',NULL),
  ('roles.manage','إدارة الأدوار','Manage roles','system',NULL),
  ('permissions.view','عرض الصلاحيات','View permissions','system',NULL),
  ('permissions.manage','إدارة الصلاحيات','Manage permissions','system',NULL),
  -- companies / departments / job titles / employment types
  ('companies.view','عرض الشركات','View companies','system',NULL),
  ('companies.manage','إدارة الشركات','Manage companies','system',NULL),
  ('departments.view','عرض الأقسام الإدارية','View departments','system',NULL),
  ('departments.manage','إدارة الأقسام الإدارية','Manage departments','system',NULL),
  ('job_titles.view','عرض المسميات الوظيفية','View job titles','system',NULL),
  ('job_titles.manage','إدارة المسميات الوظيفية','Manage job titles','system',NULL),
  ('employment_types.view','عرض أنواع التوظيف','View employment types','system',NULL),
  ('employment_types.manage','إدارة أنواع التوظيف','Manage employment types','system',NULL),
  -- system / audit
  ('audit.view','عرض سجل التدقيق','View audit logs','system',NULL),
  ('audit.export','تصدير سجل التدقيق','Export audit logs','system',NULL),
  ('login_history.view','عرض سجل الدخول','View login history','system',NULL),
  ('settings.view','عرض الإعدادات','View settings','system',NULL),
  ('settings.manage','إدارة الإعدادات','Manage settings','system',NULL),
  ('owner_center.access','الوصول لمركز تحكم المالك','Access Owner Center','system',NULL),
  -- HR
  ('hr.employees.view','عرض الموظفين','View employees','operations',NULL),
  ('hr.employees.manage','إدارة الموظفين','Manage employees','operations',NULL),
  ('hr.attendance.view','عرض الحضور','View attendance','operations',NULL),
  ('hr.attendance.manage','إدارة الحضور','Manage attendance','operations',NULL),
  ('hr.leaves.view','عرض الإجازات','View leaves','operations',NULL),
  ('hr.leaves.approve','اعتماد إجازات','Approve leaves','operations',NULL),
  ('hr.leaves.reject','رفض إجازات','Reject leaves','operations',NULL),
  ('hr.payroll.view','عرض الرواتب','View payroll','operations',NULL),
  ('hr.payroll.manage','إدارة الرواتب','Manage payroll','operations',NULL),
  ('hr.compensation.view','عرض التعويضات','View compensation','operations',NULL),
  ('hr.compensation.manage','إدارة التعويضات','Manage compensation','operations',NULL),
  -- notifications
  ('notifications.view','عرض الإشعارات','View notifications','system',NULL),
  ('notifications.manage','إدارة الإشعارات','Manage notifications','system',NULL)
ON CONFLICT (key) DO NOTHING;

-- 15) Default builtin role permissions — owner gets all, others get sensible subset
-- Owner: all
INSERT INTO public.role_permissions (tenant_id, role_kind, builtin_role, permission_key)
SELECT NULL, 'builtin', 'owner'::public.app_role, key FROM public.permissions
ON CONFLICT DO NOTHING;

-- Manager: everything except owner_center + user destructive
INSERT INTO public.role_permissions (tenant_id, role_kind, builtin_role, permission_key)
SELECT NULL, 'builtin', 'manager'::public.app_role, key FROM public.permissions
WHERE key NOT IN ('owner_center.access','users.delete','users.archive','users.change_company','companies.manage','roles.manage','permissions.manage')
ON CONFLICT DO NOTHING;

-- Cashier: POS, view products, view customers
INSERT INTO public.role_permissions (tenant_id, role_kind, builtin_role, permission_key)
SELECT NULL, 'builtin', 'cashier'::public.app_role, k FROM (VALUES
  ('dashboard.view'),('pos.view'),('pos.create_sale'),('pos.hold'),('sales.print'),
  ('sales.view'),('products.view'),('customers.view'),('cash.view'),('cash.open'),('cash.close')
) AS t(k)
ON CONFLICT DO NOTHING;

-- Accountant
INSERT INTO public.role_permissions (tenant_id, role_kind, builtin_role, permission_key)
SELECT NULL, 'builtin', 'accountant'::public.app_role, k FROM (VALUES
  ('dashboard.view'),('sales.view'),('sales.export'),('reports.view'),('reports.export'),('reports.filter'),
  ('expenses.view'),('expenses.manage'),('expenses.approve'),('expense_categories.manage'),
  ('purchases.view'),('customers.view'),('audit.view'),('hr.payroll.view')
) AS t(k)
ON CONFLICT DO NOTHING;

-- Warehouse
INSERT INTO public.role_permissions (tenant_id, role_kind, builtin_role, permission_key)
SELECT NULL, 'builtin', 'warehouse'::public.app_role, k FROM (VALUES
  ('dashboard.view'),('inventory.view'),('inventory.adjust'),('inventory.transfer'),('inventory.movements.view'),('inventory.export'),
  ('products.view'),('purchases.view'),('purchases.create'),('purchases.edit'),('suppliers.view'),('suppliers.manage')
) AS t(k)
ON CONFLICT DO NOTHING;

-- Waiter
INSERT INTO public.role_permissions (tenant_id, role_kind, builtin_role, permission_key)
SELECT NULL, 'builtin', 'waiter'::public.app_role, k FROM (VALUES
  ('dashboard.view'),('pos.view'),('pos.create_sale'),('pos.hold'),('products.view'),('customers.view')
) AS t(k)
ON CONFLICT DO NOTHING;

-- Kitchen
INSERT INTO public.role_permissions (tenant_id, role_kind, builtin_role, permission_key)
SELECT NULL, 'builtin', 'kitchen'::public.app_role, k FROM (VALUES
  ('dashboard.view'),('pos.view'),('products.view')
) AS t(k)
ON CONFLICT DO NOTHING;

-- 16) Seed a Default company per existing tenant (idempotent)
INSERT INTO public.companies (tenant_id, name, is_active)
SELECT t.id, t.name, true FROM public.tenants t
WHERE NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.tenant_id = t.id)
ON CONFLICT DO NOTHING;

-- 17) Backfill profiles.email from auth.users (safe, one-time)
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND (p.email IS NULL OR p.email = '');

-- 18) Backfill profiles.status from is_active
UPDATE public.profiles
SET status = CASE WHEN is_active THEN 'active'::public.account_status ELSE 'suspended'::public.account_status END
WHERE status IS NULL;

-- 19) updated_at trigger for new tables
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_companies_updated BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_departments_updated BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_job_titles_updated BEFORE UPDATE ON public.job_titles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_employment_types_updated BEFORE UPDATE ON public.employment_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 20) Clone role permissions helper
CREATE OR REPLACE FUNCTION public.clone_role_permissions(
  _tenant_id UUID,
  _dst_custom_role_id UUID,
  _src_builtin public.app_role DEFAULT NULL,
  _src_custom_role_id UUID DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INTEGER;
BEGIN
  IF _src_builtin IS NOT NULL THEN
    INSERT INTO public.role_permissions (tenant_id, role_kind, custom_role_id, permission_key)
    SELECT _tenant_id, 'custom', _dst_custom_role_id, permission_key
    FROM public.role_permissions
    WHERE role_kind = 'builtin' AND builtin_role = _src_builtin AND (tenant_id IS NULL OR tenant_id = _tenant_id)
    ON CONFLICT DO NOTHING;
  ELSIF _src_custom_role_id IS NOT NULL THEN
    INSERT INTO public.role_permissions (tenant_id, role_kind, custom_role_id, permission_key)
    SELECT _tenant_id, 'custom', _dst_custom_role_id, permission_key
    FROM public.role_permissions
    WHERE role_kind = 'custom' AND custom_role_id = _src_custom_role_id
    ON CONFLICT DO NOTHING;
  END IF;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- 21) Audit trigger extensions for critical tables
DO $$ BEGIN
  CREATE TRIGGER trg_audit_user_roles AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
    FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_audit_user_permission_overrides AFTER INSERT OR UPDATE OR DELETE ON public.user_permission_overrides
    FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_audit_custom_roles AFTER INSERT OR UPDATE OR DELETE ON public.custom_roles
    FOR EACH ROW EXECUTE FUNCTION public.log_audit_change();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =====================================================================
-- SOURCE MIGRATION: 20261111000000_security_phase_1_hardening.sql
-- =====================================================================

-- Security hardening phase 1.
-- Additive migration: does not rewrite or delete historical migrations.
-- Apply only after the complete existing Supabase migration chain.

BEGIN;

-- 1) A tenant owner may bootstrap their own owner role, but cannot claim
-- owner privileges in an unrelated tenant.
DROP POLICY IF EXISTS "User bootstraps own owner role" ON public.user_roles;
CREATE POLICY "Tenant owner bootstraps own owner role"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'owner'
    AND EXISTS (
      SELECT 1
      FROM public.tenants t
      WHERE t.id = tenant_id
        AND t.owner_id = auth.uid()
    )
  );

-- 2) A profile owner may edit public profile fields only. Administrative
-- fields (tenant, branch, status, activation, approval, employment data,
-- security metadata) remain writable only by trusted server-side operations.
REVOKE UPDATE ON TABLE public.profiles FROM authenticated;
GRANT UPDATE (full_name, username, phone, avatar_url)
  ON TABLE public.profiles TO authenticated;

-- 3) Prevent a requester from approving/rejecting their own leave request,
-- even if another permissive UPDATE policy exists. Service-role workflows
-- (auth.uid() IS NULL) remain available to trusted server-side code.
CREATE OR REPLACE FUNCTION public.prevent_leave_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (
       OLD.created_by = auth.uid()
       OR EXISTS (
         SELECT 1
           FROM public.employees e
          WHERE e.id = OLD.employee_id
            AND e.user_id = auth.uid()
       )
     )
     AND (
       NEW.status IS DISTINCT FROM OLD.status
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     )
  THEN
    RAISE EXCEPTION 'لا يمكنك اعتماد أو تغيير حالة طلب الإجازة الخاص بك'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_leave_self_approval ON public.leave_requests;
CREATE TRIGGER trg_prevent_leave_self_approval
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_leave_self_approval();

-- 4) Make first-super-owner bootstrap atomic. The caller must additionally
-- be allow-listed by the server environment variable
-- INITIAL_SUPER_OWNER_USER_ID. The RPC itself is executable only by service_role.
CREATE OR REPLACE FUNCTION public.bootstrap_first_super_owner(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required' USING ERRCODE = '22004';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.super_owners.first_bootstrap'));

  IF EXISTS (SELECT 1 FROM public.super_owners LIMIT 1) THEN
    RAISE EXCEPTION 'Initial super owner has already been configured'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user_id) THEN
    RAISE EXCEPTION 'The requested auth user does not exist'
      USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.super_owners (user_id, granted_by, notes)
  VALUES (_user_id, _user_id, 'Initial super owner bootstrap');
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_first_super_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_first_super_owner(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.bootstrap_first_super_owner(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_super_owner(uuid) TO service_role;

COMMIT;


-- SOURCE MIGRATION: 20261111000001_payroll_atomic_rejection.sql
-- =====================================================================

-- Atomic payroll rejection and explicit rejected state.
BEGIN;

DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.payroll_runs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.payroll_runs DROP CONSTRAINT %I',
      constraint_row.conname
    );
  END LOOP;
END;
$$;

ALTER TABLE public.payroll_runs
  ADD CONSTRAINT payroll_runs_status_check
  CHECK (status IN ('draft', 'approved', 'paid', 'cancelled', 'rejected'))
  NOT VALID;

ALTER TABLE public.payroll_runs
  VALIDATE CONSTRAINT payroll_runs_status_check;

CREATE OR REPLACE FUNCTION public.reject_payroll_run(
  _run_id uuid,
  _tenant_id uuid,
  _reason text,
  _actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  locked_run public.payroll_runs%ROWTYPE;
BEGIN
  IF _reason IS NULL OR length(btrim(_reason)) = 0 OR length(_reason) > 500 THEN
    RAISE EXCEPTION 'A rejection reason between 1 and 500 characters is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO locked_run
    FROM public.payroll_runs
   WHERE id = _run_id
     AND tenant_id = _tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run not found in the requested tenant'
      USING ERRCODE = 'P0002';
  END IF;

  IF locked_run.status NOT IN ('draft', 'approved') THEN
    RAISE EXCEPTION 'Only draft or approved payroll runs can be rejected'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.bonuses
     SET payroll_item_id = NULL
   WHERE payroll_item_id IN (
     SELECT id FROM public.payroll_items WHERE payroll_run_id = _run_id
   );

  UPDATE public.deductions
     SET payroll_item_id = NULL
   WHERE payroll_item_id IN (
     SELECT id FROM public.payroll_items WHERE payroll_run_id = _run_id
   );

  DELETE FROM public.payroll_items
   WHERE payroll_run_id = _run_id
     AND tenant_id = _tenant_id;

  UPDATE public.payroll_runs
     SET status = 'rejected',
         rejection_reason = _reason,
         rejected_by = _actor_id,
         rejected_at = now(),
         total_gross = 0,
         total_net = 0,
         total_bonuses = 0,
         total_deductions = 0,
         updated_at = now()
   WHERE id = _run_id
     AND tenant_id = _tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_payroll_run(uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_payroll_run(uuid, uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reject_payroll_run(uuid, uuid, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reject_payroll_run(uuid, uuid, text, uuid) TO service_role;

COMMIT;


-- =====================================================================
-- SOURCE MIGRATION: 20261111000002_user_role_atomicity.sql
-- =====================================================================

-- Keep role assignment and branch transfer synchronized in one transaction.
BEGIN;

CREATE OR REPLACE FUNCTION public.replace_user_role_in_tenant(
  _user_id uuid,
  _tenant_id uuid,
  _role public.app_role,
  _branch_id uuid,
  _actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM 1
    FROM public.user_roles
   WHERE user_id = _user_id
     AND tenant_id = _tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user does not belong to this tenant'
      USING ERRCODE = 'P0002';
  END IF;

  IF _branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches
     WHERE id = _branch_id AND tenant_id = _tenant_id
  ) THEN
    RAISE EXCEPTION 'Branch does not belong to the requested tenant'
      USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.user_roles
   WHERE user_id = _user_id AND tenant_id = _tenant_id;

  INSERT INTO public.user_roles (user_id, tenant_id, role, branch_id, hired_by)
  VALUES (_user_id, _tenant_id, _role, _branch_id, _actor_id);

  UPDATE public.profiles
     SET branch_id = _branch_id
   WHERE id = _user_id
     AND tenant_id = _tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_user_role_branch(
  _user_role_id uuid,
  _tenant_id uuid,
  _branch_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_user_id uuid;
  updated_profiles integer;
BEGIN
  SELECT user_id
    INTO target_user_id
    FROM public.user_roles
   WHERE id = _user_role_id
     AND tenant_id = _tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role assignment not found in the requested tenant'
      USING ERRCODE = 'P0002';
  END IF;

  IF _branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches
     WHERE id = _branch_id AND tenant_id = _tenant_id
  ) THEN
    RAISE EXCEPTION 'Branch does not belong to the requested tenant'
      USING ERRCODE = '23503';
  END IF;

  UPDATE public.user_roles
     SET branch_id = _branch_id
   WHERE id = _user_role_id
     AND tenant_id = _tenant_id;

  UPDATE public.profiles
     SET branch_id = _branch_id
   WHERE id = target_user_id
     AND tenant_id = _tenant_id;

  GET DIAGNOSTICS updated_profiles = ROW_COUNT;
  IF updated_profiles = 0 THEN
    RAISE EXCEPTION 'Target profile was not found in the requested tenant'
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_user_role_in_tenant(uuid, uuid, public.app_role, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_user_role_in_tenant(uuid, uuid, public.app_role, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.replace_user_role_in_tenant(uuid, uuid, public.app_role, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.replace_user_role_in_tenant(uuid, uuid, public.app_role, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.transfer_user_role_branch(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_user_role_branch(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.transfer_user_role_branch(uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_user_role_branch(uuid, uuid, uuid) TO service_role;

COMMIT;


-- =====================================================================
-- SOURCE MIGRATION: 20261111000003_migrate_legacy_drizzle_visibility.sql
-- =====================================================================

-- Bring the legacy Drizzle visibility migration into the Supabase
-- migration chain so clean database rebuilds do not silently omit it.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.is_tenant_member(
  _user_id uuid,
  _tenant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_roles
     WHERE user_id = _user_id
       AND tenant_id = _tenant_id
  );
$$;

REVOKE ALL ON FUNCTION private.is_tenant_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_tenant_member(uuid, uuid) FROM anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_tenant_member(uuid, uuid) TO authenticated, service_role;

ALTER TABLE public.super_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View super owners" ON public.super_owners;
CREATE POLICY "View super owners"
  ON public.super_owners
  FOR SELECT
  TO authenticated
  USING (public.is_super_owner(auth.uid()));

DROP POLICY IF EXISTS "View role permissions" ON public.role_permissions;
CREATE POLICY "View role permissions"
  ON public.role_permissions
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_owner(auth.uid())
    OR tenant_id IS NULL
    OR private.is_tenant_member(auth.uid(), tenant_id)
  );

DROP POLICY IF EXISTS "View permissions" ON public.permissions;
CREATE POLICY "View permissions"
  ON public.permissions
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_owner(auth.uid())
    OR EXISTS (
      SELECT 1
        FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.tenant_id IS NOT NULL
    )
  );

COMMIT;


-- =====================================================================
-- SOURCE MIGRATION: 20261111000004_atomic_pos_checkout.sql
-- =====================================================================

-- Atomic POS checkout: server-derived prices/tax/totals, session validation,
-- invoice number serialization, sale items, stock triggers, and payment commit
-- as one PostgreSQL transaction.
BEGIN;

CREATE OR REPLACE FUNCTION public.assign_invoice_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  next_no integer;
BEGIN
  -- Lock the branch row so two concurrent checkouts cannot allocate the same
  -- MAX(invoice_no) + 1 value for this branch.
  PERFORM 1
    FROM public.branches
   WHERE id = NEW.branch_id
     AND tenant_id = NEW.tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Branch does not belong to the sale tenant'
      USING ERRCODE = '23503';
  END IF;

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
SET search_path = public, pg_temp
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

  -- First pass: validate every product and calculate subtotal from the
  -- database's current sale_price. Client-supplied prices are never trusted.
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

  -- Second pass: persist authoritative item snapshots. Existing stock
  -- triggers run inside this same transaction and roll everything back if
  -- any inventory write fails.
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
      quantity, unit_price, tax_rate, line_total
    )
    VALUES (
      _tenant_id, v_sale.id, v_product.id, v_product.name,
      v_quantity, v_product.sale_price, v_tax_rate,
      round(v_product.sale_price * v_quantity, 2)
    );
  END LOOP;

  INSERT INTO public.payments (tenant_id, sale_id, method, amount)
  VALUES (_tenant_id, v_sale.id, _payment_method, v_total);

  RETURN v_sale;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sale_with_items(
  uuid, uuid, uuid, uuid, numeric, public.payment_method, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_sale_with_items(
  uuid, uuid, uuid, uuid, numeric, public.payment_method, jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.create_sale_with_items(
  uuid, uuid, uuid, uuid, numeric, public.payment_method, jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_sale_with_items(
  uuid, uuid, uuid, uuid, numeric, public.payment_method, jsonb
) TO authenticated;

COMMIT;


-- SOURCE MIGRATION: 20261111000005_atomic_purchases_inventory_cash.sql
-- =====================================================================

-- Atomic purchase receiving, inventory adjustments, and cash-session closing.
BEGIN;

-- Centralize stock writes and enforce product/branch tenant consistency.
CREATE OR REPLACE FUNCTION public.apply_stock_change(
  _tenant_id uuid,
  _product_id uuid,
  _branch_id uuid,
  _delta numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM 1
    FROM public.products
   WHERE id = _product_id
     AND tenant_id = _tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product does not belong to the requested tenant'
      USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.branches
     WHERE id = _branch_id AND tenant_id = _tenant_id
  ) THEN
    RAISE EXCEPTION 'Branch does not belong to the requested tenant'
      USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.inventory (tenant_id, product_id, branch_id, quantity, updated_at)
  VALUES (_tenant_id, _product_id, _branch_id, _delta, now())
  ON CONFLICT (product_id, branch_id) DO UPDATE
    SET quantity = public.inventory.quantity + EXCLUDED.quantity,
        updated_at = now();
END;
$$;

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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item jsonb;
  v_product_id uuid;
  v_quantity numeric(14,3);
  v_cost_price numeric(12,2);
  v_line_total numeric(12,2);
  v_total numeric(12,2) := 0;
  v_purchase public.purchases%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> _user_id THEN
    RAISE EXCEPTION 'Authenticated purchaser identity mismatch'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (
    private.is_tenant_admin(auth.uid(), _tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = auth.uid()
         AND tenant_id = _tenant_id
         AND role = 'warehouse'
         AND (branch_id IS NULL OR branch_id = _branch_id)
    )
  )
  THEN
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

  IF jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) = 0
     OR jsonb_array_length(_items) > 300 THEN
    RAISE EXCEPTION 'Purchase must contain between 1 and 300 items'
      USING ERRCODE = '22023';
  END IF;

  -- Validate all products and calculate the total server-side.
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(_items)
     ORDER BY (value->>'product_id')::uuid
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::numeric;
    v_cost_price := (v_item->>'cost_price')::numeric;

    IF v_quantity IS NULL OR v_quantity <= 0 OR v_quantity > 999999.999
       OR v_cost_price IS NULL OR v_cost_price < 0
    THEN
      RAISE EXCEPTION 'Invalid purchase quantity or cost price'
        USING ERRCODE = '22023';
    END IF;

    PERFORM 1
      FROM public.products
     WHERE id = v_product_id
       AND tenant_id = _tenant_id
       AND is_active = true
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Purchase product is unavailable or belongs to another tenant'
        USING ERRCODE = '23503';
    END IF;

    v_line_total := round(v_quantity * v_cost_price, 2);
    v_total := v_total + v_line_total;
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

  -- Existing purchase-item trigger updates inventory and records the stock
  -- transaction in this same database transaction.
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

CREATE OR REPLACE FUNCTION public.adjust_inventory_balance(
  _tenant_id uuid,
  _product_id uuid,
  _branch_id uuid,
  _target_quantity numeric,
  _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current numeric(14,3);
  v_delta numeric(14,3);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF _target_quantity IS NULL OR _target_quantity < 0 OR _target_quantity > 999999999
  THEN
    RAISE EXCEPTION 'Target inventory quantity is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    private.is_tenant_admin(auth.uid(), _tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = auth.uid()
         AND tenant_id = _tenant_id
         AND role = 'warehouse'
         AND (branch_id IS NULL OR branch_id = _branch_id)
    )
  )
  THEN
    RAISE EXCEPTION 'You cannot adjust inventory in this branch'
      USING ERRCODE = '42501';
  END IF;

  -- Lock the product row to serialize manual adjustments with stock triggers.
  PERFORM 1
    FROM public.products
   WHERE id = _product_id
     AND tenant_id = _tenant_id
     AND is_active = true
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product does not belong to the requested tenant'
      USING ERRCODE = '23503';
  END IF;

  SELECT quantity
    INTO v_current
    FROM public.inventory
   WHERE tenant_id = _tenant_id
     AND product_id = _product_id
     AND branch_id = _branch_id
   FOR UPDATE;

  IF NOT FOUND THEN
    v_current := 0;
  END IF;

  v_delta := _target_quantity - v_current;

  IF v_delta <> 0 THEN
    PERFORM public.apply_stock_change(_tenant_id, _product_id, _branch_id, v_delta);

    INSERT INTO public.inventory_transactions (
      tenant_id, product_id, branch_id, user_id,
      txn_type, quantity, reason
    )
    VALUES (
      _tenant_id, _product_id, _branch_id, auth.uid(),
      'adjust', v_delta, COALESCE(NULLIF(btrim(_reason), ''), 'تعديل يدوي')
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_cash_session(
  _session_id uuid,
  _closing_balance numeric
)
RETURNS public.cash_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.cash_sessions%ROWTYPE;
  v_expected numeric(12,2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF _closing_balance IS NULL OR _closing_balance < 0 THEN
    RAISE EXCEPTION 'Closing balance must be zero or greater'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_session
    FROM public.cash_sessions
   WHERE id = _session_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cash session not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'Cash session is already closed'
      USING ERRCODE = '55000';
  END IF;

  IF auth.uid() <> v_session.cashier_id
     AND NOT private.is_tenant_admin(auth.uid(), v_session.tenant_id)
  THEN
    RAISE EXCEPTION 'You cannot close this cashier session'
      USING ERRCODE = '42501';
  END IF;

  SELECT round(
    v_session.opening_balance
    + COALESCE(sum(p.amount), 0),
    2
  )
    INTO v_expected
    FROM public.payments p
    JOIN public.sales s ON s.id = p.sale_id
   WHERE s.session_id = v_session.id
     AND s.tenant_id = v_session.tenant_id
     AND s.status = 'completed'
     AND p.method = 'cash';

  UPDATE public.cash_sessions
     SET status = 'closed',
         closing_balance = _closing_balance,
         expected_cash = v_expected,
         cash_difference = round(_closing_balance - v_expected, 2),
         closed_at = now(),
         updated_at = now()
   WHERE id = v_session.id
   RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;

REVOKE ALL ON FUNCTION public.create_purchase_with_items(uuid, uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_purchase_with_items(uuid, uuid, uuid, uuid, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.create_purchase_with_items(uuid, uuid, uuid, uuid, text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_with_items(uuid, uuid, uuid, uuid, text, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.adjust_inventory_balance(uuid, uuid, uuid, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adjust_inventory_balance(uuid, uuid, uuid, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.adjust_inventory_balance(uuid, uuid, uuid, numeric, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_balance(uuid, uuid, uuid, numeric, text) TO authenticated;

REVOKE ALL ON FUNCTION public.close_cash_session(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_cash_session(uuid, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.close_cash_session(uuid, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_session(uuid, numeric) TO authenticated;

COMMIT;



-- =====================================================================
-- SOURCE MIGRATION: 20261111000006_audit_login_notification_security.sql
-- =====================================================================

-- Tighten audit and login-history writes; scope notification reads by audience.
BEGIN;

-- Audit entries are created by SECURITY DEFINER audit triggers and trusted
-- service-role workflows only. Authenticated clients cannot forge entries.
REVOKE INSERT ON TABLE public.audit_logs FROM PUBLIC;
REVOKE INSERT ON TABLE public.audit_logs FROM anon;
REVOKE INSERT ON TABLE public.audit_logs FROM authenticated;
DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;

-- A user may create their own login event, but cannot rewrite its timestamp,
-- IP, device, or logout time after the fact.
REVOKE INSERT, UPDATE ON TABLE public.login_history FROM PUBLIC;
REVOKE INSERT, UPDATE ON TABLE public.login_history FROM anon;
REVOKE INSERT, UPDATE ON TABLE public.login_history FROM authenticated;
DROP POLICY IF EXISTS "login_history_self_write" ON public.login_history;
DROP POLICY IF EXISTS "login_history_self_update" ON public.login_history;

-- Replace tenant-wide notification visibility with audience-aware access.
DROP POLICY IF EXISTS "notifications_read" ON public.notifications;
CREATE POLICY "notifications_read"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_owner(auth.uid())
    OR (
      tenant_id IS NOT NULL
      AND (
        audience_type = 'all'
        AND private.is_tenant_member(auth.uid(), tenant_id)
        OR audience_type IN ('owner', 'manager')
        AND public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY[audience_type])
        OR audience_type = 'user'
        AND audience_id = auth.uid()
        OR audience_type = 'branch'
        AND EXISTS (
          SELECT 1
            FROM public.user_roles ur
           WHERE ur.user_id = auth.uid()
             AND ur.tenant_id = notifications.tenant_id
             AND (
               ur.branch_id = notifications.audience_id
               OR (ur.branch_id IS NULL AND ur.role IN ('owner', 'manager'))
             )
        )
        OR audience_type = 'department'
        AND EXISTS (
          SELECT 1
            FROM public.user_roles ur
           WHERE ur.user_id = auth.uid()
             AND ur.tenant_id = notifications.tenant_id
             AND (
               ur.department_id = notifications.audience_id
               OR ur.role IN ('owner', 'manager')
             )
        )
      )
    )
  );

-- Per-user read receipts. Keep legacy notifications.read_at untouched for
-- compatibility, but use this table for all new per-user read state.
CREATE TABLE IF NOT EXISTS public.notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user
  ON public.notification_reads(user_id, read_at DESC);

GRANT SELECT, INSERT ON public.notification_reads TO authenticated;
REVOKE UPDATE ON TABLE public.notification_reads FROM authenticated;
GRANT UPDATE (read_at) ON TABLE public.notification_reads TO authenticated;
GRANT ALL ON public.notification_reads TO service_role;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notification receipts" ON public.notification_reads;
CREATE POLICY "Users read own notification receipts"
  ON public.notification_reads
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users create own notification receipts" ON public.notification_reads;
CREATE POLICY "Users create own notification receipts"
  ON public.notification_reads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM public.notifications n
       WHERE n.id = notification_id
    )
  );

DROP POLICY IF EXISTS "Users update own notification receipts" ON public.notification_reads;
CREATE POLICY "Users update own notification receipts"
  ON public.notification_reads
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMIT;


-- =====================================================================
-- SOURCE MIGRATION: 20261111000007_atomic_tenant_onboarding.sql
-- =====================================================================

-- Atomic and ownership-verified first tenant onboarding.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_tenant_with_owner(
  _name text,
  _currency text,
  _tax_rate numeric
)
RETURNS public.tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant public.tenants%ROWTYPE;
  v_profile_rows integer;
  v_name text := btrim(COALESCE(_name, ''));
  v_currency text := upper(btrim(COALESCE(_currency, '')));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF length(v_name) < 2 OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'Tenant name must contain 2 to 100 characters'
      USING ERRCODE = '22023';
  END IF;

  IF v_currency !~ '^[A-Z]{3,5}$' THEN
    RAISE EXCEPTION 'Currency code must contain 3 to 5 uppercase letters'
      USING ERRCODE = '22023';
  END IF;

  IF _tax_rate IS NULL OR _tax_rate < 0 OR _tax_rate > 100 THEN
    RAISE EXCEPTION 'Tax rate must be between 0 and 100'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'This account already belongs to a tenant'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.tenants (name, currency, tax_rate, owner_id)
  VALUES (v_name, v_currency, _tax_rate, v_user_id)
  RETURNING * INTO v_tenant;

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (v_user_id, v_tenant.id, 'owner');

  UPDATE public.profiles
     SET tenant_id = v_tenant.id,
         branch_id = NULL
   WHERE id = v_user_id;

  GET DIAGNOSTICS v_profile_rows = ROW_COUNT;
  IF v_profile_rows = 0 THEN
    RAISE EXCEPTION 'Profile row is missing for the authenticated user'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_with_owner(text, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_tenant_with_owner(text, text, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.create_tenant_with_owner(text, text, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_with_owner(text, text, numeric) TO authenticated;

COMMIT;


-- =====================================================================
-- SOURCE MIGRATION: 20261111000008_payroll_period_uniqueness.sql
-- =====================================================================

-- Enforce one payroll run per tenant, period, and branch.
-- Separate partial indexes are required because NULL branch_id values do not
-- compare equal in ordinary PostgreSQL unique constraints.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_runs_tenant_branch_period
  ON public.payroll_runs (tenant_id, branch_id, period_year, period_month)
  WHERE branch_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_runs_tenant_unbranched_period
  ON public.payroll_runs (tenant_id, period_year, period_month)
  WHERE branch_id IS NULL;

COMMIT;


-- =====================================================================
-- SOURCE MIGRATION: 20261111000009_secure_custom_role_clone.sql
-- =====================================================================

-- Lock down custom-role permission cloning. The application invokes this
-- SECURITY DEFINER helper only through its trusted service-role server action.
BEGIN;

CREATE OR REPLACE FUNCTION public.clone_role_permissions(
  _tenant_id uuid,
  _dst_custom_role_id uuid,
  _src_builtin public.app_role DEFAULT NULL,
  _src_custom_role_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF _tenant_id IS NULL OR _dst_custom_role_id IS NULL THEN
    RAISE EXCEPTION 'Tenant and destination custom role are required'
      USING ERRCODE = '22023';
  END IF;

  IF (_src_builtin IS NULL AND _src_custom_role_id IS NULL)
     OR (_src_builtin IS NOT NULL AND _src_custom_role_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Provide exactly one permission source'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.custom_roles
     WHERE id = _dst_custom_role_id
       AND tenant_id = _tenant_id
  ) THEN
    RAISE EXCEPTION 'Destination custom role does not belong to the tenant'
      USING ERRCODE = '23503';
  END IF;

  IF _src_custom_role_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.custom_roles
     WHERE id = _src_custom_role_id
       AND tenant_id = _tenant_id
  ) THEN
    RAISE EXCEPTION 'Source custom role does not belong to the tenant'
      USING ERRCODE = '23503';
  END IF;

  IF _src_builtin IS NOT NULL THEN
    INSERT INTO public.role_permissions (
      tenant_id, role_kind, custom_role_id, permission_key
    )
    SELECT
      _tenant_id, 'custom', _dst_custom_role_id, permission_key
    FROM public.role_permissions
    WHERE role_kind = 'builtin'
      AND builtin_role = _src_builtin
      AND (tenant_id IS NULL OR tenant_id = _tenant_id)
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.role_permissions (
      tenant_id, role_kind, custom_role_id, permission_key
    )
    SELECT
      _tenant_id, 'custom', _dst_custom_role_id, permission_key
    FROM public.role_permissions
    WHERE role_kind = 'custom'
      AND custom_role_id = _src_custom_role_id
      AND tenant_id = _tenant_id
    ON CONFLICT DO NOTHING;
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.clone_role_permissions(uuid, uuid, public.app_role, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clone_role_permissions(uuid, uuid, public.app_role, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.clone_role_permissions(uuid, uuid, public.app_role, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.clone_role_permissions(uuid, uuid, public.app_role, uuid) TO service_role;

COMMIT;


-- =====================================================================
-- SOURCE MIGRATION: 20261111000010_minimize_client_write_privileges.sql
-- =====================================================================

-- Minimize direct client write privileges on authorization tables.
-- All supported mutations now pass through validated server actions or
-- SECURITY DEFINER transactional RPCs.
BEGIN;

REVOKE INSERT ON TABLE public.tenants FROM PUBLIC;
REVOKE INSERT ON TABLE public.tenants FROM anon;
REVOKE INSERT ON TABLE public.tenants FROM authenticated;

REVOKE INSERT ON TABLE public.profiles FROM PUBLIC;
REVOKE INSERT ON TABLE public.profiles FROM anon;
REVOKE INSERT ON TABLE public.profiles FROM authenticated;

-- The tenant's owner_id is a security boundary for first-owner onboarding.
-- Ownership transfer must be implemented as an explicit audited server flow.
CREATE OR REPLACE FUNCTION public.prevent_tenant_owner_id_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'Tenant ownership cannot be changed through a direct client update'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_tenant_owner_id_change ON public.tenants;
CREATE TRIGGER trg_prevent_tenant_owner_id_change
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tenant_owner_id_change();

REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_roles FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_roles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_roles FROM authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.custom_roles FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.custom_roles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.custom_roles FROM authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.role_permissions FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.role_permissions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.role_permissions FROM authenticated;

COMMIT;




-- SOURCE MIGRATION: 20261111000011_restrict_security_definer_execution.sql
-- =====================================================
-- Migration 32: restrict SECURITY DEFINER execution
-- =====================================================
REVOKE EXECUTE ON FUNCTION public.log_audit_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_leave_self_approval() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_last_login() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_last_login() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.user_has_role_in_tenant(uuid, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_role_in_tenant(uuid, uuid, text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.was_hired_by(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.was_hired_by(uuid, uuid, uuid) TO authenticated;


-- SOURCE MIGRATION: 20261111000012_secure_super_owner_status.sql
-- Migration 20261111000012_secure_super_owner_status.sql
CREATE OR REPLACE FUNCTION public.get_super_owner_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'totalCount', (SELECT count(*)::integer FROM public.super_owners),
    'isSuperOwner', EXISTS (SELECT 1 FROM public.super_owners WHERE user_id = v_user_id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_super_owner_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_super_owner_status() TO authenticated;


-- SOURCE MIGRATION: 20261111000013_protect_financial_ledger_writes.sql
-- Protect financial and stock ledgers from direct authenticated/anonymous DML.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.sales, public.sale_items, public.payments, public.cash_sessions, public.purchases, public.purchase_items, public.inventory_transactions, public.tenants, public.profiles, public.super_owners FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.sales, public.sale_items, public.payments FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.purchases, public.purchase_items, public.inventory_transactions FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.cash_sessions FROM authenticated;
REVOKE INSERT, DELETE, TRUNCATE ON TABLE public.tenants FROM authenticated;


-- =====================================================================
-- SOURCE MIGRATION: 20261111000014_sale_cost_snapshots_profitability.sql
-- =====================================================================

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


-- =====================================================================
-- SOURCE MIGRATION: 20261111000015_security_stock_consistency.sql
-- =====================================================================

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


-- =====================================================================
-- SOURCE MIGRATION: 20261111000016_auditable_returns_and_refunds.sql
-- =====================================================================

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



-- =====================================================================
-- SOURCE MIGRATION: 20261111000017_index_uncovered_foreign_keys.sql
-- =====================================================================

-- Cover all currently unindexed foreign-key columns.
-- Indexes are intentionally single-column-leading so FK checks and deletes
-- can find referencing rows efficiently, even when tenant-scoped composites exist.
BEGIN;
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_id_fk ON public.attendance (tenant_id);
CREATE INDEX IF NOT EXISTS idx_bonuses_created_by_fk ON public.bonuses (created_by);
CREATE INDEX IF NOT EXISTS idx_bonuses_payroll_item_id_fk ON public.bonuses (payroll_item_id);
CREATE INDEX IF NOT EXISTS idx_bonuses_tenant_id_fk ON public.bonuses (tenant_id);
CREATE INDEX IF NOT EXISTS idx_branches_manager_id_fk ON public.branches (manager_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_branch_id_fk ON public.cash_sessions (branch_id);
CREATE INDEX IF NOT EXISTS idx_companies_tenant_id_fk ON public.companies (tenant_id);
CREATE INDEX IF NOT EXISTS idx_custom_roles_copied_from_custom_fk ON public.custom_roles (copied_from_custom);
CREATE INDEX IF NOT EXISTS idx_deductions_created_by_fk ON public.deductions (created_by);
CREATE INDEX IF NOT EXISTS idx_deductions_payroll_item_id_fk ON public.deductions (payroll_item_id);
CREATE INDEX IF NOT EXISTS idx_deductions_tenant_id_fk ON public.deductions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_departments_branch_id_fk ON public.departments (branch_id);
CREATE INDEX IF NOT EXISTS idx_departments_company_id_fk ON public.departments (company_id);
CREATE INDEX IF NOT EXISTS idx_departments_manager_id_fk ON public.departments (manager_id);
CREATE INDEX IF NOT EXISTS idx_departments_tenant_id_fk ON public.departments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_employees_created_by_fk ON public.employees (created_by);
CREATE INDEX IF NOT EXISTS idx_expenses_branch_id_fk ON public.expenses (branch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category_id_fk ON public.expenses (category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id_fk ON public.expenses (user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_user_id_fk ON public.inventory_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_approved_by_fk ON public.leave_requests (approved_by);
CREATE INDEX IF NOT EXISTS idx_leave_requests_created_by_fk ON public.leave_requests (created_by);
CREATE INDEX IF NOT EXISTS idx_leave_requests_leave_type_id_fk ON public.leave_requests (leave_type_id);
CREATE INDEX IF NOT EXISTS idx_leave_types_tenant_id_fk ON public.leave_types (tenant_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_employee_id_fk ON public.payroll_items (employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_tenant_id_fk ON public.payroll_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_approved_by_fk ON public.payroll_runs (approved_by);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_branch_id_fk ON public.payroll_runs (branch_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_created_by_fk ON public.payroll_runs (created_by);
CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id_fk ON public.profiles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product_id_fk ON public.purchase_items (product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_product_id_fk ON public.purchase_return_items (product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_tenant_id_fk ON public.purchase_return_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_branch_id_fk ON public.purchase_returns (branch_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_processed_by_fk ON public.purchase_returns (processed_by);
CREATE INDEX IF NOT EXISTS idx_purchases_branch_id_fk ON public.purchases (branch_id);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id_fk ON public.purchases (supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_user_id_fk ON public.purchases (user_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_custom_role_id_fk ON public.role_permissions (custom_role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_key_fk ON public.role_permissions (permission_key);
CREATE INDEX IF NOT EXISTS idx_role_permissions_tenant_id_fk ON public.role_permissions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sale_refund_items_product_id_fk ON public.sale_refund_items (product_id);
CREATE INDEX IF NOT EXISTS idx_sale_refund_items_tenant_id_fk ON public.sale_refund_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sale_refunds_branch_id_fk ON public.sale_refunds (branch_id);
CREATE INDEX IF NOT EXISTS idx_sale_refunds_cash_session_id_fk ON public.sale_refunds (cash_session_id);
CREATE INDEX IF NOT EXISTS idx_sale_refunds_processed_by_fk ON public.sale_refunds (processed_by);
CREATE INDEX IF NOT EXISTS idx_super_owners_granted_by_fk ON public.super_owners (granted_by);
CREATE INDEX IF NOT EXISTS idx_tenants_owner_id_fk ON public.tenants (owner_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_id_fk ON public.user_roles (tenant_id);
COMMIT;



-- =====================================================================
-- SOURCE MIGRATION: 20261111000018_optimize_rls_auth_uid_initplans.sql
-- =====================================================================

-- Evaluate auth.uid() once per statement in RLS policy predicates.
-- This preserves each policy's exact boolean logic while avoiding repeated
-- per-row JWT claim evaluation on large scans.
BEGIN;

DO $$
DECLARE
  p record;
  v_using text;
  v_check text;
  v_sql text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        COALESCE(qual, '') LIKE '%auth.uid()%'
        OR COALESCE(with_check, '') LIKE '%auth.uid()%'
      )
  LOOP
    v_using := CASE
      WHEN p.qual IS NULL THEN NULL
      ELSE replace(p.qual, 'auth.uid()', '(select auth.uid())')
    END;
    v_check := CASE
      WHEN p.with_check IS NULL THEN NULL
      ELSE replace(p.with_check, 'auth.uid()', '(select auth.uid())')
    END;

    v_sql := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    IF v_using IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', v_using);
    END IF;
    IF v_check IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', v_check);
    END IF;
    EXECUTE v_sql;
  END LOOP;
END;
$$;

COMMIT;



-- =====================================================================
-- SOURCE MIGRATION: 20261111000019_harden_definer_paths_and_inventory_branch_scope.sql
-- =====================================================================

-- Final SECURITY DEFINER search-path hardening and strict warehouse branch scope.
BEGIN;

CREATE OR REPLACE FUNCTION public.adjust_inventory_balance(
  _tenant_id uuid,
  _product_id uuid,
  _branch_id uuid,
  _target_quantity numeric,
  _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_current numeric(14,3);
  v_delta numeric(14,3);
BEGIN
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
$$;

REVOKE ALL ON FUNCTION public.adjust_inventory_balance(uuid, uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_balance(uuid, uuid, uuid, numeric, text) TO authenticated, service_role;

-- Pin pg_catalog first for every remaining SECURITY DEFINER entry point.
ALTER FUNCTION public.assign_invoice_no() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.bootstrap_first_super_owner(uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.clone_role_permissions(uuid, uuid, public.app_role, uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.create_tenant_with_owner(text, text, numeric) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.handle_new_user() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.log_audit_change() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.on_purchase_item_insert() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.on_sale_item_insert() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.prevent_leave_self_approval() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.reject_payroll_run(uuid, uuid, text, uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.replace_user_role_in_tenant(uuid, uuid, public.app_role, uuid, uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.touch_last_login() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.transfer_user_role_branch(uuid, uuid, uuid) SET search_path = pg_catalog, public, pg_temp;

ALTER FUNCTION private.can_access_branch(uuid, uuid, uuid) SET search_path = pg_catalog, public, private, pg_temp;
ALTER FUNCTION private.has_role(uuid, uuid, public.app_role) SET search_path = pg_catalog, public, private, pg_temp;
ALTER FUNCTION private.is_tenant_admin(uuid, uuid) SET search_path = pg_catalog, public, private, pg_temp;
ALTER FUNCTION private.is_tenant_member(uuid, uuid) SET search_path = pg_catalog, public, private, pg_temp;

COMMIT;



-- =====================================================================
-- SOURCE MIGRATION: 20261111000020_super_owner_return_visibility.sql
-- =====================================================================

-- Preserve global support visibility for super owners on newly introduced return records.
BEGIN;

ALTER POLICY "Members view refunds in accessible branches"
ON public.sale_refunds
USING (
  public.is_super_owner((select auth.uid()))
  OR private.can_access_branch((select auth.uid()), tenant_id, branch_id)
);

ALTER POLICY "Members view refund items via refund"
ON public.sale_refund_items
USING (
  public.is_super_owner((select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.sale_refunds r
    WHERE r.id = refund_id AND r.tenant_id = sale_refund_items.tenant_id
      AND private.can_access_branch((select auth.uid()), r.tenant_id, r.branch_id)
  )
);

ALTER POLICY "Members view supplier returns in accessible branches"
ON public.purchase_returns
USING (
  public.is_super_owner((select auth.uid()))
  OR private.can_access_branch((select auth.uid()), tenant_id, branch_id)
);

ALTER POLICY "Members view supplier return items via return"
ON public.purchase_return_items
USING (
  public.is_super_owner((select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.purchase_returns r
    WHERE r.id = purchase_return_id AND r.tenant_id = purchase_return_items.tenant_id
      AND private.can_access_branch((select auth.uid()), r.tenant_id, r.branch_id)
  )
);

COMMIT;



-- =====================================================================
-- SOURCE MIGRATION: 20261111000021_enforce_tenant_scoped_foreign_keys.sql
-- =====================================================================

-- Enforce tenant consistency for every single-column FK whose parent is tenant-scoped.
-- Existing data was audited before rollout; all checked relationships were clean.
BEGIN;

CREATE OR REPLACE FUNCTION private.enforce_same_tenant_foreign_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_parent_id uuid;
  v_tenant_id uuid;
  v_parent_matches boolean;
BEGIN
  v_parent_id := NULLIF(to_jsonb(NEW)->>TG_ARGV[1], '')::uuid;
  IF v_parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_tenant_id := NULLIF(to_jsonb(NEW)->>'tenant_id', '')::uuid;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant id is required for tenant-scoped reference on %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;

  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM public.%I WHERE %I = $1 AND tenant_id = $2)',
    TG_ARGV[0], TG_ARGV[2]
  )
  INTO v_parent_matches
  USING v_parent_id, v_tenant_id;

  IF NOT v_parent_matches THEN
    RAISE EXCEPTION 'Tenant mismatch: %.% must reference a row in the same tenant',
      TG_TABLE_NAME, TG_ARGV[1]
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_same_tenant_foreign_key() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_same_tenant_foreign_key() TO service_role;

DO $$
DECLARE
  c record;
  v_trigger_name text;
BEGIN
  FOR c IN
    SELECT con.conname, con.conrelid, con.confrelid,
           child_ns.nspname AS child_schema, child.relname AS child_table,
           parent.relname AS parent_table,
           child_att.attname AS child_column,
           parent_att.attname AS parent_column
    FROM pg_constraint con
    JOIN pg_class child ON child.oid = con.conrelid
    JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = con.confrelid
    JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
    JOIN pg_attribute child_att ON child_att.attrelid = con.conrelid AND child_att.attnum = con.conkey[1]
    JOIN pg_attribute parent_att ON parent_att.attrelid = con.confrelid AND parent_att.attnum = con.confkey[1]
    WHERE con.contype = 'f'
      AND child_ns.nspname = 'public'
      AND parent_ns.nspname = 'public'
      AND cardinality(con.conkey) = 1
      AND child_att.attname <> 'tenant_id'
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=con.conrelid AND a.attname='tenant_id' AND NOT a.attisdropped)
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=con.confrelid AND a.attname='tenant_id' AND NOT a.attisdropped)
  LOOP
    v_trigger_name := left('trg_tenant_fk_' || c.conname, 60);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I', v_trigger_name, c.child_schema, c.child_table);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I, tenant_id ON %I.%I FOR EACH ROW EXECUTE FUNCTION private.enforce_same_tenant_foreign_key(%L, %L, %L)',
      v_trigger_name, c.child_column, c.child_schema, c.child_table,
      c.parent_table, c.child_column, c.parent_column
    );
  END LOOP;
END;
$$;

COMMIT;


-- =====================================================================
-- SOURCE MIGRATION: 20261111000022_grant_private_tenant_trigger_execute.sql
-- =====================================================================

-- Trigger functions are invoked by table triggers for authenticated DML.
-- The private schema is not exposed through PostgREST; direct calls are not valid
-- because trigger functions can only run in trigger context.
GRANT EXECUTE ON FUNCTION private.enforce_same_tenant_foreign_key() TO authenticated, service_role;



-- =====================================================================
-- SOURCE MIGRATION: 20261111000023_least_privilege_return_api_and_defaults.sql
-- =====================================================================

-- Explicit least-privilege grants for return ledgers and safe defaults for future API objects.
BEGIN;

REVOKE ALL ON TABLE
  public.sale_refunds,
  public.sale_refund_items,
  public.purchase_returns,
  public.purchase_return_items
FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.sale_refunds,
  public.sale_refund_items,
  public.purchase_returns,
  public.purchase_return_items
TO authenticated, service_role;

REVOKE ALL ON TABLE public.sales_profitability FROM anon;
GRANT SELECT ON TABLE public.sales_profitability TO authenticated, service_role;

-- Prevent future public objects from becoming Data API reachable by default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;


-- =====================================================================
-- SOURCE MIGRATION: 20261111000024_read_only_profitability_view.sql
-- =====================================================================

-- The profitability view is read-only by design; expose SELECT only.
BEGIN;
REVOKE ALL ON TABLE public.sales_profitability FROM anon, authenticated, service_role;
GRANT SELECT ON TABLE public.sales_profitability TO authenticated, service_role;
COMMIT;



-- =====================================================================
-- SOURCE MIGRATION: 20261111000025_immutable_tenant_scope_and_branch_memberships.sql
-- =====================================================================

-- Tenant ownership is immutable after creation. Profiles are excluded because
-- the first-tenant bootstrap assigns their initial tenant_id.
BEGIN;

CREATE OR REPLACE FUNCTION private.prevent_tenant_scope_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
BEGIN
  IF OLD.tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'A record cannot be reassigned to another tenant'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_tenant_scope_reassignment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.prevent_tenant_scope_reassignment() TO service_role;

DO $$
DECLARE
  t record;
  trigger_name text;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relname <> 'profiles'
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid=c.oid AND a.attname='tenant_id' AND NOT a.attisdropped
      )
  LOOP
    trigger_name := 'trg_immutable_tenant_scope';
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_name, t.relname);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OF tenant_id ON public.%I FOR EACH ROW EXECUTE FUNCTION private.prevent_tenant_scope_reassignment()',
      trigger_name, t.relname
    );
  END LOOP;
END;
$$;

-- These two optional branch references do not currently have foreign keys.
-- Validate them with the same tenant-scoped trigger used for FK-backed columns.
DROP TRIGGER IF EXISTS trg_tenant_fk_user_roles_branch_id ON public.user_roles;
CREATE TRIGGER trg_tenant_fk_user_roles_branch_id
BEFORE INSERT OR UPDATE OF branch_id, tenant_id ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION private.enforce_same_tenant_foreign_key('branches', 'branch_id', 'id');

DROP TRIGGER IF EXISTS trg_tenant_fk_profiles_branch_id ON public.profiles;
CREATE TRIGGER trg_tenant_fk_profiles_branch_id
BEFORE INSERT OR UPDATE OF branch_id, tenant_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.enforce_same_tenant_foreign_key('branches', 'branch_id', 'id');

DROP TRIGGER IF EXISTS trg_tenant_fk_employees_user_id ON public.employees;
CREATE TRIGGER trg_tenant_fk_employees_user_id
BEFORE INSERT OR UPDATE OF user_id, tenant_id ON public.employees
FOR EACH ROW EXECUTE FUNCTION private.enforce_same_tenant_foreign_key('profiles', 'user_id', 'id');

COMMIT;



-- =====================================================================
-- SOURCE MIGRATION: 20261111000026_strict_tenant_immutability.sql
-- =====================================================================

-- Tighten tenant immutability: only a profile's first assignment may move NULL -> tenant.
BEGIN;

CREATE OR REPLACE FUNCTION private.prevent_tenant_scope_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'A record cannot be reassigned to another tenant'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.prevent_profile_tenant_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
BEGIN
  IF OLD.tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'A profile cannot be reassigned after its first tenant assignment'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_tenant_scope_reassignment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.prevent_profile_tenant_reassignment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.prevent_tenant_scope_reassignment() TO service_role;
GRANT EXECUTE ON FUNCTION private.prevent_profile_tenant_reassignment() TO service_role;

DROP TRIGGER IF EXISTS trg_immutable_tenant_scope ON public.profiles;
CREATE TRIGGER trg_immutable_tenant_scope
BEFORE UPDATE OF tenant_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.prevent_profile_tenant_reassignment();

COMMIT;



-- =====================================================================
-- SOURCE MIGRATION: 20261111000027_validate_unconstrained_tenant_references.sql
-- =====================================================================

-- Validate non-FK tenant relationships: organization/department scope,
-- user actors/targets, notification audiences, and polymorphic inventory references.
BEGIN;

-- Optional company and department references must remain inside the row's tenant.
DROP TRIGGER IF EXISTS trg_tenant_fk_profiles_company_id ON public.profiles;
CREATE TRIGGER trg_tenant_fk_profiles_company_id
BEFORE INSERT OR UPDATE OF company_id, tenant_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.enforce_same_tenant_foreign_key('companies','company_id','id');
DROP TRIGGER IF EXISTS trg_tenant_fk_profiles_department_id ON public.profiles;
CREATE TRIGGER trg_tenant_fk_profiles_department_id
BEFORE INSERT OR UPDATE OF department_id, tenant_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.enforce_same_tenant_foreign_key('departments','department_id','id');

DROP TRIGGER IF EXISTS trg_tenant_fk_user_roles_company_id ON public.user_roles;
CREATE TRIGGER trg_tenant_fk_user_roles_company_id
BEFORE INSERT OR UPDATE OF company_id, tenant_id ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION private.enforce_same_tenant_foreign_key('companies','company_id','id');
DROP TRIGGER IF EXISTS trg_tenant_fk_user_roles_department_id ON public.user_roles;
CREATE TRIGGER trg_tenant_fk_user_roles_department_id
BEFORE INSERT OR UPDATE OF department_id, tenant_id ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION private.enforce_same_tenant_foreign_key('departments','department_id','id');

CREATE OR REPLACE FUNCTION private.enforce_tenant_user_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_tenant_id uuid;
BEGIN
  v_user_id := NULLIF(to_jsonb(NEW)->>TG_ARGV[0], '')::uuid;
  v_tenant_id := NULLIF(to_jsonb(NEW)->>'tenant_id', '')::uuid;
  IF v_user_id IS NULL OR v_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.super_owners WHERE user_id=v_user_id) THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id=v_user_id AND tenant_id=v_tenant_id
  ) THEN
    RAISE EXCEPTION 'User reference must belong to the same tenant'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_tenant_user_membership() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_tenant_user_membership() TO authenticated, service_role;

DO $$
DECLARE
  item record;
  trigger_name text;
BEGIN
  FOR item IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema='public'
      AND data_type='uuid'
      AND column_name IN (
        'user_id','cashier_id','created_by','approved_by','granted_by',
        'hired_by','processed_by'
      )
      AND table_name IN (
        'audit_logs','bonuses','cash_sessions','deductions','employees',
        'expenses','inventory_transactions','leave_requests','login_history',
        'notifications','payroll_runs','profiles','purchases','sale_refunds',
        'sales','purchase_returns','user_permission_overrides','user_roles'
      )
      AND EXISTS (
        SELECT 1 FROM information_schema.columns t
        WHERE t.table_schema='public' AND t.table_name=columns.table_name
          AND t.column_name='tenant_id'
      )
      AND NOT (table_name='user_roles' AND column_name='user_id')
  LOOP
    trigger_name := left('trg_tenant_user_' || item.table_name || '_' || item.column_name, 60);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_name, item.table_name);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I, tenant_id ON public.%I FOR EACH ROW EXECUTE FUNCTION private.enforce_tenant_user_membership(%L)',
      trigger_name, item.column_name, item.table_name, item.column_name
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION private.enforce_notification_audience_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_matches boolean;
BEGIN
  IF NEW.audience_id IS NULL THEN
    IF NEW.audience_type IN ('branch','department','user') THEN
      RAISE EXCEPTION 'This notification audience requires an audience id'
        USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'Targeted notifications require a tenant'
      USING ERRCODE = '22023';
  END IF;

  CASE NEW.audience_type
    WHEN 'branch' THEN
      SELECT EXISTS (SELECT 1 FROM public.branches WHERE id=NEW.audience_id AND tenant_id=NEW.tenant_id) INTO v_matches;
    WHEN 'department' THEN
      SELECT EXISTS (SELECT 1 FROM public.departments WHERE id=NEW.audience_id AND tenant_id=NEW.tenant_id) INTO v_matches;
    WHEN 'user' THEN
      SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=NEW.audience_id AND tenant_id=NEW.tenant_id) INTO v_matches;
    ELSE
      v_matches := false;
  END CASE;

  IF NOT v_matches THEN
    RAISE EXCEPTION 'Notification audience does not belong to the selected tenant'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_notification_audience_tenant() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_notification_audience_tenant() TO authenticated, service_role;
DROP TRIGGER IF EXISTS trg_notification_audience_tenant ON public.notifications;
CREATE TRIGGER trg_notification_audience_tenant
BEFORE INSERT OR UPDATE OF audience_type, audience_id, tenant_id ON public.notifications
FOR EACH ROW EXECUTE FUNCTION private.enforce_notification_audience_tenant();

CREATE OR REPLACE FUNCTION private.enforce_inventory_reference_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_matches boolean;
BEGIN
  IF NEW.reference_id IS NULL OR NEW.reference_type IS NULL THEN
    RETURN NEW;
  END IF;

  CASE NEW.reference_type
    WHEN 'sale_refund' THEN
      SELECT EXISTS (SELECT 1 FROM public.sale_refunds WHERE id=NEW.reference_id AND tenant_id=NEW.tenant_id) INTO v_matches;
    WHEN 'purchase_return' THEN
      SELECT EXISTS (SELECT 1 FROM public.purchase_returns WHERE id=NEW.reference_id AND tenant_id=NEW.tenant_id) INTO v_matches;
    WHEN 'sale' THEN
      SELECT EXISTS (SELECT 1 FROM public.sales WHERE id=NEW.reference_id AND tenant_id=NEW.tenant_id) INTO v_matches;
    WHEN 'purchase' THEN
      SELECT EXISTS (SELECT 1 FROM public.purchases WHERE id=NEW.reference_id AND tenant_id=NEW.tenant_id) INTO v_matches;
    ELSE
      RETURN NEW;
  END CASE;

  IF NOT v_matches THEN
    RAISE EXCEPTION 'Inventory transaction reference does not belong to the selected tenant'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_inventory_reference_tenant() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_inventory_reference_tenant() TO authenticated, service_role;
DROP TRIGGER IF EXISTS trg_inventory_reference_tenant ON public.inventory_transactions;
CREATE TRIGGER trg_inventory_reference_tenant
BEFORE INSERT OR UPDATE OF reference_type, reference_id, tenant_id ON public.inventory_transactions
FOR EACH ROW EXECUTE FUNCTION private.enforce_inventory_reference_tenant();

COMMIT;



-- =====================================================================
-- SOURCE MIGRATION: 20261111000028_validate_notification_receipts.sql
-- =====================================================================

-- A notification receipt must belong to a user in the notification's tenant.
BEGIN;

CREATE OR REPLACE FUNCTION private.enforce_notification_read_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.notifications
  WHERE id = NEW.notification_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification does not exist' USING ERRCODE = '23503';
  END IF;

  IF EXISTS (SELECT 1 FROM public.super_owners WHERE user_id=NEW.user_id) THEN
    RETURN NEW;
  END IF;

  IF v_tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id=NEW.user_id AND tenant_id=v_tenant_id
  ) THEN
    RAISE EXCEPTION 'Notification reader must belong to the notification tenant'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_notification_read_tenant() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_notification_read_tenant() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_notification_read_tenant ON public.notification_reads;
CREATE TRIGGER trg_notification_read_tenant
BEFORE INSERT OR UPDATE OF notification_id, user_id ON public.notification_reads
FOR EACH ROW EXECUTE FUNCTION private.enforce_notification_read_tenant();

COMMIT;



-- =====================================================================
-- SOURCE MIGRATION: 20261111000029_validate_role_notification_audiences.sql
-- =====================================================================

-- Validate role-targeted notifications when an explicit audience user is supplied.
CREATE OR REPLACE FUNCTION private.enforce_notification_audience_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_matches boolean;
BEGIN
  IF NEW.audience_id IS NULL THEN
    IF NEW.audience_type IN ('branch','department','user') THEN
      RAISE EXCEPTION 'This notification audience requires an audience id'
        USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'Targeted notifications require a tenant'
      USING ERRCODE = '22023';
  END IF;

  CASE NEW.audience_type
    WHEN 'branch' THEN
      SELECT EXISTS (SELECT 1 FROM public.branches WHERE id=NEW.audience_id AND tenant_id=NEW.tenant_id) INTO v_matches;
    WHEN 'department' THEN
      SELECT EXISTS (SELECT 1 FROM public.departments WHERE id=NEW.audience_id AND tenant_id=NEW.tenant_id) INTO v_matches;
    WHEN 'user' THEN
      SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=NEW.audience_id AND tenant_id=NEW.tenant_id) INTO v_matches;
    WHEN 'owner' THEN
      SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=NEW.audience_id AND tenant_id=NEW.tenant_id AND role='owner') INTO v_matches;
    WHEN 'manager' THEN
      SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=NEW.audience_id AND tenant_id=NEW.tenant_id AND role='manager') INTO v_matches;
    ELSE
      v_matches := false;
  END CASE;

  IF NOT v_matches THEN
    RAISE EXCEPTION 'Notification audience does not belong to the selected tenant and audience type'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_notification_audience_tenant() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_notification_audience_tenant() TO authenticated, service_role;



-- =====================================================================
-- SOURCE MIGRATION: 20261111000030_prevent_cash_refund_overdraw.sql
-- =====================================================================

-- Do not allow a cash refund to overdraw the open cashier drawer.
BEGIN;

CREATE OR REPLACE FUNCTION private.prevent_cash_refund_overdraw()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_session public.cash_sessions%ROWTYPE;
  v_available numeric(12,2);
BEGIN
  IF NEW.refund_method <> 'cash' OR COALESCE(NEW.total,0) <= 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.cash_session_id IS NULL THEN
    RAISE EXCEPTION 'Cash refunds must be linked to an open cashier session'
      USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_session
  FROM public.cash_sessions
  WHERE id=NEW.cash_session_id
    AND tenant_id=NEW.tenant_id
    AND branch_id=NEW.branch_id
    AND status='open'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cash refund session is missing, closed, or belongs to another branch'
      USING ERRCODE = '55000';
  END IF;

  SELECT round(
    v_session.opening_balance
    + COALESCE((
      SELECT sum(p.amount)
      FROM public.payments p
      JOIN public.sales s ON s.id=p.sale_id
      WHERE s.session_id=v_session.id
        AND s.tenant_id=v_session.tenant_id
        AND s.status IN ('completed','refunded')
        AND p.method='cash'
    ),0)
    - COALESCE((
      SELECT sum(r.total)
      FROM public.sale_refunds r
      WHERE r.cash_session_id=v_session.id
        AND r.tenant_id=v_session.tenant_id
        AND r.refund_method='cash'
        AND r.id IS DISTINCT FROM NEW.id
    ),0),2
  ) INTO v_available;

  IF NEW.total > v_available THEN
    RAISE EXCEPTION 'Cash refund exceeds the available drawer balance (available: %, requested: %)',
      v_available, NEW.total
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_cash_refund_overdraw() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.prevent_cash_refund_overdraw() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_prevent_cash_refund_overdraw ON public.sale_refunds;
CREATE TRIGGER trg_prevent_cash_refund_overdraw
BEFORE INSERT OR UPDATE OF total, refund_method, cash_session_id, tenant_id, branch_id
ON public.sale_refunds
FOR EACH ROW EXECUTE FUNCTION private.prevent_cash_refund_overdraw();

COMMIT;



-- =====================================================================
-- SOURCE MIGRATION: 20261111000031_add_purchase_returned_status.sql
-- =====================================================================

-- Add an explicit terminal state for a purchase whose full quantity was returned.
ALTER TYPE public.purchase_status ADD VALUE IF NOT EXISTS 'returned';


-- =====================================================================
-- SOURCE MIGRATION: 20261111000032_mark_fully_returned_purchases.sql
-- =====================================================================

-- Mark a purchase as returned only after every received quantity has been returned.
BEGIN;

CREATE OR REPLACE FUNCTION private.mark_fully_returned_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_purchase_id uuid;
  v_purchased_quantity numeric(14,3);
  v_returned_quantity numeric(14,3);
BEGIN
  SELECT purchase_id INTO v_purchase_id
  FROM public.purchase_items
  WHERE id=NEW.purchase_item_id AND tenant_id=NEW.tenant_id;

  IF v_purchase_id IS NULL THEN
    RAISE EXCEPTION 'Purchase item not found for returned line'
      USING ERRCODE = '23503';
  END IF;

  SELECT COALESCE(sum(pi.quantity),0)
    INTO v_purchased_quantity
  FROM public.purchase_items pi
  WHERE pi.purchase_id=v_purchase_id AND pi.tenant_id=NEW.tenant_id;

  SELECT COALESCE(sum(pri.quantity),0)
    INTO v_returned_quantity
  FROM public.purchase_return_items pri
  JOIN public.purchase_returns pr ON pr.id=pri.purchase_return_id
  WHERE pr.purchase_id=v_purchase_id AND pr.tenant_id=NEW.tenant_id;

  IF v_purchased_quantity > 0 AND v_returned_quantity >= v_purchased_quantity THEN
    UPDATE public.purchases
       SET status='returned', updated_at=now()
     WHERE id=v_purchase_id AND tenant_id=NEW.tenant_id AND status='received';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.mark_fully_returned_purchase() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.mark_fully_returned_purchase() TO service_role;

DROP TRIGGER IF EXISTS trg_mark_fully_returned_purchase ON public.purchase_return_items;
CREATE TRIGGER trg_mark_fully_returned_purchase
AFTER INSERT ON public.purchase_return_items
FOR EACH ROW EXECUTE FUNCTION private.mark_fully_returned_purchase();

COMMIT;



-- =====================================================================
-- SOURCE MIGRATION: 20261111000033_require_active_branch_for_sales_and_sessions.sql
-- =====================================================================

-- Prevent opening cash sessions or recording new sales in inactive branches.
BEGIN;

CREATE OR REPLACE FUNCTION private.enforce_active_branch_for_operation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
  v_branch_id uuid;
BEGIN
  v_tenant_id := NULLIF(to_jsonb(NEW)->>'tenant_id','')::uuid;
  v_branch_id := NULLIF(to_jsonb(NEW)->>'branch_id','')::uuid;

  IF v_tenant_id IS NULL OR v_branch_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.branches
    WHERE id=v_branch_id AND tenant_id=v_tenant_id AND is_active=true
  ) THEN
    RAISE EXCEPTION 'New sales and cash sessions require an active branch in the same tenant'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_active_branch_for_operation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_active_branch_for_operation() TO service_role;

DROP TRIGGER IF EXISTS trg_sales_active_branch ON public.sales;
CREATE TRIGGER trg_sales_active_branch
BEFORE INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION private.enforce_active_branch_for_operation();

DROP TRIGGER IF EXISTS trg_cash_sessions_active_branch ON public.cash_sessions;
CREATE TRIGGER trg_cash_sessions_active_branch
BEFORE INSERT ON public.cash_sessions
FOR EACH ROW EXECUTE FUNCTION private.enforce_active_branch_for_operation();

COMMIT;

-- =====================================================================
-- SOURCE MIGRATION: 20261111000034_allow_super_owners_tenant_admin_rls.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION private.is_tenant_admin(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
AS $function$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.super_owners so
      WHERE so.user_id = _user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.tenant_id = _tenant_id
        AND ur.role IN ('owner', 'manager')
    );
$function$;

-- =====================================================================
-- SOURCE MIGRATION: 20261111030810_prevent_negative_inventory_bootstrap.sql
-- =====================================================================

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

-- SOURCE MIGRATION: 20261111033000_enforce_role_permissions.sql
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
        ELSIF r.table_name='employees' THEN
          EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (user_id = (select auth.uid()) OR public.has_permission((select auth.uid()), tenant_id, %L))', v_policy, r.table_name, v_key);
        ELSIF r.table_name IN ('attendance','bonuses','deductions','leave_requests','payroll_items') THEN
          EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.employees e WHERE e.id = %I.employee_id AND e.tenant_id = %I.tenant_id AND e.user_id = (select auth.uid())) OR public.has_permission((select auth.uid()), tenant_id, %L))', v_policy, r.table_name, r.table_name, r.table_name, v_key);
        ELSIF r.table_name='login_history' THEN
          EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (user_id = (select auth.uid()) OR public.has_permission((select auth.uid()), tenant_id, %L))', v_policy, r.table_name, v_key);
        ELSIF r.table_name='user_permission_overrides' THEN
          EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (user_id = (select auth.uid()) OR public.has_permission((select auth.uid()), tenant_id, %L))', v_policy, r.table_name, v_key);
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


-- Broaden only tenant/branch-scoped permissive access; restrictive permission gates above remain authoritative.
DO $permission_scopes$
DECLARE
  r record;
  v_cmd text;
  v_expr text;
  v_policy text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('audit_logs', 'private.is_tenant_member((select auth.uid()), tenant_id)', NULL, NULL, NULL),
    ('branches', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)'),
    ('categories', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)'),
    ('companies', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)'),
    ('customers', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)'),
    ('custom_roles', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)'),
    ('departments', 'private.is_tenant_member((select auth.uid()), tenant_id) AND (branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id))', 'private.is_tenant_member((select auth.uid()), tenant_id) AND (branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id))', 'private.is_tenant_member((select auth.uid()), tenant_id) AND (branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id))', 'private.is_tenant_member((select auth.uid()), tenant_id) AND (branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id))'),
    ('employment_types', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)'),
    ('expense_categories', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)'),
    ('expenses', 'private.can_access_branch((select auth.uid()), tenant_id, branch_id)', 'user_id = (select auth.uid()) AND private.can_access_branch((select auth.uid()), tenant_id, branch_id)', 'private.can_access_branch((select auth.uid()), tenant_id, branch_id)', 'private.can_access_branch((select auth.uid()), tenant_id, branch_id)'),
    ('inventory', 'private.can_access_branch((select auth.uid()), tenant_id, branch_id)', 'private.can_access_branch((select auth.uid()), tenant_id, branch_id)', 'private.can_access_branch((select auth.uid()), tenant_id, branch_id)', 'private.can_access_branch((select auth.uid()), tenant_id, branch_id)'),
    ('inventory_transactions', 'private.can_access_branch((select auth.uid()), tenant_id, branch_id)', 'private.can_access_branch((select auth.uid()), tenant_id, branch_id)', NULL, NULL),
    ('job_titles', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)'),
    ('login_history', 'private.is_tenant_member((select auth.uid()), tenant_id)', NULL, NULL, NULL),
    ('employees', 'private.is_tenant_member((select auth.uid()), tenant_id) AND (branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id))', 'private.is_tenant_member((select auth.uid()), tenant_id) AND (branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id))', 'private.is_tenant_member((select auth.uid()), tenant_id) AND (branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id))', 'private.is_tenant_member((select auth.uid()), tenant_id) AND (branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id))'),
    ('attendance', 'EXISTS (SELECT 1 FROM public.employees e WHERE e.id = attendance.employee_id AND e.tenant_id = attendance.tenant_id AND (e.user_id = (select auth.uid()) OR e.branch_id IS NULL OR private.can_access_branch((select auth.uid()), e.tenant_id, e.branch_id)))', 'EXISTS (SELECT 1 FROM public.employees e WHERE e.id = attendance.employee_id AND e.tenant_id = attendance.tenant_id AND (e.branch_id IS NULL OR private.can_access_branch((select auth.uid()), e.tenant_id, e.branch_id)))', 'EXISTS (SELECT 1 FROM public.employees e WHERE e.id = attendance.employee_id AND e.tenant_id = attendance.tenant_id AND (e.branch_id IS NULL OR private.can_access_branch((select auth.uid()), e.tenant_id, e.branch_id)))', 'EXISTS (SELECT 1 FROM public.employees e WHERE e.id = attendance.employee_id AND e.tenant_id = attendance.tenant_id AND (e.branch_id IS NULL OR private.can_access_branch((select auth.uid()), e.tenant_id, e.branch_id)))'),
    ('bonuses', 'EXISTS (SELECT 1 FROM public.employees e WHERE e.id = bonuses.employee_id AND e.tenant_id = bonuses.tenant_id AND (e.user_id = (select auth.uid()) OR e.branch_id IS NULL OR private.can_access_branch((select auth.uid()), e.tenant_id, e.branch_id)))', 'EXISTS (SELECT 1 FROM public.employees e WHERE e.id = bonuses.employee_id AND e.tenant_id = bonuses.tenant_id AND (e.branch_id IS NULL OR private.can_access_branch((select auth.uid()), e.tenant_id, e.branch_id)))', 'EXISTS (SELECT 1 FROM public.employees e WHERE e.id = bonuses.employee_id AND e.tenant_id = bonuses.tenant_id AND (e.branch_id IS NULL OR private.can_access_branch((select auth.uid()), e.tenant_id, e.branch_id)))', 'EXISTS (SELECT 1 FROM public.employees e WHERE e.id = bonuses.employee_id AND e.tenant_id = bonuses.tenant_id AND (e.branch_id IS NULL OR private.can_access_branch((select auth.uid()), e.tenant_id, e.branch_id)))'),
    ('deductions', 'EXISTS (SELECT 1 FROM public.employees e WHERE e.id = deductions.employee_id AND e.tenant_id = deductions.tenant_id AND (e.user_id = (select auth.uid()) OR e.branch_id IS NULL OR private.can_access_branch((select auth.uid()), e.tenant_id, e.branch_id)))', 'EXISTS (SELECT 1 FROM public.employees e WHERE e.id = deductions.employee_id AND e.tenant_id = deductions.tenant_id AND (e.branch_id IS NULL OR private.can_access_branch((select auth.uid()), e.tenant_id, e.branch_id)))', 'EXISTS (SELECT 1 FROM public.employees e WHERE e.id = deductions.employee_id AND e.tenant_id = deductions.tenant_id AND (e.branch_id IS NULL OR private.can_access_branch((select auth.uid()), e.tenant_id, e.branch_id)))', 'EXISTS (SELECT 1 FROM public.employees e WHERE e.id = deductions.employee_id AND e.tenant_id = deductions.tenant_id AND (e.branch_id IS NULL OR private.can_access_branch((select auth.uid()), e.tenant_id, e.branch_id)))'),
    ('leave_types', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)'),
    ('leave_requests', 'EXISTS (SELECT 1 FROM public.employees e WHERE e.id = leave_requests.employee_id AND e.tenant_id = leave_requests.tenant_id AND (e.user_id = (select auth.uid()) OR e.branch_id IS NULL OR private.can_access_branch((select auth.uid()), e.tenant_id, e.branch_id)))', 'EXISTS (SELECT 1 FROM public.employees e WHERE e.id = leave_requests.employee_id AND e.tenant_id = leave_requests.tenant_id AND e.user_id = (select auth.uid()))', 'EXISTS (SELECT 1 FROM public.employees e WHERE e.id = leave_requests.employee_id AND e.tenant_id = leave_requests.tenant_id AND (e.branch_id IS NULL OR private.can_access_branch((select auth.uid()), e.tenant_id, e.branch_id)))', NULL),
    ('payroll_runs', 'branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id)', 'branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id)', 'branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id)', 'branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id)'),
    ('payroll_items', 'EXISTS (SELECT 1 FROM public.payroll_runs r WHERE r.id = payroll_items.payroll_run_id AND r.tenant_id = payroll_items.tenant_id AND (r.branch_id IS NULL OR private.can_access_branch((select auth.uid()), r.tenant_id, r.branch_id))) OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = payroll_items.employee_id AND e.user_id = (select auth.uid()))', 'EXISTS (SELECT 1 FROM public.payroll_runs r WHERE r.id = payroll_items.payroll_run_id AND r.tenant_id = payroll_items.tenant_id AND (r.branch_id IS NULL OR private.can_access_branch((select auth.uid()), r.tenant_id, r.branch_id)))', 'EXISTS (SELECT 1 FROM public.payroll_runs r WHERE r.id = payroll_items.payroll_run_id AND r.tenant_id = payroll_items.tenant_id AND (r.branch_id IS NULL OR private.can_access_branch((select auth.uid()), r.tenant_id, r.branch_id)))', 'EXISTS (SELECT 1 FROM public.payroll_runs r WHERE r.id = payroll_items.payroll_run_id AND r.tenant_id = payroll_items.tenant_id AND (r.branch_id IS NULL OR private.can_access_branch((select auth.uid()), r.tenant_id, r.branch_id)))'),
    ('products', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)'),
    ('purchases', 'private.can_access_branch((select auth.uid()), tenant_id, branch_id)', 'user_id = (select auth.uid()) AND private.can_access_branch((select auth.uid()), tenant_id, branch_id)', 'private.can_access_branch((select auth.uid()), tenant_id, branch_id)', 'private.can_access_branch((select auth.uid()), tenant_id, branch_id)'),
    ('purchase_items', 'EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_items.purchase_id AND p.tenant_id = purchase_items.tenant_id AND private.can_access_branch((select auth.uid()), p.tenant_id, p.branch_id))', 'EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_items.purchase_id AND p.tenant_id = purchase_items.tenant_id AND p.user_id = (select auth.uid()) AND private.can_access_branch((select auth.uid()), p.tenant_id, p.branch_id))', 'EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_items.purchase_id AND p.tenant_id = purchase_items.tenant_id AND private.can_access_branch((select auth.uid()), p.tenant_id, p.branch_id))', 'EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_items.purchase_id AND p.tenant_id = purchase_items.tenant_id AND private.can_access_branch((select auth.uid()), p.tenant_id, p.branch_id))'),
    ('purchase_returns', 'private.can_access_branch((select auth.uid()), tenant_id, branch_id)', 'private.can_access_branch((select auth.uid()), tenant_id, branch_id)', 'private.can_access_branch((select auth.uid()), tenant_id, branch_id)', 'private.can_access_branch((select auth.uid()), tenant_id, branch_id)'),
    ('purchase_return_items', 'EXISTS (SELECT 1 FROM public.purchase_returns r WHERE r.id = purchase_return_items.purchase_return_id AND r.tenant_id = purchase_return_items.tenant_id AND private.can_access_branch((select auth.uid()), r.tenant_id, r.branch_id))', 'EXISTS (SELECT 1 FROM public.purchase_returns r WHERE r.id = purchase_return_items.purchase_return_id AND r.tenant_id = purchase_return_items.tenant_id AND private.can_access_branch((select auth.uid()), r.tenant_id, r.branch_id))', 'EXISTS (SELECT 1 FROM public.purchase_returns r WHERE r.id = purchase_return_items.purchase_return_id AND r.tenant_id = purchase_return_items.tenant_id AND private.can_access_branch((select auth.uid()), r.tenant_id, r.branch_id))', 'EXISTS (SELECT 1 FROM public.purchase_returns r WHERE r.id = purchase_return_items.purchase_return_id AND r.tenant_id = purchase_return_items.tenant_id AND private.can_access_branch((select auth.uid()), r.tenant_id, r.branch_id))'),
    ('sales', 'private.can_access_branch((select auth.uid()), tenant_id, branch_id)', 'cashier_id = (select auth.uid()) AND private.can_access_branch((select auth.uid()), tenant_id, branch_id)', 'private.can_access_branch((select auth.uid()), tenant_id, branch_id)', 'private.can_access_branch((select auth.uid()), tenant_id, branch_id)'),
    ('sale_items', 'EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_items.sale_id AND s.tenant_id = sale_items.tenant_id AND private.can_access_branch((select auth.uid()), s.tenant_id, s.branch_id))', 'EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_items.sale_id AND s.tenant_id = sale_items.tenant_id AND s.cashier_id = (select auth.uid()) AND private.can_access_branch((select auth.uid()), s.tenant_id, s.branch_id))', 'EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_items.sale_id AND s.tenant_id = sale_items.tenant_id AND private.can_access_branch((select auth.uid()), s.tenant_id, s.branch_id))', 'EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_items.sale_id AND s.tenant_id = sale_items.tenant_id AND private.can_access_branch((select auth.uid()), s.tenant_id, s.branch_id))'),
    ('payments', 'EXISTS (SELECT 1 FROM public.sales s WHERE s.id = payments.sale_id AND s.tenant_id = payments.tenant_id AND private.can_access_branch((select auth.uid()), s.tenant_id, s.branch_id))', 'EXISTS (SELECT 1 FROM public.sales s WHERE s.id = payments.sale_id AND s.tenant_id = payments.tenant_id AND s.cashier_id = (select auth.uid()) AND private.can_access_branch((select auth.uid()), s.tenant_id, s.branch_id))', 'EXISTS (SELECT 1 FROM public.sales s WHERE s.id = payments.sale_id AND s.tenant_id = payments.tenant_id AND private.can_access_branch((select auth.uid()), s.tenant_id, s.branch_id))', 'EXISTS (SELECT 1 FROM public.sales s WHERE s.id = payments.sale_id AND s.tenant_id = payments.tenant_id AND private.can_access_branch((select auth.uid()), s.tenant_id, s.branch_id))'),
    ('sale_refunds', 'private.can_access_branch((select auth.uid()), tenant_id, branch_id)', 'private.can_access_branch((select auth.uid()), tenant_id, branch_id)', 'private.can_access_branch((select auth.uid()), tenant_id, branch_id)', 'private.can_access_branch((select auth.uid()), tenant_id, branch_id)'),
    ('sale_refund_items', 'EXISTS (SELECT 1 FROM public.sale_refunds r WHERE r.id = sale_refund_items.refund_id AND r.tenant_id = sale_refund_items.tenant_id AND private.can_access_branch((select auth.uid()), r.tenant_id, r.branch_id))', 'EXISTS (SELECT 1 FROM public.sale_refunds r WHERE r.id = sale_refund_items.refund_id AND r.tenant_id = sale_refund_items.tenant_id AND private.can_access_branch((select auth.uid()), r.tenant_id, r.branch_id))', 'EXISTS (SELECT 1 FROM public.sale_refunds r WHERE r.id = sale_refund_items.refund_id AND r.tenant_id = sale_refund_items.tenant_id AND private.can_access_branch((select auth.uid()), r.tenant_id, r.branch_id))', 'EXISTS (SELECT 1 FROM public.sale_refunds r WHERE r.id = sale_refund_items.refund_id AND r.tenant_id = sale_refund_items.tenant_id AND private.can_access_branch((select auth.uid()), r.tenant_id, r.branch_id))'),
    ('suppliers', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)', 'private.is_tenant_member((select auth.uid()), tenant_id)')
  ) AS m(table_name, select_scope, insert_scope, update_scope, delete_scope)
  LOOP
    IF to_regclass(format('public.%I', r.table_name)) IS NULL THEN CONTINUE; END IF;
    FOREACH v_cmd IN ARRAY ARRAY['select','insert','update','delete'] LOOP
      v_expr := CASE v_cmd
        WHEN 'select' THEN r.select_scope
        WHEN 'insert' THEN r.insert_scope
        WHEN 'update' THEN r.update_scope
        ELSE r.delete_scope
      END;
      IF v_expr IS NULL THEN CONTINUE; END IF;
      v_policy := 'permission_scope_' || r.table_name || '_' || v_cmd;
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy, r.table_name);
      IF v_cmd='select' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR SELECT TO authenticated USING (%s)', v_policy, r.table_name, v_expr);
      ELSIF v_cmd='insert' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (%s)', v_policy, r.table_name, v_expr);
      ELSIF v_cmd='update' THEN
        EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', v_policy, r.table_name, v_expr, v_expr);
      ELSE
        EXECUTE format('CREATE POLICY %I ON public.%I AS PERMISSIVE FOR DELETE TO authenticated USING (%s)', v_policy, r.table_name, v_expr);
      END IF;
    END LOOP;
  END LOOP;
END
$permission_scopes$;



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
    public.is_super_owner(auth.uid())
    OR private.can_access_branch(auth.uid(), _tenant_id, _branch_id)
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
    public.is_super_owner(auth.uid())
    OR private.can_access_branch(auth.uid(), _tenant_id, v_purchase.branch_id)
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
  IF NOT (
    public.is_super_owner(auth.uid())
    OR private.can_access_branch(auth.uid(), _tenant_id, _branch_id)
  ) THEN RAISE EXCEPTION 'You cannot receive purchases in this branch' USING ERRCODE = '42501'; END IF;
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
  IF NOT (
    public.is_super_owner(auth.uid())
    OR private.can_access_branch(auth.uid(), _tenant_id, v_sale.branch_id)
  ) THEN
    RAISE EXCEPTION 'You cannot refund sales in this branch' USING ERRCODE = '42501';
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
  OR (
    status = 'pending'
    AND EXISTS (SELECT 1 FROM public.employees e
      WHERE e.id = leave_requests.employee_id
        AND e.tenant_id = leave_requests.tenant_id
        AND e.user_id = (select auth.uid()))
  )
)
WITH CHECK (
  public.has_permission((select auth.uid()), tenant_id, 'hr.leaves.approve')
  OR public.has_permission((select auth.uid()), tenant_id, 'hr.leaves.reject')
  OR (
    status = 'pending'
    AND EXISTS (SELECT 1 FROM public.employees e
      WHERE e.id = leave_requests.employee_id
        AND e.tenant_id = leave_requests.tenant_id
        AND e.user_id = (select auth.uid()))
  )
);




-- Identity and membership records remain self-readable while staff access is permission-gated.
DROP POLICY IF EXISTS permission_gate_profiles_select ON public.profiles;
CREATE POLICY permission_gate_profiles_select ON public.profiles
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  id = (select auth.uid())
  OR public.has_permission((select auth.uid()), tenant_id, 'users.view')
);

DROP POLICY IF EXISTS permission_gate_profiles_update ON public.profiles;
CREATE POLICY permission_gate_profiles_update ON public.profiles
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  id = (select auth.uid())
  OR public.has_permission((select auth.uid()), tenant_id, 'users.edit')
)
WITH CHECK (
  id = (select auth.uid())
  OR public.has_permission((select auth.uid()), tenant_id, 'users.edit')
);

DROP POLICY IF EXISTS permission_gate_user_roles_select ON public.user_roles;
CREATE POLICY permission_gate_user_roles_select ON public.user_roles
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  user_id = (select auth.uid())
  OR public.has_permission((select auth.uid()), tenant_id, 'users.view')
);

DROP POLICY IF EXISTS permission_gate_user_roles_insert ON public.user_roles;
CREATE POLICY permission_gate_user_roles_insert ON public.user_roles
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  public.has_permission((select auth.uid()), tenant_id, 'users.create')
  OR public.has_permission((select auth.uid()), tenant_id, 'users.change_role')
);

DROP POLICY IF EXISTS permission_gate_user_roles_update ON public.user_roles;
CREATE POLICY permission_gate_user_roles_update ON public.user_roles
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (public.has_permission((select auth.uid()), tenant_id, 'users.change_role'))
WITH CHECK (public.has_permission((select auth.uid()), tenant_id, 'users.change_role'));

DROP POLICY IF EXISTS permission_gate_user_roles_delete ON public.user_roles;
CREATE POLICY permission_gate_user_roles_delete ON public.user_roles
AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.has_permission((select auth.uid()), tenant_id, 'users.delete'));

DROP POLICY IF EXISTS permission_gate_tenants_select ON public.tenants;
CREATE POLICY permission_gate_tenants_select ON public.tenants
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  public.has_permission((select auth.uid()), id, 'dashboard.view')
  OR public.is_super_owner((select auth.uid()))
);

DROP POLICY IF EXISTS permission_gate_tenants_update ON public.tenants;
CREATE POLICY permission_gate_tenants_update ON public.tenants
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (public.has_permission((select auth.uid()), id, 'settings.manage'))
WITH CHECK (public.has_permission((select auth.uid()), id, 'settings.manage'));

DROP POLICY IF EXISTS permission_gate_login_history_select ON public.login_history;
CREATE POLICY permission_gate_login_history_select ON public.login_history
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  user_id = (select auth.uid())
  OR public.has_permission((select auth.uid()), tenant_id, 'login_history.view')
);

DROP POLICY IF EXISTS permission_gate_notification_reads_select ON public.notification_reads;
CREATE POLICY permission_gate_notification_reads_select ON public.notification_reads
AS RESTRICTIVE FOR SELECT TO authenticated
USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS permission_gate_notification_reads_insert ON public.notification_reads;
CREATE POLICY permission_gate_notification_reads_insert ON public.notification_reads
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS permission_gate_notification_reads_update ON public.notification_reads;
CREATE POLICY permission_gate_notification_reads_update ON public.notification_reads
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (user_id = (select auth.uid()))
WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS permission_gate_notification_reads_delete ON public.notification_reads;
CREATE POLICY permission_gate_notification_reads_delete ON public.notification_reads
AS RESTRICTIVE FOR DELETE TO authenticated
USING (user_id = (select auth.uid()));


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
  (NULL, 'builtin', 'warehouse'::public.app_role, 'categories.view'),
  (NULL, 'builtin', 'manager'::public.app_role, 'permissions.manage'),
  (NULL, 'builtin', 'accountant'::public.app_role, 'hr.employees.view'),
  (NULL, 'builtin', 'accountant'::public.app_role, 'hr.compensation.view'),
  (NULL, 'builtin', 'accountant'::public.app_role, 'hr.attendance.view')
ON CONFLICT DO NOTHING;

-- Waiters create table orders; they do not own cash sessions or finalize payments.
DELETE FROM public.role_permissions
WHERE tenant_id IS NULL
  AND role_kind = 'builtin'
  AND builtin_role = 'waiter'::public.app_role
  AND permission_key = 'pos.create_sale';


COMMIT;

-- SOURCE MIGRATION: 20261111035000_get_my_permissions_invoker.sql
-- The effective-permissions RPC only reads the caller's own membership and delegates
-- protected permission checks to the narrowly scoped has_permission SECURITY DEFINER.
ALTER FUNCTION public.get_my_permissions(uuid) SECURITY INVOKER;

-- SOURCE MIGRATION: 20261111040000_fix_cashier_pos_checkout_permissions.sql
-- Restore the minimum built-in cashier permissions required by the POS checkout flow.
-- Idempotent: safe to apply more than once. Does not grant administrative permissions.
BEGIN;

INSERT INTO public.role_permissions (tenant_id, role_kind, builtin_role, permission_key)
SELECT NULL, 'builtin', 'cashier'::public.app_role, p.permission_key
FROM (VALUES
  ('pos.view'),
  ('pos.use'),
  ('pos.create_sale'),
  ('sales.view'),
  ('sales.print'),
  ('cash.view'),
  ('cash.open'),
  ('cash.close')
) AS p(permission_key)
WHERE EXISTS (
  SELECT 1 FROM public.permissions catalogue WHERE catalogue.key = p.permission_key
)
ON CONFLICT DO NOTHING;

COMMIT;


-- =====================================================================
-- SOURCE MIGRATION: 20261112010000_restaurant_image_storage_foundation.sql
-- =====================================================================

-- Shared image storage for restaurant products, profiles, branches and promotions.
-- Public read is intentional for catalog/marketing imagery; writes remain tenant-scoped.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('restaurant-assets', 'restaurant-assets', true, 5242880, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Restaurant assets public read" on storage.objects for select to public using (bucket_id = 'restaurant-assets');
create policy "Restaurant assets tenant upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'restaurant-assets' and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and (private.is_tenant_admin(auth.uid(), split_part(name, '/', 1)::uuid)
    or (split_part(name, '/', 2) = 'profiles' and split_part(name, '/', 3) = auth.uid()::text and private.is_tenant_member(auth.uid(), split_part(name, '/', 1)::uuid))
    or public.is_super_owner(auth.uid()))
);
create policy "Restaurant assets tenant update" on storage.objects for update to authenticated
using (bucket_id = 'restaurant-assets' and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and (private.is_tenant_admin(auth.uid(), split_part(name, '/', 1)::uuid)
    or (split_part(name, '/', 2) = 'profiles' and split_part(name, '/', 3) = auth.uid()::text and private.is_tenant_member(auth.uid(), split_part(name, '/', 1)::uuid))
    or public.is_super_owner(auth.uid())))
with check (bucket_id = 'restaurant-assets' and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and (private.is_tenant_admin(auth.uid(), split_part(name, '/', 1)::uuid)
    or (split_part(name, '/', 2) = 'profiles' and split_part(name, '/', 3) = auth.uid()::text and private.is_tenant_member(auth.uid(), split_part(name, '/', 1)::uuid))
    or public.is_super_owner(auth.uid())));
create policy "Restaurant assets tenant delete" on storage.objects for delete to authenticated using (
  bucket_id = 'restaurant-assets' and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and (private.is_tenant_admin(auth.uid(), split_part(name, '/', 1)::uuid)
    or (split_part(name, '/', 2) = 'profiles' and split_part(name, '/', 3) = auth.uid()::text and private.is_tenant_member(auth.uid(), split_part(name, '/', 1)::uuid))
    or public.is_super_owner(auth.uid()))
);


-- =====================================================================
-- SOURCE MIGRATION: 20261112020000_marketing_campaigns_management.sql
-- =====================================================================

-- Tenant-scoped promotional campaigns and in-app advertising placements.
create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  description text not null default '' check (char_length(description) <= 500),
  image_url text,
  target_url text,
  placement text not null default 'dashboard_banner' check (placement in ('dashboard_banner','dashboard_card','pos_promo')),
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_campaign_dates_valid check (starts_at is null or ends_at is null or ends_at > starts_at)
);
create index if not exists marketing_campaigns_tenant_status_idx on public.marketing_campaigns (tenant_id, status, sort_order, created_at desc);
alter table public.marketing_campaigns enable row level security;
drop policy if exists "Tenant members read marketing campaigns" on public.marketing_campaigns;
create policy "Tenant members read marketing campaigns" on public.marketing_campaigns for select to authenticated using (private.is_tenant_member(auth.uid(), tenant_id) or public.is_super_owner(auth.uid()));
drop policy if exists "Tenant admins manage marketing campaigns" on public.marketing_campaigns;
create policy "Tenant admins manage marketing campaigns" on public.marketing_campaigns for all to authenticated using (private.is_tenant_admin(auth.uid(), tenant_id) or public.is_super_owner(auth.uid())) with check (private.is_tenant_admin(auth.uid(), tenant_id) or public.is_super_owner(auth.uid()));
drop trigger if exists set_marketing_campaigns_updated_at on public.marketing_campaigns;
create trigger set_marketing_campaigns_updated_at before update on public.marketing_campaigns for each row execute function public.set_updated_at();


-- Migration 62: supplier_payment_ledger
-- Supplier payment ledger: immutable, tenant- and branch-scoped records.
-- Cash drawer balances are intentionally not modified by this ledger.
begin;

alter table public.suppliers
  add constraint suppliers_id_tenant_unique unique (id, tenant_id);

alter table public.branches
  add constraint branches_id_tenant_unique unique (id, tenant_id);

create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid not null,
  supplier_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null check (payment_method in ('cash','card','transfer','cheque','other')),
  reference text,
  notes text,
  paid_at timestamptz not null default now(),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint supplier_payments_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete restrict,
  constraint supplier_payments_branch_tenant_fkey foreign key (branch_id, tenant_id) references public.branches(id, tenant_id) on delete restrict,
  constraint supplier_payments_supplier_tenant_fkey foreign key (supplier_id, tenant_id) references public.suppliers(id, tenant_id) on delete restrict,
  constraint supplier_payments_created_by_fkey foreign key (created_by) references auth.users(id) on delete restrict,
  constraint supplier_payments_reference_length check (reference is null or length(reference) <= 120),
  constraint supplier_payments_notes_length check (notes is null or length(notes) <= 1000)
);

create index supplier_payments_tenant_supplier_date_idx
  on public.supplier_payments (tenant_id, supplier_id, paid_at desc, id desc);
create index supplier_payments_branch_date_idx
  on public.supplier_payments (tenant_id, branch_id, paid_at desc);

alter table public.supplier_payments enable row level security;

create policy supplier_payments_select
  on public.supplier_payments for select to authenticated
  using (
    (public.is_super_owner((select auth.uid()))
      or public.has_permission((select auth.uid()), tenant_id, 'suppliers.view'))
    and private.can_access_branch((select auth.uid()), tenant_id, branch_id)
  );

create policy supplier_payments_insert
  on public.supplier_payments for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (public.is_super_owner((select auth.uid()))
      or public.has_permission((select auth.uid()), tenant_id, 'suppliers.manage'))
    and private.can_access_branch((select auth.uid()), tenant_id, branch_id)
  );

comment on table public.supplier_payments is
  'Immutable supplier payment ledger. Does not mutate cash sessions or accounting cash balances.';

commit;
