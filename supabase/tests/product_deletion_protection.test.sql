BEGIN;
SELECT plan(7);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.products', 'DELETE'),
  'Authenticated users cannot physically delete products'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.products', 'DELETE'),
  'Anonymous users cannot physically delete products'
);

SELECT ok(
  has_table_privilege('service_role', 'public.products', 'DELETE'),
  'Trusted service role retains controlled maintenance capability'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='products'
      AND cmd IN ('DELETE','ALL')
      AND (roles @> ARRAY['authenticated']::name[] OR roles @> ARRAY['public']::name[])
  ),
  'No authenticated DELETE or ALL policy remains on products'
);

SELECT is(
  (SELECT confdeltype::text FROM pg_constraint WHERE conrelid='public.inventory'::regclass AND conname='inventory_product_id_fkey'),
  'r',
  'Current inventory rows restrict product deletion'
);

SELECT is(
  (SELECT confdeltype::text FROM pg_constraint WHERE conrelid='public.inventory_transactions'::regclass AND conname='inventory_transactions_product_id_fkey'),
  'r',
  'Inventory transaction history restricts product deletion'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='products'
      AND policyname='products_create_permission' AND cmd='INSERT'
      AND with_check ILIKE '%has_permission%'
      AND with_check ILIKE '%is_tenant_member%'
  )
  AND EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='products'
      AND policyname='products_update_permission' AND cmd='UPDATE'
      AND qual ILIKE '%has_permission%'
      AND with_check ILIKE '%has_permission%'
      AND qual ILIKE '%is_tenant_member%'
      AND with_check ILIKE '%is_tenant_member%'
  ),
  'Product creation and updates use tenant membership and granular permissions'
);

SELECT * FROM finish();
ROLLBACK;
