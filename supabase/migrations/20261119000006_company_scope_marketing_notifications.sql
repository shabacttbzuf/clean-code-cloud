-- Enforce company boundaries for marketing campaigns and notifications.
-- Also make tenant owners company-wide for branch access while keeping company managers scoped.
begin;

alter table public.marketing_campaigns
  add column if not exists company_id uuid;
alter table public.notifications
  add column if not exists company_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='marketing_campaigns_company_id_fkey'
      and conrelid='public.marketing_campaigns'::regclass
  ) then
    alter table public.marketing_campaigns
      add constraint marketing_campaigns_company_id_fkey
      foreign key (company_id) references public.companies(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='notifications_company_id_fkey'
      and conrelid='public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_company_id_fkey
      foreign key (company_id) references public.companies(id) on delete restrict;
  end if;
end $$;

create index if not exists marketing_campaigns_tenant_company_status_idx
  on public.marketing_campaigns(tenant_id, company_id, status, sort_order, created_at desc);
create index if not exists notifications_tenant_company_created_idx
  on public.notifications(tenant_id, company_id, created_at desc)
  where company_id is not null;
create index if not exists marketing_campaigns_company_id_idx
  on public.marketing_campaigns(company_id)
  where company_id is not null;
create index if not exists notifications_company_id_idx
  on public.notifications(company_id)
  where company_id is not null;

-- Backfill only unambiguous historical ownership into the new scope columns.
-- Financial, HR, notification content, and campaign content are not rewritten.
with creator_company as (
  select ur.user_id, ur.tenant_id, min(ur.company_id::text)::uuid as company_id
  from public.user_roles ur
  where ur.company_id is not null and ur.role in ('owner','manager')
    and not exists (
      select 1 from public.user_roles owner_role
      where owner_role.user_id=ur.user_id and owner_role.tenant_id=ur.tenant_id
        and owner_role.role='owner' and owner_role.company_id is null
    )
  group by ur.user_id, ur.tenant_id
  having count(distinct ur.company_id)=1
)
update public.marketing_campaigns mc
set company_id=cc.company_id
from creator_company cc
where mc.company_id is null and mc.created_by=cc.user_id and mc.tenant_id=cc.tenant_id;

update public.notifications n
set company_id=b.company_id
from public.branches b
where n.company_id is null and n.audience_type='branch'
  and n.audience_id=b.id and n.tenant_id=b.tenant_id and b.company_id is not null;

update public.notifications n
set company_id=d.company_id
from public.departments d
where n.company_id is null and n.audience_type='department'
  and n.audience_id=d.id and n.tenant_id=d.tenant_id and d.company_id is not null;

with target_company as (
  select ur.user_id, ur.tenant_id, min(ur.company_id::text)::uuid as company_id
  from public.user_roles ur
  where ur.company_id is not null
  group by ur.user_id, ur.tenant_id
  having count(distinct ur.company_id)=1
)
update public.notifications n
set company_id=tc.company_id
from target_company tc
where n.company_id is null and n.audience_type='user'
  and n.audience_id=tc.user_id and n.tenant_id=tc.tenant_id;

with creator_company as (
  select ur.user_id, ur.tenant_id, min(ur.company_id::text)::uuid as company_id
  from public.user_roles ur
  where ur.company_id is not null and ur.role in ('owner','manager')
    and not exists (
      select 1 from public.user_roles owner_role
      where owner_role.user_id=ur.user_id and owner_role.tenant_id=ur.tenant_id
        and owner_role.role='owner' and owner_role.company_id is null
    )
  group by ur.user_id, ur.tenant_id
  having count(distinct ur.company_id)=1
)
update public.notifications n
set company_id=cc.company_id
from creator_company cc
where n.company_id is null and n.audience_type in ('all','owner','manager')
  and n.created_by=cc.user_id and n.tenant_id=cc.tenant_id;

-- A tenant owner with no company assignment can access all companies in the tenant.
-- Company managers and accountants remain limited to their assigned company.
create or replace function private.can_access_branch(_user_id uuid, _tenant_id uuid, _branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select
    (select auth.uid()) is not null
    and _user_id = (select auth.uid())
    and (
    exists (select 1 from public.super_owners so where so.user_id = _user_id)
    or exists (
      select 1
      from public.user_roles ur
      join public.branches b on b.id = _branch_id and b.tenant_id = _tenant_id
      where ur.user_id = _user_id
        and ur.tenant_id = _tenant_id
        and (
          (ur.role = 'owner' and ur.company_id is null)
          or (ur.role in ('owner','manager','accountant')
              and ur.company_id is not null and ur.company_id = b.company_id)
          or (ur.branch_id = _branch_id
              and (ur.company_id is null or ur.company_id = b.company_id))
        )
    )
    );
$function$;
revoke all on function private.can_access_branch(uuid,uuid,uuid) from public, anon;
grant execute on function private.can_access_branch(uuid,uuid,uuid) to authenticated, service_role;

-- Tenant owners and the platform owner can see creator-owned records across companies;
-- company managers can see only records created within their assigned company.
create or replace function private.is_company_member(_tenant_id uuid, _company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select (select auth.uid()) is not null
    and _company_id is not null
    and (
      exists (select 1 from public.super_owners so where so.user_id=(select auth.uid()))
      or exists (
        select 1 from public.user_roles ur
        where ur.user_id=(select auth.uid()) and ur.tenant_id=_tenant_id
          and ur.company_id=_company_id
      )
      or exists (
        select 1 from public.user_roles ur
        where ur.user_id=(select auth.uid()) and ur.tenant_id=_tenant_id
          and ur.role='owner' and ur.company_id is null
      )
    );
$function$;
revoke all on function private.is_company_member(uuid,uuid) from public, anon;
grant execute on function private.is_company_member(uuid,uuid) to authenticated, service_role;

create or replace function private.can_access_creator_company(_tenant_id uuid, _creator_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select (select auth.uid()) is not null
    and _creator_id is not null
    and (
      exists (select 1 from public.super_owners so where so.user_id=(select auth.uid()))
      or exists (
        select 1 from public.user_roles owner_role
        where owner_role.user_id=(select auth.uid()) and owner_role.tenant_id=_tenant_id
          and owner_role.role='owner' and owner_role.company_id is null
      )
      or exists (
        select 1
        from public.user_roles viewer
        join public.user_roles creator
          on creator.tenant_id=viewer.tenant_id
         and creator.company_id=viewer.company_id
        where viewer.user_id=(select auth.uid())
          and viewer.tenant_id=_tenant_id
          and viewer.company_id is not null
          and creator.user_id=_creator_id
      )
    );
$function$;
revoke all on function private.can_access_creator_company(uuid,uuid) from public, anon;
grant execute on function private.can_access_creator_company(uuid,uuid) to authenticated, service_role;

-- Tenant owners can manage branches across their tenant; company managers remain scoped.
drop policy if exists company_scope_branches_insert on public.branches;
create policy company_scope_branches_insert on public.branches
as restrictive for insert to authenticated
with check (
  is_super_owner((select auth.uid()))
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=branches.tenant_id
      and ur.role='owner' and ur.company_id is null
  )
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=branches.tenant_id
      and ur.company_id=branches.company_id and ur.role in ('owner','manager')
  )
);

drop policy if exists company_scope_branches_update on public.branches;
create policy company_scope_branches_update on public.branches
as restrictive for update to authenticated
using (private.can_access_branch((select auth.uid()), tenant_id, id))
with check (
  is_super_owner((select auth.uid()))
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=branches.tenant_id
      and ur.role='owner' and ur.company_id is null
  )
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=branches.tenant_id
      and ur.company_id=branches.company_id and ur.role in ('owner','manager')
  )
);

-- Infer and validate the company of every new notification. Existing NULL company_id
-- notifications remain tenant-wide unless their branch/department audience identifies a company.
create or replace function private.enforce_notification_company_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_is_super boolean;
  v_is_tenant_owner boolean;
  v_company_count integer;
  v_actor_company uuid;
  v_target_company uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  v_is_super := exists (select 1 from public.super_owners so where so.user_id=v_uid);

  if tg_op='INSERT' then
    if new.created_by is null then
      new.created_by := v_uid;
    elsif new.created_by is distinct from v_uid and not v_is_super then
      raise exception 'Notification creator must be the authenticated user' using errcode='42501';
    end if;
  elsif new.created_by is distinct from old.created_by and not v_is_super then
    raise exception 'Notification creator is immutable' using errcode='42501';
  end if;

  if new.tenant_id is null then
    if not v_is_super then
      raise exception 'Only the platform owner can create global notifications' using errcode='42501';
    end if;
    return new;
  end if;

  v_is_tenant_owner := exists (
    select 1 from public.user_roles ur
    where ur.user_id=v_uid and ur.tenant_id=new.tenant_id
      and ur.role='owner' and ur.company_id is null
  );

  select count(distinct ur.company_id), min(ur.company_id::text)::uuid
    into v_company_count, v_actor_company
  from public.user_roles ur
  where ur.user_id=v_uid and ur.tenant_id=new.tenant_id
    and ur.role in ('owner','manager') and ur.company_id is not null;

  if not v_is_super and not v_is_tenant_owner then
    if new.company_id is null then
      if v_company_count <> 1 then
        raise exception 'Select a company for this notification' using errcode='42501';
      end if;
      new.company_id := v_actor_company;
    end if;
    if not exists (
      select 1 from public.user_roles ur
      where ur.user_id=v_uid and ur.tenant_id=new.tenant_id
        and ur.company_id=new.company_id and ur.role in ('owner','manager')
    ) then
      raise exception 'You cannot create notifications for another company' using errcode='42501';
    end if;
  end if;

  if new.company_id is not null and not exists (
    select 1 from public.companies c
    where c.id=new.company_id and c.tenant_id=new.tenant_id
  ) then
    raise exception 'Notification company must belong to the same tenant' using errcode='23514';
  end if;

  if new.audience_type='branch' then
    if new.audience_id is null then
      raise exception 'Branch audience requires an audience_id' using errcode='22023';
    end if;
    select b.company_id into v_target_company
    from public.branches b
    where b.id=new.audience_id and b.tenant_id=new.tenant_id;
    if not found then
      raise exception 'Notification branch audience was not found in this tenant' using errcode='23503';
    end if;
    if new.company_id is null then
      new.company_id := v_target_company;
    elsif new.company_id is distinct from v_target_company then
      raise exception 'Notification branch audience belongs to another company' using errcode='42501';
    end if;
  elsif new.audience_type='department' then
    if new.audience_id is null then
      raise exception 'Department audience requires an audience_id' using errcode='22023';
    end if;
    select d.company_id into v_target_company
    from public.departments d
    where d.id=new.audience_id and d.tenant_id=new.tenant_id;
    if not found then
      raise exception 'Notification department audience was not found in this tenant' using errcode='23503';
    end if;
    if new.company_id is null then
      new.company_id := v_target_company;
    elsif new.company_id is distinct from v_target_company then
      raise exception 'Notification department audience belongs to another company' using errcode='42501';
    end if;
  elsif new.audience_type='user' then
    if new.audience_id is null then
      raise exception 'User audience requires an audience_id' using errcode='22023';
    end if;
    if new.company_id is not null and not exists (
      select 1 from public.user_roles ur
      where ur.user_id=new.audience_id and ur.tenant_id=new.tenant_id
        and ur.company_id=new.company_id
    ) then
      raise exception 'Notification user audience belongs to another company' using errcode='42501';
    elsif new.company_id is null and not exists (
      select 1 from public.user_roles ur
      where ur.user_id=new.audience_id and ur.tenant_id=new.tenant_id
    ) and not exists (
      select 1 from public.super_owners so where so.user_id=new.audience_id
    ) then
      raise exception 'Notification user audience is not a member of this tenant' using errcode='23503';
    end if;
  end if;

  return new;
end;
$function$;
revoke all on function private.enforce_notification_company_scope() from public, anon, authenticated;
grant execute on function private.enforce_notification_company_scope() to authenticated, service_role;

drop trigger if exists notifications_enforce_company_scope on public.notifications;
create trigger notifications_enforce_company_scope
before insert or update of tenant_id, company_id, audience_type, audience_id, created_by
on public.notifications
for each row execute function private.enforce_notification_company_scope();

-- Company managers may create/edit notifications only for their company.
-- Tenant owners and the platform owner retain broader management.
drop policy if exists notifications_admin_write on public.notifications;
drop policy if exists notifications_admin_insert on public.notifications;
drop policy if exists notifications_admin_update on public.notifications;
drop policy if exists notifications_admin_delete on public.notifications;

create policy notifications_admin_insert on public.notifications
for insert to authenticated
with check (
  is_super_owner((select auth.uid()))
  or private.user_has_role_in_tenant((select auth.uid()), tenant_id, array['owner','manager'])
);
create policy notifications_admin_update on public.notifications
for update to authenticated
using (
  is_super_owner((select auth.uid()))
  or private.user_has_role_in_tenant((select auth.uid()), tenant_id, array['owner','manager'])
)
with check (
  is_super_owner((select auth.uid()))
  or private.user_has_role_in_tenant((select auth.uid()), tenant_id, array['owner','manager'])
);
create policy notifications_admin_delete on public.notifications
for delete to authenticated
using (
  is_super_owner((select auth.uid()))
  or private.user_has_role_in_tenant((select auth.uid()), tenant_id, array['owner','manager'])
);

drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications
for select to authenticated
using (
  is_super_owner((select auth.uid()))
  or (
    tenant_id is not null
    and private.is_tenant_member((select auth.uid()), tenant_id)
    and (
      company_id is null
      or exists (
        select 1 from public.user_roles ur
        where ur.user_id=(select auth.uid()) and ur.tenant_id=notifications.tenant_id
          and ur.role='owner' and ur.company_id is null
      )
      or exists (
        select 1 from public.user_roles ur
        where ur.user_id=(select auth.uid()) and ur.tenant_id=notifications.tenant_id
          and ur.company_id=notifications.company_id
      )
    )
    and (
      audience_type='all'
      or (audience_type in ('owner','manager')
          and private.user_has_role_in_tenant((select auth.uid()), tenant_id, array[audience_type]))
      or (audience_type='user' and audience_id=(select auth.uid()))
      or (audience_type='branch' and exists (
        select 1 from public.branches b
        where b.id=notifications.audience_id and b.tenant_id=notifications.tenant_id
          and private.can_access_branch((select auth.uid()), notifications.tenant_id, b.id)
      ))
      or (audience_type='department' and exists (
        select 1 from public.departments d
        where d.id=notifications.audience_id and d.tenant_id=notifications.tenant_id
          and (
            exists (
              select 1 from public.user_roles ur
              where ur.user_id=(select auth.uid()) and ur.tenant_id=notifications.tenant_id
                and ur.department_id=d.id
                and (ur.company_id is null or ur.company_id=d.company_id)
            )
            or exists (
              select 1 from public.user_roles ur
              where ur.user_id=(select auth.uid()) and ur.tenant_id=notifications.tenant_id
                and (
                  (ur.role in ('owner','manager') and ur.company_id is not null and ur.company_id=d.company_id)
                  or (ur.role='owner' and ur.company_id is null)
                )
            )
          )
      ))
    )
  )
);

drop policy if exists company_scope_notifications_select on public.notifications;
create policy company_scope_notifications_select on public.notifications
as restrictive for select to authenticated
using (
  is_super_owner((select auth.uid()))
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=notifications.tenant_id
      and ur.role='owner' and ur.company_id is null
  )
  or (company_id is not null and exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=notifications.tenant_id
      and ur.company_id=notifications.company_id
  ))
  or (company_id is null and (
    (audience_type='branch' and exists (
      select 1 from public.branches b
      where b.id=notifications.audience_id and b.tenant_id=notifications.tenant_id
        and private.can_access_branch((select auth.uid()), notifications.tenant_id, b.id)
    ))
    or (audience_type='department' and exists (
      select 1 from public.departments d
      join public.user_roles ur on ur.user_id=(select auth.uid())
        and ur.tenant_id=notifications.tenant_id
      where d.id=notifications.audience_id and d.tenant_id=notifications.tenant_id
        and (
          (ur.department_id=d.id and (ur.company_id is null or ur.company_id=d.company_id))
          or (ur.role in ('owner','manager') and ur.company_id is not null and ur.company_id=d.company_id)
        )
    ))
    or (audience_type='user' and audience_id=(select auth.uid()))
    or (audience_type in ('all','owner','manager') and (
      notifications.created_by is null
      or exists (select 1 from public.super_owners so where so.user_id=notifications.created_by)
      or exists (
        select 1 from public.user_roles creator_role
        where creator_role.user_id=notifications.created_by
          and creator_role.tenant_id=notifications.tenant_id
          and creator_role.role='owner' and creator_role.company_id is null
      )
    ))
  ))
);

drop policy if exists company_scope_notifications_insert on public.notifications;
create policy company_scope_notifications_insert on public.notifications
as restrictive for insert to authenticated
with check (
  is_super_owner((select auth.uid()))
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=notifications.tenant_id
      and ur.role='owner' and ur.company_id is null
  )
  or (company_id is not null and exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=notifications.tenant_id
      and ur.company_id=notifications.company_id and ur.role in ('owner','manager')
      and has_permission((select auth.uid()), notifications.tenant_id, 'notifications.manage')
  ))
);

drop policy if exists company_scope_notifications_update on public.notifications;
create policy company_scope_notifications_update on public.notifications
as restrictive for update to authenticated
using (
  is_super_owner((select auth.uid()))
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=notifications.tenant_id
      and ur.role='owner' and ur.company_id is null
  )
  or (company_id is not null and exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=notifications.tenant_id
      and ur.company_id=notifications.company_id and ur.role in ('owner','manager')
      and has_permission((select auth.uid()), notifications.tenant_id, 'notifications.manage')
  ))
)
with check (
  is_super_owner((select auth.uid()))
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=notifications.tenant_id
      and ur.role='owner' and ur.company_id is null
  )
  or (company_id is not null and exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=notifications.tenant_id
      and ur.company_id=notifications.company_id and ur.role in ('owner','manager')
      and has_permission((select auth.uid()), notifications.tenant_id, 'notifications.manage')
  ))
);

drop policy if exists company_scope_notifications_delete on public.notifications;
create policy company_scope_notifications_delete on public.notifications
as restrictive for delete to authenticated
using (
  is_super_owner((select auth.uid()))
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=notifications.tenant_id
      and ur.role='owner' and ur.company_id is null
  )
  or (company_id is not null and exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=notifications.tenant_id
      and ur.company_id=notifications.company_id and ur.role in ('owner','manager')
      and has_permission((select auth.uid()), notifications.tenant_id, 'notifications.manage')
  ))
);

-- Marketing campaigns are company-scoped; NULL company_id is a tenant-wide campaign.
create or replace function private.enforce_marketing_campaign_company_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_is_super boolean;
  v_is_tenant_owner boolean;
  v_company_count integer;
  v_actor_company uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  v_is_super := exists (select 1 from public.super_owners so where so.user_id=v_uid);

  if tg_op='INSERT' then
    if new.created_by is null then
      new.created_by := v_uid;
    elsif new.created_by is distinct from v_uid and not v_is_super then
      raise exception 'Campaign creator must be the authenticated user' using errcode='42501';
    end if;
  elsif new.created_by is distinct from old.created_by and not v_is_super then
    raise exception 'Campaign creator is immutable' using errcode='42501';
  end if;

  v_is_tenant_owner := exists (
    select 1 from public.user_roles ur
    where ur.user_id=v_uid and ur.tenant_id=new.tenant_id
      and ur.role='owner' and ur.company_id is null
  );
  select count(distinct ur.company_id), min(ur.company_id::text)::uuid
    into v_company_count, v_actor_company
  from public.user_roles ur
  where ur.user_id=v_uid and ur.tenant_id=new.tenant_id
    and ur.role in ('owner','manager') and ur.company_id is not null;

  if not v_is_super and not v_is_tenant_owner then
    if new.company_id is null then
      if v_company_count <> 1 then
        raise exception 'Select a company for this campaign' using errcode='42501';
      end if;
      new.company_id := v_actor_company;
    end if;
    if not exists (
      select 1 from public.user_roles ur
      where ur.user_id=v_uid and ur.tenant_id=new.tenant_id
        and ur.company_id=new.company_id and ur.role in ('owner','manager')
    ) then
      raise exception 'You cannot manage campaigns for another company' using errcode='42501';
    end if;
  end if;

  if new.company_id is not null and not exists (
    select 1 from public.companies c
    where c.id=new.company_id and c.tenant_id=new.tenant_id
  ) then
    raise exception 'Campaign company must belong to the same tenant' using errcode='23514';
  end if;
  return new;
end;
$function$;
revoke all on function private.enforce_marketing_campaign_company_scope() from public, anon, authenticated;
grant execute on function private.enforce_marketing_campaign_company_scope() to authenticated, service_role;

drop trigger if exists marketing_campaigns_enforce_company_scope on public.marketing_campaigns;
create trigger marketing_campaigns_enforce_company_scope
before insert or update of tenant_id, company_id, created_by
on public.marketing_campaigns
for each row execute function private.enforce_marketing_campaign_company_scope();

drop policy if exists "Tenant admins manage marketing campaigns" on public.marketing_campaigns;
create policy "Tenant admins insert marketing campaigns" on public.marketing_campaigns
for insert to authenticated
with check (private.is_tenant_admin((select auth.uid()), tenant_id) or is_super_owner((select auth.uid())));
create policy "Tenant admins update marketing campaigns" on public.marketing_campaigns
for update to authenticated
using (private.is_tenant_admin((select auth.uid()), tenant_id) or is_super_owner((select auth.uid())))
with check (private.is_tenant_admin((select auth.uid()), tenant_id) or is_super_owner((select auth.uid())));
create policy "Tenant admins delete marketing campaigns" on public.marketing_campaigns
for delete to authenticated
using (private.is_tenant_admin((select auth.uid()), tenant_id) or is_super_owner((select auth.uid())));

drop policy if exists company_scope_marketing_campaigns_select on public.marketing_campaigns;
create policy company_scope_marketing_campaigns_select on public.marketing_campaigns
as restrictive for select to authenticated
using (
  is_super_owner((select auth.uid()))
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=marketing_campaigns.tenant_id
      and ur.role='owner' and ur.company_id is null
  )
  or (company_id is not null and (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id=(select auth.uid()) and ur.tenant_id=marketing_campaigns.tenant_id
        and ur.company_id=marketing_campaigns.company_id
    )
    or exists (
      select 1 from public.user_roles ur
      join public.branches b on b.id=ur.branch_id and b.tenant_id=ur.tenant_id
      where ur.user_id=(select auth.uid()) and ur.tenant_id=marketing_campaigns.tenant_id
        and b.company_id=marketing_campaigns.company_id
        and (ur.company_id is null or ur.company_id=b.company_id)
    )
    or exists (
      select 1 from public.user_roles ur
      join public.departments d on d.id=ur.department_id and d.tenant_id=ur.tenant_id
      where ur.user_id=(select auth.uid()) and ur.tenant_id=marketing_campaigns.tenant_id
        and d.company_id=marketing_campaigns.company_id
        and (ur.company_id is null or ur.company_id=d.company_id)
    )
  ))
  or (company_id is null and (
    marketing_campaigns.created_by is null
    or exists (
      select 1 from public.super_owners so
      where so.user_id=marketing_campaigns.created_by
    )
    or exists (
      select 1 from public.user_roles creator_role
      where creator_role.user_id=marketing_campaigns.created_by
        and creator_role.tenant_id=marketing_campaigns.tenant_id
        and creator_role.role='owner' and creator_role.company_id is null
    )
  ))
);

drop policy if exists company_scope_marketing_campaigns_insert on public.marketing_campaigns;
create policy company_scope_marketing_campaigns_insert on public.marketing_campaigns
as restrictive for insert to authenticated
with check (
  is_super_owner((select auth.uid()))
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=marketing_campaigns.tenant_id
      and ur.role='owner' and ur.company_id is null
  )
  or (company_id is not null and exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=marketing_campaigns.tenant_id
      and ur.company_id=marketing_campaigns.company_id and ur.role in ('owner','manager')
      and has_permission((select auth.uid()), marketing_campaigns.tenant_id, 'settings.manage')
  ))
);

drop policy if exists company_scope_marketing_campaigns_update on public.marketing_campaigns;
create policy company_scope_marketing_campaigns_update on public.marketing_campaigns
as restrictive for update to authenticated
using (
  is_super_owner((select auth.uid()))
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=marketing_campaigns.tenant_id
      and ur.role='owner' and ur.company_id is null
  )
  or (company_id is not null and exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=marketing_campaigns.tenant_id
      and ur.company_id=marketing_campaigns.company_id and ur.role in ('owner','manager')
      and has_permission((select auth.uid()), marketing_campaigns.tenant_id, 'settings.manage')
  ))
)
with check (
  is_super_owner((select auth.uid()))
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=marketing_campaigns.tenant_id
      and ur.role='owner' and ur.company_id is null
  )
  or (company_id is not null and exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=marketing_campaigns.tenant_id
      and ur.company_id=marketing_campaigns.company_id and ur.role in ('owner','manager')
      and has_permission((select auth.uid()), marketing_campaigns.tenant_id, 'settings.manage')
  ))
);

drop policy if exists company_scope_marketing_campaigns_delete on public.marketing_campaigns;
create policy company_scope_marketing_campaigns_delete on public.marketing_campaigns
as restrictive for delete to authenticated
using (
  is_super_owner((select auth.uid()))
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=marketing_campaigns.tenant_id
      and ur.role='owner' and ur.company_id is null
  )
  or (company_id is not null and exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid()) and ur.tenant_id=marketing_campaigns.tenant_id
      and ur.company_id=marketing_campaigns.company_id and ur.role in ('owner','manager')
      and has_permission((select auth.uid()), marketing_campaigns.tenant_id, 'settings.manage')
  ))
);

commit;
