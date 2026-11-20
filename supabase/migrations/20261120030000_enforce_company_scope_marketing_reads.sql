-- Remove the legacy tenant-wide SELECT policy. It was permissive and therefore
-- OR-combined with company_scope_marketing_campaigns_select, exposing every
-- company's campaign metadata to any tenant member.
BEGIN;

DROP POLICY IF EXISTS "Tenant members read marketing campaigns"
  ON public.marketing_campaigns;

-- The company-scope policy installed by the earlier migration remains the
-- sole authenticated SELECT path: Super Owners, tenant owners, and members
-- whose company/branch/department belongs to the campaign company.
COMMIT;
