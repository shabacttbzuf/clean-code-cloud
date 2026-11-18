-- Campaigns are tenant-filtered by RLS; allow authenticated POS clients to read them.
GRANT SELECT ON TABLE public.marketing_campaigns TO authenticated;
