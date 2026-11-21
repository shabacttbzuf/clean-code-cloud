-- Restrict offer visibility to active eligible offers for staff and allow scoped custom roles with promotions.manage.
BEGIN;

DROP POLICY IF EXISTS "Tenant members read promotional offers" ON public.promotional_offers;
CREATE POLICY "Tenant members read promotional offers" ON public.promotional_offers
FOR SELECT TO authenticated
USING (
  public.is_super_owner((select auth.uid()))
  OR (
    private.is_tenant_member((select auth.uid()), tenant_id)
    AND (
      company_id IS NULL
      OR private.is_company_member(tenant_id, company_id)
      OR (branch_id IS NOT NULL AND private.can_access_branch((select auth.uid()), tenant_id, branch_id))
    )
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

-- Keep tenant owners as full managers; company- or branch-scoped custom roles
-- can manage offers only when the dedicated permission is explicitly granted.
DROP POLICY IF EXISTS "Promotion managers insert offers" ON public.promotional_offers;
CREATE POLICY "Promotion managers insert offers" ON public.promotional_offers
FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_owner((select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=promotional_offers.tenant_id
      AND ur.role='owner' AND ur.company_id IS NULL
  )
  OR (
    company_id IS NULL AND branch_id IS NULL
    AND public.has_permission((select auth.uid()), tenant_id, 'promotions.manage')
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=promotional_offers.tenant_id
        AND ur.company_id IS NULL
    )
  )
  OR (
    company_id IS NOT NULL
    AND public.has_permission((select auth.uid()), tenant_id, 'promotions.manage')
    AND (
      private.is_company_member(tenant_id, company_id)
      OR (branch_id IS NOT NULL AND private.can_access_branch((select auth.uid()), tenant_id, branch_id))
    )
    AND (branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id))
  )
);

DROP POLICY IF EXISTS "Promotion managers update offers" ON public.promotional_offers;
CREATE POLICY "Promotion managers update offers" ON public.promotional_offers
FOR UPDATE TO authenticated
USING (
  public.is_super_owner((select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=promotional_offers.tenant_id
      AND ur.role='owner' AND ur.company_id IS NULL
  )
  OR (
    company_id IS NULL AND branch_id IS NULL
    AND public.has_permission((select auth.uid()), tenant_id, 'promotions.manage')
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=promotional_offers.tenant_id
        AND ur.company_id IS NULL
    )
  )
  OR (
    company_id IS NOT NULL
    AND public.has_permission((select auth.uid()), tenant_id, 'promotions.manage')
    AND (
      private.is_company_member(tenant_id, company_id)
      OR (branch_id IS NOT NULL AND private.can_access_branch((select auth.uid()), tenant_id, branch_id))
    )
    AND (branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id))
  )
)
WITH CHECK (
  public.is_super_owner((select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=promotional_offers.tenant_id
      AND ur.role='owner' AND ur.company_id IS NULL
  )
  OR (
    company_id IS NULL AND branch_id IS NULL
    AND public.has_permission((select auth.uid()), tenant_id, 'promotions.manage')
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=promotional_offers.tenant_id
        AND ur.company_id IS NULL
    )
  )
  OR (
    company_id IS NOT NULL
    AND public.has_permission((select auth.uid()), tenant_id, 'promotions.manage')
    AND (
      private.is_company_member(tenant_id, company_id)
      OR (branch_id IS NOT NULL AND private.can_access_branch((select auth.uid()), tenant_id, branch_id))
    )
    AND (branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id))
  )
);

DROP POLICY IF EXISTS "Promotion managers delete offers" ON public.promotional_offers;
CREATE POLICY "Promotion managers delete offers" ON public.promotional_offers
FOR DELETE TO authenticated
USING (
  public.is_super_owner((select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=promotional_offers.tenant_id
      AND ur.role='owner' AND ur.company_id IS NULL
  )
  OR (
    company_id IS NULL AND branch_id IS NULL
    AND public.has_permission((select auth.uid()), tenant_id, 'promotions.manage')
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=promotional_offers.tenant_id
        AND ur.company_id IS NULL
    )
  )
  OR (
    company_id IS NOT NULL
    AND public.has_permission((select auth.uid()), tenant_id, 'promotions.manage')
    AND (
      private.is_company_member(tenant_id, company_id)
      OR (branch_id IS NOT NULL AND private.can_access_branch((select auth.uid()), tenant_id, branch_id))
    )
    AND (branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id))
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
    AND (
      company_id IS NULL
      OR private.is_company_member(tenant_id, company_id)
      OR private.can_access_branch((select auth.uid()), tenant_id, branch_id)
    )
    AND private.can_access_branch((select auth.uid()), tenant_id, branch_id)
  )
);

COMMIT;
