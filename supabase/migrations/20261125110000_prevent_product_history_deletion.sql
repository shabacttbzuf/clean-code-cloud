-- Products are archived, not physically deleted: inventory history must survive.
BEGIN;

DROP POLICY IF EXISTS "Tenant admins manage products" ON public.products;
DROP POLICY IF EXISTS "Tenant members view products" ON public.products;

CREATE POLICY products_select_permission
ON public.products AS PERMISSIVE
FOR SELECT TO authenticated
USING (
  public.is_super_owner((SELECT auth.uid()))
  OR private.is_tenant_member((SELECT auth.uid()), tenant_id)
);

CREATE POLICY products_create_permission
ON public.products AS PERMISSIVE
FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_owner((SELECT auth.uid()))
  OR (
    private.is_tenant_member((SELECT auth.uid()), tenant_id)
    AND (
      public.has_permission((SELECT auth.uid()), tenant_id, 'products.create')
      OR public.has_permission((SELECT auth.uid()), tenant_id, 'products.manage')
    )
  )
);

CREATE POLICY products_update_permission
ON public.products AS PERMISSIVE
FOR UPDATE TO authenticated
USING (
  public.is_super_owner((SELECT auth.uid()))
  OR (
    private.is_tenant_member((SELECT auth.uid()), tenant_id)
    AND (
      public.has_permission((SELECT auth.uid()), tenant_id, 'products.edit')
      OR public.has_permission((SELECT auth.uid()), tenant_id, 'products.manage')
    )
  )
)
WITH CHECK (
  public.is_super_owner((SELECT auth.uid()))
  OR (
    private.is_tenant_member((SELECT auth.uid()), tenant_id)
    AND (
      public.has_permission((SELECT auth.uid()), tenant_id, 'products.edit')
      OR public.has_permission((SELECT auth.uid()), tenant_id, 'products.manage')
    )
  )
);

REVOKE DELETE ON TABLE public.products FROM PUBLIC, anon, authenticated;

ALTER TABLE public.inventory
  DROP CONSTRAINT IF EXISTS inventory_product_id_fkey;
ALTER TABLE public.inventory
  ADD CONSTRAINT inventory_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.inventory
  VALIDATE CONSTRAINT inventory_product_id_fkey;

ALTER TABLE public.inventory_transactions
  DROP CONSTRAINT IF EXISTS inventory_transactions_product_id_fkey;
ALTER TABLE public.inventory_transactions
  ADD CONSTRAINT inventory_transactions_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.inventory_transactions
  VALIDATE CONSTRAINT inventory_transactions_product_id_fkey;

COMMIT;
