-- Platform-wide branding and per-user notification read state.
-- Additive only: existing notification rows and tenant data are preserved.
create table if not exists public.platform_branding (
  id boolean primary key default true check (id),
  brand_name text not null default 'إدارة الوتيري بلس',
  phone text,
  promotional_text text,
  website_url text,
  logo_url text,
  enabled boolean not null default true,
  placement text not null default 'footer' check (placement in ('footer','header','both')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.platform_branding enable row level security;
drop policy if exists "platform branding readable by authenticated" on public.platform_branding;
create policy "platform branding readable by authenticated"
  on public.platform_branding for select to authenticated using (true);
drop policy if exists "platform branding managed by super owner" on public.platform_branding;
create policy "platform branding managed by super owner"
  on public.platform_branding for all to authenticated
  using (public.is_super_owner((select auth.uid())))
  with check (public.is_super_owner((select auth.uid())));

create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);
create index if not exists notification_reads_user_read_at_idx
  on public.notification_reads(user_id, read_at desc);
alter table public.notification_reads enable row level security;
drop policy if exists "users read own notification receipts" on public.notification_reads;
create policy "users read own notification receipts"
  on public.notification_reads for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "users create own notification receipts" on public.notification_reads;
create policy "users create own notification receipts"
  on public.notification_reads for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.notifications n where n.id = notification_id)
  );
drop policy if exists "users update own notification receipts" on public.notification_reads;
create policy "users update own notification receipts"
  on public.notification_reads for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.notifications n where n.id = notification_id)
  );
drop policy if exists "users delete own notification receipts" on public.notification_reads;
create policy "users delete own notification receipts"
  on public.notification_reads for delete to authenticated
  using (user_id = (select auth.uid()));

grant select on public.platform_branding to authenticated;
grant insert, update, delete on public.platform_branding to authenticated;
grant select, insert, update, delete on public.notification_reads to authenticated;
