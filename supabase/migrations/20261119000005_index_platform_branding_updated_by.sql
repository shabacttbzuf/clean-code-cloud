-- Cover the optional updated_by foreign key for platform branding.
-- This index supports efficient auth.users reference checks without indexing NULLs.
create index if not exists platform_branding_updated_by_idx
  on public.platform_branding(updated_by)
  where updated_by is not null;
