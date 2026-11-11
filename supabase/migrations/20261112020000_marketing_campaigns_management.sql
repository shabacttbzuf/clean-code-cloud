-- Tenant-scoped promotional campaigns and in-app advertising placements.
create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  description text not null default '' check (char_length(description) <= 500),
  image_url text,
  target_url text,
  placement text not null default 'dashboard_banner' check (placement in ('dashboard_banner','dashboard_card','pos_promo')),
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_campaign_dates_valid check (starts_at is null or ends_at is null or ends_at > starts_at)
);
create index if not exists marketing_campaigns_tenant_status_idx on public.marketing_campaigns (tenant_id, status, sort_order, created_at desc);
alter table public.marketing_campaigns enable row level security;
drop policy if exists "Tenant members read marketing campaigns" on public.marketing_campaigns;
create policy "Tenant members read marketing campaigns" on public.marketing_campaigns for select to authenticated
using (private.is_tenant_member(auth.uid(), tenant_id) or public.is_super_owner(auth.uid()));
drop policy if exists "Tenant admins manage marketing campaigns" on public.marketing_campaigns;
create policy "Tenant admins manage marketing campaigns" on public.marketing_campaigns for all to authenticated
using (private.is_tenant_admin(auth.uid(), tenant_id) or public.is_super_owner(auth.uid()))
with check (private.is_tenant_admin(auth.uid(), tenant_id) or public.is_super_owner(auth.uid()));
drop trigger if exists set_marketing_campaigns_updated_at on public.marketing_campaigns;
create trigger set_marketing_campaigns_updated_at before update on public.marketing_campaigns for each row execute function public.set_updated_at();