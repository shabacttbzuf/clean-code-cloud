-- Complete action-level authorization for marketing data.
-- Legacy manage permissions remain valid; company/branch scope is not widened.
BEGIN;

-- Campaigns remain readable to eligible dashboard/POS users under the existing
-- tenant/company SELECT policies. ads.view controls the management route, not
-- visibility of active campaigns used by the rest of the application.
DROP POLICY IF EXISTS permission_gate_marketing_campaigns_select ON public.marketing_campaigns;

DROP POLICY IF EXISTS permission_gate_marketing_campaigns_insert ON public.marketing_campaigns;
CREATE POLICY permission_gate_marketing_campaigns_insert
ON public.marketing_campaigns AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  public.has_permission((select auth.uid()), tenant_id, 'ads.create')
  OR public.has_permission((select auth.uid()), tenant_id, 'ads.manage')
);

DROP POLICY IF EXISTS permission_gate_marketing_campaigns_update ON public.marketing_campaigns;
CREATE POLICY permission_gate_marketing_campaigns_update
ON public.marketing_campaigns AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  public.has_permission((select auth.uid()), tenant_id, 'ads.edit')
  OR public.has_permission((select auth.uid()), tenant_id, 'ads.approve')
  OR public.has_permission((select auth.uid()), tenant_id, 'ads.manage')
)
WITH CHECK (
  public.has_permission((select auth.uid()), tenant_id, 'ads.edit')
  OR public.has_permission((select auth.uid()), tenant_id, 'ads.approve')
  OR public.has_permission((select auth.uid()), tenant_id, 'ads.manage')
);

DROP POLICY IF EXISTS permission_gate_marketing_campaigns_delete ON public.marketing_campaigns;
CREATE POLICY permission_gate_marketing_campaigns_delete
ON public.marketing_campaigns AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  public.has_permission((select auth.uid()), tenant_id, 'ads.delete')
  OR public.has_permission((select auth.uid()), tenant_id, 'ads.manage')
);

-- Company/branch row boundary remains restrictive and independent of action grants.
DROP POLICY IF EXISTS company_scope_marketing_campaigns_insert ON public.marketing_campaigns;
CREATE POLICY company_scope_marketing_campaigns_insert
ON public.marketing_campaigns AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_owner((select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=marketing_campaigns.tenant_id
      AND ur.role='owner' AND ur.company_id IS NULL
  )
  OR (company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=marketing_campaigns.tenant_id
      AND ur.company_id=marketing_campaigns.company_id AND ur.role IN ('owner','manager')
      AND (public.has_permission((select auth.uid()), marketing_campaigns.tenant_id, 'ads.create')
        OR public.has_permission((select auth.uid()), marketing_campaigns.tenant_id, 'ads.manage'))
  ))
);

DROP POLICY IF EXISTS company_scope_marketing_campaigns_update ON public.marketing_campaigns;
CREATE POLICY company_scope_marketing_campaigns_update
ON public.marketing_campaigns AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  public.is_super_owner((select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=marketing_campaigns.tenant_id
      AND ur.role='owner' AND ur.company_id IS NULL
  )
  OR (company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=marketing_campaigns.tenant_id
      AND ur.company_id=marketing_campaigns.company_id AND ur.role IN ('owner','manager')
      AND (public.has_permission((select auth.uid()), marketing_campaigns.tenant_id, 'ads.edit')
        OR public.has_permission((select auth.uid()), marketing_campaigns.tenant_id, 'ads.approve')
        OR public.has_permission((select auth.uid()), marketing_campaigns.tenant_id, 'ads.manage'))
  ))
)
WITH CHECK (
  public.is_super_owner((select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=marketing_campaigns.tenant_id
      AND ur.role='owner' AND ur.company_id IS NULL
  )
  OR (company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=marketing_campaigns.tenant_id
      AND ur.company_id=marketing_campaigns.company_id AND ur.role IN ('owner','manager')
      AND (public.has_permission((select auth.uid()), marketing_campaigns.tenant_id, 'ads.edit')
        OR public.has_permission((select auth.uid()), marketing_campaigns.tenant_id, 'ads.approve')
        OR public.has_permission((select auth.uid()), marketing_campaigns.tenant_id, 'ads.manage'))
  ))
);

DROP POLICY IF EXISTS company_scope_marketing_campaigns_delete ON public.marketing_campaigns;
CREATE POLICY company_scope_marketing_campaigns_delete
ON public.marketing_campaigns AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  public.is_super_owner((select auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=marketing_campaigns.tenant_id
      AND ur.role='owner' AND ur.company_id IS NULL
  )
  OR (company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=marketing_campaigns.tenant_id
      AND ur.company_id=marketing_campaigns.company_id AND ur.role IN ('owner','manager')
      AND (public.has_permission((select auth.uid()), marketing_campaigns.tenant_id, 'ads.delete')
        OR public.has_permission((select auth.uid()), marketing_campaigns.tenant_id, 'ads.manage'))
  ))
);

-- Additive permissive policies let granular custom roles perform the exact
-- action while preserving the existing manage/owner policies as compatibility.
DROP POLICY IF EXISTS granular_ads_create ON public.marketing_campaigns;
CREATE POLICY granular_ads_create ON public.marketing_campaigns
FOR INSERT TO authenticated
WITH CHECK (public.has_permission((select auth.uid()), tenant_id, 'ads.create'));

DROP POLICY IF EXISTS granular_ads_edit_approve ON public.marketing_campaigns;
CREATE POLICY granular_ads_edit_approve ON public.marketing_campaigns
FOR UPDATE TO authenticated
USING (
  public.has_permission((select auth.uid()), tenant_id, 'ads.edit')
  OR public.has_permission((select auth.uid()), tenant_id, 'ads.approve')
)
WITH CHECK (
  public.has_permission((select auth.uid()), tenant_id, 'ads.edit')
  OR public.has_permission((select auth.uid()), tenant_id, 'ads.approve')
);

DROP POLICY IF EXISTS granular_ads_delete ON public.marketing_campaigns;
CREATE POLICY granular_ads_delete ON public.marketing_campaigns
FOR DELETE TO authenticated
USING (public.has_permission((select auth.uid()), tenant_id, 'ads.delete'));

-- Keep active scheduled offers available to POS users. Management viewers can
-- additionally read draft/archived offers within their existing scope.
DROP POLICY IF EXISTS permission_gate_promotional_offers_select ON public.promotional_offers;

DROP POLICY IF EXISTS permission_gate_promotional_offers_insert ON public.promotional_offers;
CREATE POLICY permission_gate_promotional_offers_insert
ON public.promotional_offers AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  public.has_permission((select auth.uid()), tenant_id, 'promotions.create')
  OR public.has_permission((select auth.uid()), tenant_id, 'promotions.manage')
);

DROP POLICY IF EXISTS permission_gate_promotional_offers_update ON public.promotional_offers;
CREATE POLICY permission_gate_promotional_offers_update
ON public.promotional_offers AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  public.has_permission((select auth.uid()), tenant_id, 'promotions.edit')
  OR public.has_permission((select auth.uid()), tenant_id, 'promotions.approve')
  OR public.has_permission((select auth.uid()), tenant_id, 'promotions.manage')
)
WITH CHECK (
  public.has_permission((select auth.uid()), tenant_id, 'promotions.edit')
  OR public.has_permission((select auth.uid()), tenant_id, 'promotions.approve')
  OR public.has_permission((select auth.uid()), tenant_id, 'promotions.manage')
);

DROP POLICY IF EXISTS permission_gate_promotional_offers_delete ON public.promotional_offers;
CREATE POLICY permission_gate_promotional_offers_delete
ON public.promotional_offers AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  public.has_permission((select auth.uid()), tenant_id, 'promotions.delete')
  OR public.has_permission((select auth.uid()), tenant_id, 'promotions.manage')
);

DROP POLICY IF EXISTS granular_promotions_view ON public.promotional_offers;
CREATE POLICY granular_promotions_view ON public.promotional_offers
FOR SELECT TO authenticated
USING (
  public.has_permission((select auth.uid()), tenant_id, 'promotions.view')
);

DROP POLICY IF EXISTS granular_promotions_create ON public.promotional_offers;
CREATE POLICY granular_promotions_create ON public.promotional_offers
FOR INSERT TO authenticated
WITH CHECK (public.has_permission((select auth.uid()), tenant_id, 'promotions.create'));

DROP POLICY IF EXISTS granular_promotions_edit_approve ON public.promotional_offers;
CREATE POLICY granular_promotions_edit_approve ON public.promotional_offers
FOR UPDATE TO authenticated
USING (
  public.has_permission((select auth.uid()), tenant_id, 'promotions.edit')
  OR public.has_permission((select auth.uid()), tenant_id, 'promotions.approve')
)
WITH CHECK (
  public.has_permission((select auth.uid()), tenant_id, 'promotions.edit')
  OR public.has_permission((select auth.uid()), tenant_id, 'promotions.approve')
);

DROP POLICY IF EXISTS granular_promotions_delete ON public.promotional_offers;
CREATE POLICY granular_promotions_delete ON public.promotional_offers
FOR DELETE TO authenticated
USING (public.has_permission((select auth.uid()), tenant_id, 'promotions.delete'));

-- Redemptions remain branch/company scoped; view permission unlocks analytics.
DROP POLICY IF EXISTS granular_promotions_read_redemptions ON public.promotion_redemptions;
CREATE POLICY granular_promotions_read_redemptions ON public.promotion_redemptions
FOR SELECT TO authenticated
USING (
  public.has_permission((select auth.uid()), tenant_id, 'promotions.view')
  AND private.is_tenant_member((select auth.uid()), tenant_id)
  AND (
    company_id IS NULL
    OR private.is_company_member(tenant_id, company_id)
    OR private.can_access_branch((select auth.uid()), tenant_id, branch_id)
  )
  AND private.can_access_branch((select auth.uid()), tenant_id, branch_id)
);

-- The action-only permissive policies below must never become a tenant-wide
-- bypass. Add independent restrictive row-scope checks before using them.
DROP POLICY IF EXISTS promotional_offers_granular_scope_select ON public.promotional_offers;
CREATE POLICY promotional_offers_granular_scope_select
ON public.promotional_offers AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  public.is_super_owner((select auth.uid()))
  OR (
    private.is_tenant_member((select auth.uid()), tenant_id)
    AND (
      (company_id IS NULL AND branch_id IS NULL AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=promotional_offers.tenant_id
          AND ur.company_id IS NULL
      ))
      OR (company_id IS NULL AND branch_id IS NOT NULL
        AND private.can_access_branch((select auth.uid()), tenant_id, branch_id))
      OR (
        company_id IS NOT NULL
        AND (private.is_company_member(tenant_id, company_id)
          OR (branch_id IS NOT NULL AND private.can_access_branch((select auth.uid()), tenant_id, branch_id)))
        AND (branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id))
      )
    )
  )
);

DROP POLICY IF EXISTS promotional_offers_granular_scope_insert ON public.promotional_offers;
CREATE POLICY promotional_offers_granular_scope_insert
ON public.promotional_offers AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_owner((select auth.uid()))
  OR (
    private.is_tenant_member((select auth.uid()), tenant_id)
    AND (
      (company_id IS NULL AND branch_id IS NULL AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=promotional_offers.tenant_id
          AND ur.company_id IS NULL
      ))
      OR (company_id IS NULL AND branch_id IS NOT NULL
        AND private.can_access_branch((select auth.uid()), tenant_id, branch_id))
      OR (
        company_id IS NOT NULL
        AND (private.is_company_member(tenant_id, company_id)
          OR (branch_id IS NOT NULL AND private.can_access_branch((select auth.uid()), tenant_id, branch_id)))
        AND (branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id))
      )
    )
  )
);

DROP POLICY IF EXISTS promotional_offers_granular_scope_update ON public.promotional_offers;
CREATE POLICY promotional_offers_granular_scope_update
ON public.promotional_offers AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  public.is_super_owner((select auth.uid()))
  OR (
    private.is_tenant_member((select auth.uid()), tenant_id)
    AND (
      (company_id IS NULL AND branch_id IS NULL AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=promotional_offers.tenant_id
          AND ur.company_id IS NULL
      ))
      OR (company_id IS NULL AND branch_id IS NOT NULL
        AND private.can_access_branch((select auth.uid()), tenant_id, branch_id))
      OR (
        company_id IS NOT NULL
        AND (private.is_company_member(tenant_id, company_id)
          OR (branch_id IS NOT NULL AND private.can_access_branch((select auth.uid()), tenant_id, branch_id)))
        AND (branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id))
      )
    )
  )
)
WITH CHECK (
  public.is_super_owner((select auth.uid()))
  OR (
    private.is_tenant_member((select auth.uid()), tenant_id)
    AND (
      (company_id IS NULL AND branch_id IS NULL AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=promotional_offers.tenant_id
          AND ur.company_id IS NULL
      ))
      OR (company_id IS NULL AND branch_id IS NOT NULL
        AND private.can_access_branch((select auth.uid()), tenant_id, branch_id))
      OR (
        company_id IS NOT NULL
        AND (private.is_company_member(tenant_id, company_id)
          OR (branch_id IS NOT NULL AND private.can_access_branch((select auth.uid()), tenant_id, branch_id)))
        AND (branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id))
      )
    )
  )
);

DROP POLICY IF EXISTS promotional_offers_granular_scope_delete ON public.promotional_offers;
CREATE POLICY promotional_offers_granular_scope_delete
ON public.promotional_offers AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  public.is_super_owner((select auth.uid()))
  OR (
    private.is_tenant_member((select auth.uid()), tenant_id)
    AND (
      (company_id IS NULL AND branch_id IS NULL AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id=(select auth.uid()) AND ur.tenant_id=promotional_offers.tenant_id
          AND ur.company_id IS NULL
      ))
      OR (company_id IS NULL AND branch_id IS NOT NULL
        AND private.can_access_branch((select auth.uid()), tenant_id, branch_id))
      OR (
        company_id IS NOT NULL
        AND (private.is_company_member(tenant_id, company_id)
          OR (branch_id IS NOT NULL AND private.can_access_branch((select auth.uid()), tenant_id, branch_id)))
        AND (branch_id IS NULL OR private.can_access_branch((select auth.uid()), tenant_id, branch_id))
      )
    )
  )
);

COMMIT;
