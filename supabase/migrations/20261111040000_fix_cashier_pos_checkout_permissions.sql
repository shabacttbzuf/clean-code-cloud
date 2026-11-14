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
