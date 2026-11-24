-- Restore the minimum Data API write privileges for marketing campaigns.
-- Row-level security and the existing permissive/restrictive company policies
-- remain authoritative for every authenticated INSERT, UPDATE, and DELETE.
BEGIN;

GRANT INSERT, UPDATE, DELETE ON TABLE public.marketing_campaigns TO authenticated;

COMMIT;
