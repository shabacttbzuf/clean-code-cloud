-- Tighten promotion visibility: staff see only currently active offers; redemption analytics stay manager-only.
BEGIN;

DROP POLICY IF EXISTS "Tenant members read promotional offers" ON public.promotional_offers;
CREATE POLICY "Tenant members read promotional offers" ON public.promotional_offers
FOR SELECT TO authenticated
USING (
  public.is_super_owner((select auth.uid()))
  OR (
    private.is_tenant_member((select auth.uid()), tenant_id)
    AND (company_id IS NULL OR private.is_company_member(tenant_id, company_id))
    AND (branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id))
    AND (
      public.has_permission((select auth.uid()), tenant_id, 'promotions.manage')
      OR (
        status='active'
        AND (starts_at IS NULL OR starts_at<=now())
        AND (ends_at IS NULL OR ends_at>now())
      )
    )
  )
);

DROP POLICY IF EXISTS "Promotion managers read redemptions" ON public.promotion_redemptions;
CREATE POLICY "Promotion managers read redemptions" ON public.promotion_redemptions
FOR SELECT TO authenticated
USING (
  public.is_super_owner((select auth.uid()))
  OR (
    private.is_tenant_member((select auth.uid()), tenant_id)
    AND public.has_permission((select auth.uid()), tenant_id, 'promotions.manage')
    AND (company_id IS NULL OR private.is_company_member(tenant_id, company_id))
    AND private.can_access_branch((select auth.uid()), tenant_id, branch_id)
  )
);

COMMIT;
