-- Add covering indexes for the foreign keys introduced by advertising-space
-- and branch-scoped campaign analytics migrations.
BEGIN;

CREATE INDEX IF NOT EXISTS marketing_ad_spaces_company_id_idx
  ON public.marketing_ad_spaces (company_id)
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS marketing_ad_spaces_branch_id_idx
  ON public.marketing_ad_spaces (branch_id)
  WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS marketing_ad_spaces_created_by_idx
  ON public.marketing_ad_spaces (created_by)
  WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS marketing_campaign_events_branch_id_idx
  ON public.marketing_campaign_events (branch_id)
  WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS marketing_campaigns_advertising_space_tenant_idx
  ON public.marketing_campaigns (advertising_space_id, tenant_id)
  WHERE advertising_space_id IS NOT NULL;

COMMIT;
