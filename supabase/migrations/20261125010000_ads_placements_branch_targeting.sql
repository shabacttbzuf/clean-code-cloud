begin;

alter table public.marketing_campaigns
  add column if not exists target_branch_ids uuid[] not null default '{}'::uuid[];

alter table public.marketing_campaigns drop constraint if exists marketing_campaigns_placement_check;
alter table public.marketing_campaigns add constraint marketing_campaigns_placement_check
  check (placement = any (array['dashboard_banner','dashboard_card','pos_promo','welcome','main','sidebar','offers','in_page']::text[]));
alter table public.marketing_campaigns add constraint marketing_campaigns_target_branches_limit
  check (cardinality(target_branch_ids) <= 1000);
create index if not exists marketing_campaigns_target_branch_ids_gin
  on public.marketing_campaigns using gin (target_branch_ids);

create table if not exists public.marketing_ad_placements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid references public.companies(id) on delete restrict,
  placement_key text not null check (placement_key = any (array['welcome','main','sidebar','offers','in_page','dashboard_banner','dashboard_card','pos_promo']::text[])),
  name_ar text not null check (char_length(btrim(name_ar)) between 2 and 100),
  description text not null default '' check (char_length(description) <= 300),
  is_enabled boolean not null default true,
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists marketing_ad_placements_scope_key_uidx
  on public.marketing_ad_placements (tenant_id, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), placement_key);
create index if not exists marketing_ad_placements_tenant_company_idx
  on public.marketing_ad_placements (tenant_id, company_id, is_enabled, sort_order);

alter table public.marketing_ad_placements enable row level security;

drop policy if exists marketing_ad_placements_permission_access on public.marketing_ad_placements;
create policy marketing_ad_placements_permission_access on public.marketing_ad_placements
for all to authenticated
using (private.is_tenant_admin((select auth.uid()), tenant_id)
  or public.is_super_owner((select auth.uid()))
  or public.has_permission((select auth.uid()), tenant_id, 'ads.manage'))
with check (private.is_tenant_admin((select auth.uid()), tenant_id)
  or public.is_super_owner((select auth.uid()))
  or public.has_permission((select auth.uid()), tenant_id, 'ads.manage'));

drop policy if exists marketing_ad_placements_company_scope on public.marketing_ad_placements;
create policy marketing_ad_placements_company_scope on public.marketing_ad_placements
as restrictive for all to authenticated
using (
  public.is_super_owner((select auth.uid()))
  or exists (select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=marketing_ad_placements.tenant_id
      and ur.role='owner' and ur.company_id is null)
  or (marketing_ad_placements.company_id is not null and exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=marketing_ad_placements.tenant_id
      and ur.company_id=marketing_ad_placements.company_id and ur.role in ('owner','manager')
      and public.has_permission((select auth.uid()), marketing_ad_placements.tenant_id, 'ads.manage')))
)
with check (
  public.is_super_owner((select auth.uid()))
  or exists (select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=marketing_ad_placements.tenant_id
      and ur.role='owner' and ur.company_id is null)
  or (marketing_ad_placements.company_id is not null and exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=marketing_ad_placements.tenant_id
      and ur.company_id=marketing_ad_placements.company_id and ur.role in ('owner','manager')
      and public.has_permission((select auth.uid()), marketing_ad_placements.tenant_id, 'ads.manage')))
);

grant select, insert, update, delete on public.marketing_ad_placements to authenticated;
drop trigger if exists set_marketing_ad_placements_updated_at on public.marketing_ad_placements;
create trigger set_marketing_ad_placements_updated_at before update on public.marketing_ad_placements
for each row execute function public.set_updated_at();

create or replace function private.validate_marketing_campaign_branch_targets()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare target_branch uuid;
begin
  if cardinality(new.target_branch_ids) <> cardinality(array(select distinct unnest(new.target_branch_ids))) then
    raise exception 'لا يمكن تكرار الفرع المستهدف في الإعلان' using errcode = '23514';
  end if;
  foreach target_branch in array coalesce(new.target_branch_ids, '{}'::uuid[]) loop
    if not exists (select 1 from public.branches b where b.id=target_branch
      and b.tenant_id=new.tenant_id and (new.company_id is null or b.company_id=new.company_id)) then
      raise exception 'الفرع المستهدف لا ينتمي إلى نطاق المؤسسة أو الشركة المحددة' using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists validate_marketing_campaign_branch_targets on public.marketing_campaigns;
create trigger validate_marketing_campaign_branch_targets
before insert or update of tenant_id, company_id, target_branch_ids on public.marketing_campaigns
for each row execute function private.validate_marketing_campaign_branch_targets();

insert into public.marketing_ad_placements (tenant_id,company_id,placement_key,name_ar,description,sort_order)
select t.id,null,s.placement_key,s.name_ar,s.description,s.sort_order
from public.tenants t cross join (values
 ('welcome','مساحة الترحيب','إعلان مساحة الترحيب أعلى الصفحة الرئيسية',10),
 ('main','المساحة الرئيسية','المساحة الإعلانية الرئيسية',20),
 ('sidebar','المساحة الجانبية','إعلان جانبي داخل واجهة النظام',30),
 ('offers','مساحة إعلانات العروض','إعلانات مستقلة عن بيانات العروض الترويجية',40),
 ('in_page','المساحات داخل الصفحات','إعلانات سياقية داخل صفحات النظام',50),
 ('dashboard_banner','شريط لوحة التحكم','الموضع السابق للشريط الرئيسي',60),
 ('dashboard_card','بطاقات لوحة التحكم','الموضع السابق لبطاقات لوحة التحكم',70),
 ('pos_promo','مساحة نقطة البيع','الموضع السابق لنقطة البيع',80)
) s(placement_key,name_ar,description,sort_order)
on conflict do nothing;

insert into public.marketing_ad_placements (tenant_id,company_id,placement_key,name_ar,description,sort_order)
select c.tenant_id,c.id,s.placement_key,s.name_ar,s.description,s.sort_order
from public.companies c cross join (values
 ('welcome','مساحة الترحيب','إعلان مساحة الترحيب أعلى الصفحة الرئيسية',10),
 ('main','المساحة الرئيسية','المساحة الإعلانية الرئيسية',20),
 ('sidebar','المساحة الجانبية','إعلان جانبي داخل واجهة النظام',30),
 ('offers','مساحة إعلانات العروض','إعلانات مستقلة عن بيانات العروض الترويجية',40),
 ('in_page','المساحات داخل الصفحات','إعلانات سياقية داخل صفحات النظام',50),
 ('dashboard_banner','شريط لوحة التحكم','الموضع السابق للشريط الرئيسي',60),
 ('dashboard_card','بطاقات لوحة التحكم','الموضع السابق لبطاقات لوحة التحكم',70),
 ('pos_promo','مساحة نقطة البيع','الموضع السابق لنقطة البيع',80)
) s(placement_key,name_ar,description,sort_order)
on conflict do nothing;

commit;