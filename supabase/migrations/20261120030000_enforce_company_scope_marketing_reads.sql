-- Remove the legacy tenant-wide SELECT policy. It was permissive and therefore
-- OR-combined with company_scope_marketing_campaigns_select, exposing every
-- company's campaign metadata to any tenant member.
BEGIN;

DROP POLICY IF EXISTS "Tenant members read marketing campaigns"
  ON public.marketing_campaigns;

-- Keep a permissive tenant-membership gate so RLS can evaluate SELECT;
-- the existing restrictive company-scope policy is then AND-applied and is
-- the actual row boundary.
CREATE POLICY "Tenant members read scoped marketing campaigns"
  ON public.marketing_campaigns
  AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (
    private.is_tenant_member((select auth.uid()), tenant_id)
    OR private.is_super_owner((select auth.uid()))
  );

COMMIT;
