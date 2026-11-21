-- Reconcile campaign write permissions with the dedicated ads.manage capability.
-- The company-scope restrictive policies remain the final row boundary.
BEGIN;

DROP POLICY IF EXISTS "Tenant admins insert marketing campaigns" ON public.marketing_campaigns;
CREATE POLICY "Tenant admins insert marketing campaigns"
ON public.marketing_campaigns FOR INSERT TO authenticated
WITH CHECK (
  private.is_tenant_admin((select auth.uid()), tenant_id)
  OR public.is_super_owner((select auth.uid()))
  OR public.has_permission((select auth.uid()), tenant_id, 'ads.manage')
);

DROP POLICY IF EXISTS "Tenant admins update marketing campaigns" ON public.marketing_campaigns;
CREATE POLICY "Tenant admins update marketing campaigns"
ON public.marketing_campaigns FOR UPDATE TO authenticated
USING (
  private.is_tenant_admin((select auth.uid()), tenant_id)
  OR public.is_super_owner((select auth.uid()))
  OR public.has_permission((select auth.uid()), tenant_id, 'ads.manage')
)
WITH CHECK (
  private.is_tenant_admin((select auth.uid()), tenant_id)
  OR public.is_super_owner((select auth.uid()))
  OR public.has_permission((select auth.uid()), tenant_id, 'ads.manage')
);

DROP POLICY IF EXISTS "Tenant admins delete marketing campaigns" ON public.marketing_campaigns;
CREATE POLICY "Tenant admins delete marketing campaigns"
ON public.marketing_campaigns FOR DELETE TO authenticated
USING (
  private.is_tenant_admin((select auth.uid()), tenant_id)
  OR public.is_super_owner((select auth.uid()))
  OR public.has_permission((select auth.uid()), tenant_id, 'ads.manage')
);

DROP POLICY IF EXISTS company_scope_marketing_campaigns_insert ON public.marketing_campaigns;
CREATE POLICY company_scope_marketing_campaigns_insert
ON public.marketing_campaigns AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_owner((select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=(select auth.uid())
      AND ur.tenant_id=marketing_campaigns.tenant_id
      AND ur.role='owner' AND ur.company_id IS NULL
  )
  OR (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id=(select auth.uid())
        AND ur.tenant_id=marketing_campaigns.tenant_id
        AND ur.company_id=marketing_campaigns.company_id
        AND ur.role IN ('owner','manager')
        AND public.has_permission((select auth.uid()), marketing_campaigns.tenant_id, 'ads.manage')
    )
  )
);

DROP POLICY IF EXISTS company_scope_marketing_campaigns_update ON public.marketing_campaigns;
CREATE POLICY company_scope_marketing_campaigns_update
ON public.marketing_campaigns AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  public.is_super_owner((select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=(select auth.uid())
      AND ur.tenant_id=marketing_campaigns.tenant_id
      AND ur.role='owner' AND ur.company_id IS NULL
  )
  OR (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id=(select auth.uid())
        AND ur.tenant_id=marketing_campaigns.tenant_id
        AND ur.company_id=marketing_campaigns.company_id
        AND ur.role IN ('owner','manager')
        AND public.has_permission((select auth.uid()), marketing_campaigns.tenant_id, 'ads.manage')
    )
  )
)
WITH CHECK (
  public.is_super_owner((select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=(select auth.uid())
      AND ur.tenant_id=marketing_campaigns.tenant_id
      AND ur.role='owner' AND ur.company_id IS NULL
  )
  OR (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id=(select auth.uid())
        AND ur.tenant_id=marketing_campaigns.tenant_id
        AND ur.company_id=marketing_campaigns.company_id
        AND ur.role IN ('owner','manager')
        AND public.has_permission((select auth.uid()), marketing_campaigns.tenant_id, 'ads.manage')
    )
  )
);

DROP POLICY IF EXISTS company_scope_marketing_campaigns_delete ON public.marketing_campaigns;
CREATE POLICY company_scope_marketing_campaigns_delete
ON public.marketing_campaigns AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  public.is_super_owner((select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=(select auth.uid())
      AND ur.tenant_id=marketing_campaigns.tenant_id
      AND ur.role='owner' AND ur.company_id IS NULL
  )
  OR (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id=(select auth.uid())
        AND ur.tenant_id=marketing_campaigns.tenant_id
        AND ur.company_id=marketing_campaigns.company_id
        AND ur.role IN ('owner','manager')
        AND public.has_permission((select auth.uid()), marketing_campaigns.tenant_id, 'ads.manage')
    )
  )
);

COMMIT;
