-- Scope role assignments and permission overrides to the employee's company.
-- Tenant owners and the platform owner retain tenant-wide administration.
begin;

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
        join public.profiles creator_profile
          on creator_profile.id=_creator_id and creator_profile.tenant_id=_tenant_id
        where viewer.user_id=(select auth.uid())
          and viewer.tenant_id=_tenant_id
          and viewer.company_id is not null
          and creator_profile.company_id=viewer.company_id
          and (creator_profile.branch_id is null
               or private.can_access_branch((select auth.uid()),_tenant_id,creator_profile.branch_id))
          and not exists (
            select 1 from public.user_roles conflicting_role
            left join public.branches conflicting_branch
              on conflicting_branch.id=conflicting_role.branch_id
             and conflicting_branch.tenant_id=conflicting_role.tenant_id
            where conflicting_role.user_id=_creator_id
              and conflicting_role.tenant_id=_tenant_id
              and (
                (conflicting_role.company_id is not null
                 and conflicting_role.company_id<>creator_profile.company_id)
                or (conflicting_role.company_id is not null
                    and conflicting_branch.company_id is not null
                    and conflicting_role.company_id<>conflicting_branch.company_id)
              )
          )
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
          and not exists (
            select 1 from public.profiles p
            where p.id=_creator_id and p.tenant_id=_tenant_id
              and (p.company_id is not null or p.branch_id is not null)
          )
          and (
            select count(distinct coalesce(creator_scope.company_id,creator_branch.company_id))
            from public.user_roles creator_scope
            left join public.branches creator_branch
              on creator_branch.id=creator_scope.branch_id and creator_branch.tenant_id=creator_scope.tenant_id
            where creator_scope.user_id=_creator_id and creator_scope.tenant_id=_tenant_id
              and coalesce(creator_scope.company_id,creator_branch.company_id) is not null
          )=1
          and not exists (
            select 1
            from public.user_roles conflicting_role
            join public.branches conflicting_branch
              on conflicting_branch.id=conflicting_role.branch_id
             and conflicting_branch.tenant_id=conflicting_role.tenant_id
            where conflicting_role.user_id=_creator_id
              and conflicting_role.tenant_id=_tenant_id
              and conflicting_role.company_id is not null
              and conflicting_branch.company_id is not null
              and conflicting_role.company_id<>conflicting_branch.company_id
          )
          and not exists (
            select 1 from public.user_roles creator_owner
            where creator_owner.user_id=_creator_id and creator_owner.tenant_id=_tenant_id
              and creator_owner.role='owner' and creator_owner.company_id is null
          )
      )
    );
$function$;
revoke all on function private.can_access_creator_company(uuid,uuid) from public, anon;
grant execute on function private.can_access_creator_company(uuid,uuid) to authenticated, service_role;

create or replace function private.is_super_owner_target(_actor_id uuid,_target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select _actor_id=(select auth.uid())
    and exists (
      select 1 from public.super_owners so where so.user_id=_target_user_id
    );
$function$;
revoke all on function private.is_super_owner_target(uuid,uuid) from public, anon;
grant execute on function private.is_super_owner_target(uuid,uuid) to authenticated, service_role;

-- SECURITY DEFINER helpers avoid recursive RLS evaluation while checking
-- the actor's and target user's role assignments.
create or replace function private.is_tenant_owner_user(_user_id uuid,_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select _user_id=(select auth.uid())
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id=_user_id and ur.tenant_id=_tenant_id
        and ur.role='owner' and ur.company_id is null
    );
$function$;
revoke all on function private.is_tenant_owner_user(uuid,uuid) from public, anon;
grant execute on function private.is_tenant_owner_user(uuid,uuid) to authenticated, service_role;

create or replace function private.can_view_user_role_row(
  _viewer_id uuid,_tenant_id uuid,_target_user_id uuid,
  _row_company_id uuid,_row_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select _viewer_id=(select auth.uid())
    and (
      _viewer_id=_target_user_id
      or public.is_super_owner(_viewer_id)
      or private.is_tenant_owner_user(_viewer_id,_tenant_id)
      or (
        _row_company_id is not null
        and exists (
          select 1 from public.user_roles viewer
          where viewer.user_id=_viewer_id and viewer.tenant_id=_tenant_id
            and viewer.company_id=_row_company_id
        )
        and exists (
          select 1 from public.profiles target_profile
          where target_profile.id=_target_user_id and target_profile.tenant_id=_tenant_id
            and (target_profile.company_id is null or target_profile.company_id=_row_company_id)
            and (target_profile.branch_id is null
                 or private.can_access_branch(_viewer_id,_tenant_id,target_profile.branch_id))
        )
        and not exists (
          select 1
          from public.user_roles conflicting_role
          left join public.branches conflicting_branch
            on conflicting_branch.id=conflicting_role.branch_id
           and conflicting_branch.tenant_id=conflicting_role.tenant_id
          where conflicting_role.user_id=_target_user_id
            and conflicting_role.tenant_id=_tenant_id
            and (
              (conflicting_role.company_id is not null
               and conflicting_role.company_id<>_row_company_id)
              or (conflicting_role.company_id is not null
                  and conflicting_branch.company_id is not null
                  and conflicting_role.company_id<>conflicting_branch.company_id)
            )
        )
        and (_row_branch_id is null or private.can_access_branch(_viewer_id,_tenant_id,_row_branch_id))
      )
      or (
        _row_company_id is null and _row_branch_id is not null
        and private.can_access_branch(_viewer_id,_tenant_id,_row_branch_id)
        and exists (
          select 1 from public.profiles target_profile
          where target_profile.id=_target_user_id and target_profile.tenant_id=_tenant_id
            and (target_profile.company_id is null or target_profile.company_id=(
              select b.company_id from public.branches b
              where b.id=_row_branch_id and b.tenant_id=_tenant_id
            ))
            and (target_profile.branch_id is null
                 or private.can_access_branch(_viewer_id,_tenant_id,target_profile.branch_id))
        )
        and not exists (
          select 1
          from public.user_roles conflicting_role
          left join public.branches conflicting_branch
            on conflicting_branch.id=conflicting_role.branch_id
           and conflicting_branch.tenant_id=conflicting_role.tenant_id
          where conflicting_role.user_id=_target_user_id
            and conflicting_role.tenant_id=_tenant_id
            and conflicting_role.company_id is not null
            and conflicting_role.company_id is distinct from (
              select b.company_id from public.branches b
              where b.id=_row_branch_id and b.tenant_id=_tenant_id
            )
        )
      )
    );
$function$;
revoke all on function private.can_view_user_role_row(uuid,uuid,uuid,uuid,uuid) from public, anon;
grant execute on function private.can_view_user_role_row(uuid,uuid,uuid,uuid,uuid) to authenticated, service_role;

create or replace function private.can_manage_user_role_row(
  _actor_id uuid,_tenant_id uuid,_target_user_id uuid,
  _row_company_id uuid,_row_branch_id uuid,_row_role public.app_role
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select _actor_id=(select auth.uid())
    and not exists (
      select 1 from public.super_owners protected_super_owner
      where protected_super_owner.user_id=_target_user_id
    )
    and (
      public.is_super_owner(_actor_id)
      or (
        _row_role<>'owner'::public.app_role
        and private.is_tenant_owner_user(_actor_id,_tenant_id)
      )
      or (
        _row_role not in ('owner'::public.app_role,'manager'::public.app_role)
        and _row_company_id is not null
        and exists (
          select 1 from public.user_roles company_admin
          where company_admin.user_id=_actor_id
            and company_admin.tenant_id=_tenant_id
            and company_admin.role in ('owner','manager')
            and company_admin.company_id=_row_company_id
        )
        and public.has_permission(_actor_id,_tenant_id,'users.change_role')
        and (_row_branch_id is null or private.can_access_branch(_actor_id,_tenant_id,_row_branch_id))
        and exists (
          select 1 from public.profiles target_profile
          where target_profile.id=_target_user_id and target_profile.tenant_id=_tenant_id
            and (target_profile.company_id is null or target_profile.company_id=_row_company_id)
            and (target_profile.branch_id is null
                 or private.can_access_branch(_actor_id,_tenant_id,target_profile.branch_id))
        )
        and not exists (
          select 1
          from public.user_roles conflicting_role
          left join public.branches conflicting_branch
            on conflicting_branch.id=conflicting_role.branch_id
           and conflicting_branch.tenant_id=conflicting_role.tenant_id
          where conflicting_role.user_id=_target_user_id
            and conflicting_role.tenant_id=_tenant_id
            and (
              (conflicting_role.company_id is not null
               and conflicting_role.company_id<>_row_company_id)
              or (conflicting_role.company_id is not null
                  and conflicting_branch.company_id is not null
                  and conflicting_role.company_id<>conflicting_branch.company_id)
            )
        )
      )
    );
$function$;
revoke all on function private.can_manage_user_role_row(uuid,uuid,uuid,uuid,uuid,public.app_role) from public, anon;
grant execute on function private.can_manage_user_role_row(uuid,uuid,uuid,uuid,uuid,public.app_role) to authenticated, service_role;

-- Restrict each user_roles row by its own company/branch, not merely by whether
-- the target user has any membership in the viewer's company.
drop policy if exists company_scope_user_roles_select on public.user_roles;
create policy company_scope_user_roles_select on public.user_roles
as restrictive for select to authenticated
using (
  private.can_view_user_role_row(
    (select auth.uid()),tenant_id,user_id,company_id,branch_id
  )
);

drop policy if exists company_scope_user_roles_insert on public.user_roles;
create policy company_scope_user_roles_insert on public.user_roles
as restrictive for insert to authenticated
with check (
  private.can_manage_user_role_row(
    (select auth.uid()),tenant_id,user_id,company_id,branch_id,role
  )
  or (
    user_id=(select auth.uid()) and role='owner'
    and company_id is null and branch_id is null
    and not public.is_super_owner((select auth.uid()))
    and exists (
      select 1 from public.tenants t
      where t.id=user_roles.tenant_id and t.owner_id=(select auth.uid())
    )
  )
);

drop policy if exists company_scope_user_roles_update on public.user_roles;
create policy company_scope_user_roles_update on public.user_roles
as restrictive for update to authenticated
using (
  private.can_manage_user_role_row(
    (select auth.uid()),tenant_id,user_id,company_id,branch_id,role
  )
)
with check (
  private.can_manage_user_role_row(
    (select auth.uid()),tenant_id,user_id,company_id,branch_id,role
  )
);

drop policy if exists company_scope_user_roles_delete on public.user_roles;
create policy company_scope_user_roles_delete on public.user_roles
as restrictive for delete to authenticated
using (
  private.can_manage_user_role_row(
    (select auth.uid()),tenant_id,user_id,company_id,branch_id,role
  )
);

-- Custom role definitions are tenant-wide, so company-scoped owners/managers
-- must not change definitions that affect other companies.
drop policy if exists company_scope_custom_roles_insert on public.custom_roles;
create policy company_scope_custom_roles_insert on public.custom_roles
as restrictive for insert to authenticated
with check (
  is_super_owner((select auth.uid()))
  or private.is_tenant_owner_user((select auth.uid()),tenant_id)
);

drop policy if exists company_scope_custom_roles_update on public.custom_roles;
create policy company_scope_custom_roles_update on public.custom_roles
as restrictive for update to authenticated
using (
  is_super_owner((select auth.uid()))
  or private.is_tenant_owner_user((select auth.uid()),tenant_id)
)
with check (
  is_super_owner((select auth.uid()))
  or private.is_tenant_owner_user((select auth.uid()),tenant_id)
);

drop policy if exists company_scope_custom_roles_delete on public.custom_roles;
create policy company_scope_custom_roles_delete on public.custom_roles
as restrictive for delete to authenticated
using (
  is_super_owner((select auth.uid()))
  or private.is_tenant_owner_user((select auth.uid()),tenant_id)
);

-- The permissive UPO policies still require the relevant role/permission and hiring
-- relationship; these restrictive policies add the missing company boundary.
drop policy if exists company_scope_user_permission_overrides_insert on public.user_permission_overrides;
create policy company_scope_user_permission_overrides_insert on public.user_permission_overrides
as restrictive for insert to authenticated
with check (
  not private.is_super_owner_target((select auth.uid()),user_permission_overrides.user_id)
  and (
    is_super_owner((select auth.uid()))
    or private.can_access_creator_company(tenant_id,user_id)
  )
);

drop policy if exists company_scope_user_permission_overrides_update on public.user_permission_overrides;
create policy company_scope_user_permission_overrides_update on public.user_permission_overrides
as restrictive for update to authenticated
using (
  not private.is_super_owner_target((select auth.uid()),user_permission_overrides.user_id)
  and (
    is_super_owner((select auth.uid()))
    or private.can_access_creator_company(tenant_id,user_id)
  )
)
with check (
  not private.is_super_owner_target((select auth.uid()),user_permission_overrides.user_id)
  and (
    is_super_owner((select auth.uid()))
    or private.can_access_creator_company(tenant_id,user_id)
  )
);

drop policy if exists company_scope_user_permission_overrides_delete on public.user_permission_overrides;
create policy company_scope_user_permission_overrides_delete on public.user_permission_overrides
as restrictive for delete to authenticated
using (
  not private.is_super_owner_target((select auth.uid()),user_permission_overrides.user_id)
  and (
    is_super_owner((select auth.uid()))
    or private.can_access_creator_company(tenant_id,user_id)
  )
);

-- Protect the platform owner's profile from tenant/company administrators.
-- The platform owner may still update their own ordinary profile fields.
drop policy if exists protect_super_owner_profile_update on public.profiles;
create policy protect_super_owner_profile_update on public.profiles
as restrictive for update to authenticated
using (
  not private.is_super_owner_target((select auth.uid()),profiles.id)
  or profiles.id=(select auth.uid())
)
with check (
  not private.is_super_owner_target((select auth.uid()),profiles.id)
  or profiles.id=(select auth.uid())
);

drop policy if exists protect_super_owner_profile_delete on public.profiles;
create policy protect_super_owner_profile_delete on public.profiles
as restrictive for delete to authenticated
using (
  not private.is_super_owner_target((select auth.uid()),profiles.id)
);

-- Assign a custom role only within the actor's company unless the actor is the
-- tenant owner or platform owner. Preserve company_id on both role and profile.
create or replace function public.assign_custom_role_to_user(
  _user_id uuid, _tenant_id uuid, _custom_role_id uuid, _branch_id uuid, _actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_is_super boolean;
  v_is_tenant_owner boolean;
  v_actor_company_count integer;
  v_actor_company uuid;
  v_actor_company_wide boolean := false;
  v_profile_company uuid;
  v_profile_branch uuid;
  v_profile_hired_by uuid;
  v_target_company_count integer;
  v_target_company uuid;
  v_branch_company uuid;
  v_has_target_owner boolean;
  v_has_target_manager boolean;
begin
  if auth.uid() is null or _actor_id is distinct from auth.uid() then
    raise exception 'Authenticated actor mismatch' using errcode='42501';
  end if;
  if exists (select 1 from public.super_owners so where so.user_id=_user_id) then
    raise exception 'The platform Super Owner account is protected' using errcode='42501';
  end if;

  v_is_super := public.is_super_owner(auth.uid());
  v_is_tenant_owner := exists (
    select 1 from public.user_roles ur
    where ur.user_id=auth.uid() and ur.tenant_id=_tenant_id
      and ur.role='owner' and ur.company_id is null
  );

  if not v_is_super and not v_is_tenant_owner then
    select count(distinct coalesce(ur.company_id,b.company_id)),
           min(coalesce(ur.company_id,b.company_id)::text)::uuid
      into v_actor_company_count,v_actor_company
    from public.user_roles ur
    left join public.branches b on b.id=ur.branch_id and b.tenant_id=ur.tenant_id
    where ur.user_id=auth.uid() and ur.tenant_id=_tenant_id
      and ur.role in ('owner','manager')
      and coalesce(ur.company_id,b.company_id) is not null;
    if v_actor_company_count <> 1 then
      raise exception 'Actor must be assigned to exactly one company' using errcode='42501';
    end if;
    select exists (
      select 1 from public.user_roles actor_role
      where actor_role.user_id=auth.uid() and actor_role.tenant_id=_tenant_id
        and actor_role.company_id=v_actor_company
        and actor_role.role in ('owner','manager')
    ) into v_actor_company_wide;
  end if;

  if not public.has_permission(auth.uid(),_tenant_id,'roles.manage')
     or not public.has_permission(auth.uid(),_tenant_id,'users.change_role') then
    raise exception 'Permission denied: roles.manage' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.custom_roles
    where id=_custom_role_id and tenant_id=_tenant_id
  ) then
    raise exception 'Custom role does not belong to this tenant' using errcode='23503';
  end if;

  select p.company_id,p.branch_id,p.hired_by
    into v_profile_company,v_profile_branch,v_profile_hired_by
  from public.profiles p
  where p.id=_user_id and p.tenant_id=_tenant_id
  for update;
  if not found then
    raise exception 'Target user does not belong to this tenant' using errcode='P0002';
  end if;

  perform 1 from public.user_roles ur
  where ur.user_id=_user_id and ur.tenant_id=_tenant_id
  for update;

  select coalesce(bool_or(ur.role='owner'),false),
         coalesce(bool_or(ur.role='manager'),false),
         count(distinct coalesce(ur.company_id,b.company_id)),
         min(coalesce(ur.company_id,b.company_id)::text)::uuid
    into v_has_target_owner,v_has_target_manager,v_target_company_count,v_target_company
  from public.user_roles ur
  left join public.branches b on b.id=ur.branch_id and b.tenant_id=ur.tenant_id
  where ur.user_id=_user_id and ur.tenant_id=_tenant_id
    and coalesce(ur.company_id,b.company_id) is not null;

  if v_has_target_owner then
    raise exception 'The tenant owner cannot be assigned a custom staff role' using errcode='42501';
  end if;
  if v_target_company_count>1 then
    raise exception 'Target user has conflicting company role assignments' using errcode='42501';
  end if;
  if v_profile_company is not null and v_target_company_count>0
     and v_target_company is distinct from v_profile_company then
    raise exception 'Target profile and role company assignments do not match' using errcode='42501';
  end if;

  v_target_company := coalesce(v_profile_company,v_target_company);
  if v_target_company is null and v_profile_branch is not null then
    select b.company_id into v_branch_company
    from public.branches b where b.id=v_profile_branch and b.tenant_id=_tenant_id;
    v_target_company := v_branch_company;
  end if;

  if _branch_id is not null then
    select b.company_id into v_branch_company
    from public.branches b
    where b.id=_branch_id and b.tenant_id=_tenant_id and b.is_active=true;
    if not found then
      raise exception 'Branch does not belong to the requested tenant or is inactive' using errcode='23503';
    end if;
    if v_target_company is not null and v_target_company is distinct from v_branch_company then
      raise exception 'Branch belongs to another company' using errcode='42501';
    end if;
    if v_target_company is null and not v_is_super and not v_is_tenant_owner
       and v_profile_hired_by is distinct from auth.uid() then
      raise exception 'You cannot assign an unowned user to another company' using errcode='42501';
    end if;
    v_target_company := v_branch_company;
  end if;

  if v_target_company is not null and not exists (
    select 1 from public.companies c
    where c.id=v_target_company and c.tenant_id=_tenant_id
  ) then
    raise exception 'Target company does not belong to this tenant' using errcode='23503';
  end if;

  -- Branch-only managers may administer only users and branches already assigned to them.
  if not v_is_super and not v_is_tenant_owner and not v_actor_company_wide then
    if v_profile_branch is null and not exists (
      select 1 from public.user_roles target_role
      where target_role.user_id=_user_id and target_role.tenant_id=_tenant_id
        and target_role.branch_id is not null
    ) then
      raise exception 'Branch-scoped manager cannot manage an unassigned company user' using errcode='42501';
    end if;
    if v_profile_branch is not null and not exists (
      select 1 from public.user_roles actor_role
      where actor_role.user_id=auth.uid() and actor_role.tenant_id=_tenant_id
        and actor_role.branch_id=v_profile_branch
        and (actor_role.company_id is null or actor_role.company_id=v_target_company)
    ) then
      raise exception 'Target profile branch is outside the actor branch scope' using errcode='42501';
    end if;
    if exists (
      select 1 from public.user_roles target_role
      where target_role.user_id=_user_id and target_role.tenant_id=_tenant_id
        and target_role.branch_id is not null
        and not exists (
          select 1 from public.user_roles actor_role
          where actor_role.user_id=auth.uid() and actor_role.tenant_id=_tenant_id
            and actor_role.branch_id=target_role.branch_id
            and (actor_role.company_id is null or actor_role.company_id=v_target_company)
        )
    ) then
      raise exception 'Target role branch is outside the actor branch scope' using errcode='42501';
    end if;
    if _branch_id is null or not exists (
      select 1 from public.user_roles actor_role
      where actor_role.user_id=auth.uid() and actor_role.tenant_id=_tenant_id
        and actor_role.branch_id=_branch_id
        and (actor_role.company_id is null or actor_role.company_id=v_target_company)
    ) then
      raise exception 'Branch-scoped manager may assign only to an assigned branch' using errcode='42501';
    end if;
  end if;
  if not v_is_super and not v_is_tenant_owner
     and v_target_company is distinct from v_actor_company then
    raise exception 'You cannot assign a custom role outside your company' using errcode='42501';
  end if;
  if v_has_target_manager and not v_is_super and not v_is_tenant_owner then
    raise exception 'Only the tenant owner can change a manager role' using errcode='42501';
  end if;

  delete from public.user_roles
  where user_id=_user_id and tenant_id=_tenant_id;

  insert into public.user_roles(user_id,tenant_id,role,branch_id,company_id,hired_by,custom_role_id)
  values(_user_id,_tenant_id,'waiter'::public.app_role,_branch_id,v_target_company,auth.uid(),_custom_role_id);

  update public.profiles
  set branch_id=_branch_id,company_id=coalesce(v_target_company,company_id)
  where id=_user_id and tenant_id=_tenant_id;
end;
$function$;
revoke all on function public.assign_custom_role_to_user(uuid,uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.assign_custom_role_to_user(uuid,uuid,uuid,uuid,uuid) to authenticated, service_role;

-- Replace a user's built-in role without losing company assignment or allowing
-- a company manager to operate on another company's staff.
create or replace function public.replace_user_role_in_tenant(
  _user_id uuid, _tenant_id uuid, _role public.app_role, _branch_id uuid, _actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_is_super boolean;
  v_is_tenant_owner boolean;
  v_actor_company_count integer;
  v_actor_company uuid;
  v_profile_company uuid;
  v_profile_branch uuid;
  v_profile_hired_by uuid;
  v_target_company_count integer;
  v_target_company uuid;
  v_branch_company uuid;
  v_has_target_owner boolean;
  v_has_target_manager boolean;
begin
  if _actor_id is null then
    raise exception 'Actor is required' using errcode='42501';
  end if;
  if exists (select 1 from public.super_owners so where so.user_id=_user_id) then
    raise exception 'The platform Super Owner account is protected' using errcode='42501';
  end if;
  v_is_super := public.is_super_owner(_actor_id);
  v_is_tenant_owner := exists (
    select 1 from public.user_roles ur
    where ur.user_id=_actor_id and ur.tenant_id=_tenant_id
      and ur.role='owner' and ur.company_id is null
  );

  if not v_is_super and not v_is_tenant_owner then
    select count(distinct coalesce(ur.company_id,b.company_id)),
           min(coalesce(ur.company_id,b.company_id)::text)::uuid
      into v_actor_company_count,v_actor_company
    from public.user_roles ur
    left join public.branches b on b.id=ur.branch_id and b.tenant_id=ur.tenant_id
    where ur.user_id=_actor_id and ur.tenant_id=_tenant_id
      and ur.role in ('owner','manager')
      and coalesce(ur.company_id,b.company_id) is not null;
    if v_actor_company_count <> 1 then
      raise exception 'Actor must be assigned to exactly one company' using errcode='42501';
    end if;
  end if;

  if not public.has_permission(_actor_id,_tenant_id,'users.change_role') then
    raise exception 'Permission denied: users.change_role' using errcode='42501';
  end if;
  if _role='owner'::public.app_role then
    raise exception 'The tenant owner role cannot be assigned through staff management' using errcode='42501';
  end if;
  if _role='manager'::public.app_role and not v_is_super and not v_is_tenant_owner then
    raise exception 'Only the tenant owner can assign a manager role' using errcode='42501';
  end if;

  select p.company_id,p.branch_id,p.hired_by
    into v_profile_company,v_profile_branch,v_profile_hired_by
  from public.profiles p
  where p.id=_user_id and p.tenant_id=_tenant_id
  for update;
  if not found then
    raise exception 'Target profile was not found in the requested tenant' using errcode='P0002';
  end if;

  perform 1 from public.user_roles ur
  where ur.user_id=_user_id and ur.tenant_id=_tenant_id
  for update;

  select coalesce(bool_or(ur.role='owner'),false),
         coalesce(bool_or(ur.role='manager'),false),
         count(distinct coalesce(ur.company_id,b.company_id)),
         min(coalesce(ur.company_id,b.company_id)::text)::uuid
    into v_has_target_owner,v_has_target_manager,v_target_company_count,v_target_company
  from public.user_roles ur
  left join public.branches b on b.id=ur.branch_id and b.tenant_id=ur.tenant_id
  where ur.user_id=_user_id and ur.tenant_id=_tenant_id
    and coalesce(ur.company_id,b.company_id) is not null;

  if v_has_target_owner then
    raise exception 'The tenant owner role cannot be changed' using errcode='42501';
  end if;
  if v_has_target_manager and not v_is_super and not v_is_tenant_owner then
    raise exception 'Only the tenant owner can change a manager role' using errcode='42501';
  end if;
  if v_target_company_count>1 then
    raise exception 'Target user has conflicting company role assignments' using errcode='42501';
  end if;
  if v_profile_company is not null and v_target_company_count>0
     and v_target_company is distinct from v_profile_company then
    raise exception 'Target profile and role company assignments do not match' using errcode='42501';
  end if;

  v_target_company := coalesce(v_profile_company,v_target_company);
  if v_target_company is null and v_profile_branch is not null then
    select b.company_id into v_branch_company
    from public.branches b where b.id=v_profile_branch and b.tenant_id=_tenant_id;
    v_target_company := v_branch_company;
  end if;

  if _branch_id is not null then
    select b.company_id into v_branch_company
    from public.branches b
    where b.id=_branch_id and b.tenant_id=_tenant_id and b.is_active=true;
    if not found then
      raise exception 'Branch does not belong to the requested tenant or is inactive' using errcode='23503';
    end if;
    if v_target_company is not null and v_target_company is distinct from v_branch_company then
      raise exception 'Branch belongs to another company' using errcode='42501';
    end if;
    if v_target_company is null and not v_is_super and not v_is_tenant_owner
       and v_profile_hired_by is distinct from _actor_id then
      raise exception 'You cannot assign an unowned user to another company' using errcode='42501';
    end if;
    v_target_company := v_branch_company;
  end if;

  if not v_is_super and not v_is_tenant_owner
     and v_target_company is distinct from v_actor_company then
    raise exception 'You cannot change a role outside your company' using errcode='42501';
  end if;

  delete from public.user_roles
  where user_id=_user_id and tenant_id=_tenant_id;

  insert into public.user_roles(user_id,tenant_id,role,branch_id,company_id,hired_by)
  values(_user_id,_tenant_id,_role,_branch_id,v_target_company,_actor_id);

  update public.profiles
  set branch_id=_branch_id,company_id=coalesce(v_target_company,company_id)
  where id=_user_id and tenant_id=_tenant_id;
end;
$function$;
revoke all on function public.replace_user_role_in_tenant(uuid,uuid,public.app_role,uuid,uuid) from public, anon, authenticated;
grant execute on function public.replace_user_role_in_tenant(uuid,uuid,public.app_role,uuid,uuid) to service_role;

-- A branch transfer cannot silently move an employee into a different company.
create or replace function public.transfer_user_role_branch(
  _user_role_id uuid, _tenant_id uuid, _branch_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_target_user uuid;
  v_role_company uuid;
  v_profile_company uuid;
  v_target_company uuid;
  v_branch_company uuid;
  v_updated_profiles integer;
begin
  select ur.user_id,ur.company_id
    into v_target_user,v_role_company
  from public.user_roles ur
  where ur.id=_user_role_id and ur.tenant_id=_tenant_id
  for update;
  if not found then
    raise exception 'Role assignment not found in the requested tenant' using errcode='P0002';
  end if;
  if exists (select 1 from public.super_owners so where so.user_id=v_target_user) then
    raise exception 'The platform Super Owner account is protected' using errcode='42501';
  end if;

  select p.company_id into v_profile_company
  from public.profiles p
  where p.id=v_target_user and p.tenant_id=_tenant_id
  for update;
  if not found then
    raise exception 'Target profile was not found in the requested tenant' using errcode='P0002';
  end if;

  v_target_company := coalesce(v_role_company,v_profile_company);

  if _branch_id is not null then
    select b.company_id into v_branch_company
    from public.branches b
    where b.id=_branch_id and b.tenant_id=_tenant_id and b.is_active=true;
    if not found then
      raise exception 'Branch does not belong to the requested tenant or is inactive' using errcode='23503';
    end if;
    if v_target_company is not null and v_target_company is distinct from v_branch_company then
      raise exception 'Branch transfer cannot cross company boundaries' using errcode='42501';
    end if;
    v_target_company := coalesce(v_target_company,v_branch_company);
  end if;

  update public.user_roles
  set branch_id=_branch_id,company_id=coalesce(v_target_company,company_id)
  where id=_user_role_id and tenant_id=_tenant_id;

  update public.profiles
  set branch_id=_branch_id,company_id=coalesce(v_target_company,company_id)
  where id=v_target_user and tenant_id=_tenant_id;
  get diagnostics v_updated_profiles=row_count;
  if v_updated_profiles=0 then
    raise exception 'Target profile was not found in the requested tenant' using errcode='P0002';
  end if;
end;
$function$;
revoke all on function public.transfer_user_role_branch(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.transfer_user_role_branch(uuid,uuid,uuid) to service_role;

commit;
