
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
