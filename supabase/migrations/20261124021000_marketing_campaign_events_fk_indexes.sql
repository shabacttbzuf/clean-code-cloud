-- Add direct indexes for campaign analytics foreign-key maintenance and joins.
BEGIN;

CREATE INDEX IF NOT EXISTS marketing_campaign_events_actor_id_idx
  ON public.marketing_campaign_events (actor_id);

CREATE INDEX IF NOT EXISTS marketing_campaign_events_company_id_idx
  ON public.marketing_campaign_events (company_id);

COMMIT;
