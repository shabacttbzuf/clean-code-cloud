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
