-- Bind SECURITY DEFINER authorization helpers to the authenticated actor and
-- ensure tenant owners can access/manage branches across their companies.
begin;

create or replace function private.can_access_branch(_user_id uuid,_tenant_id uuid,_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select _user_id=(select auth.uid())
    and (
      exists (
        select 1 from public.super_owners so where so.user_id=_user_id
      )
      or exists (
        select 1 from public.user_roles tenant_owner
        where tenant_owner.user_id=_user_id
          and tenant_owner.tenant_id=_tenant_id
          and tenant_owner.role='owner'
          and tenant_owner.company_id is null
      )
      or exists (
        select 1
        from public.user_roles ur
        join public.branches b on b.id=_branch_id and b.tenant_id=_tenant_id
        where ur.user_id=_user_id and ur.tenant_id=_tenant_id
          and (
            (ur.role in ('owner','manager','accountant')
             and (
               (ur.company_id is not null and b.company_id=ur.company_id)
               or (ur.company_id is null and b.company_id is null)
             ))
            or (ur.branch_id=_branch_id and (ur.company_id is null or b.company_id=ur.company_id))
          )
      )
    );
$function$;
revoke all on function private.can_access_branch(uuid,uuid,uuid) from public, anon;
grant execute on function private.can_access_branch(uuid,uuid,uuid) to authenticated, service_role;

create or replace function private.can_manage_expenses(_user_id uuid,_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select _user_id=(select auth.uid())
    and exists (
      select 1 from public.user_roles
      where user_id=_user_id and tenant_id=_tenant_id
        and role in ('owner','manager','accountant')
    );
$function$;
revoke all on function private.can_manage_expenses(uuid,uuid) from public, anon;
grant execute on function private.can_manage_expenses(uuid,uuid) to authenticated, service_role;

create or replace function private.has_role(_user_id uuid,_tenant_id uuid,_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select _user_id=(select auth.uid())
    and exists (
      select 1 from public.user_roles
      where user_id=_user_id and tenant_id=_tenant_id and role=_role
    );
$function$;
revoke all on function private.has_role(uuid,uuid,public.app_role) from public, anon;
grant execute on function private.has_role(uuid,uuid,public.app_role) to authenticated, service_role;

create or replace function private.is_tenant_admin(_user_id uuid,_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select _user_id=(select auth.uid())
    and (
      exists (select 1 from public.super_owners so where so.user_id=_user_id)
      or exists (
        select 1 from public.user_roles ur
        where ur.user_id=_user_id and ur.tenant_id=_tenant_id
          and ur.role in ('owner','manager')
      )
    );
$function$;
revoke all on function private.is_tenant_admin(uuid,uuid) from public, anon;
grant execute on function private.is_tenant_admin(uuid,uuid) to authenticated, service_role;

create or replace function private.is_tenant_member(_user_id uuid,_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select _user_id=(select auth.uid())
    and exists (
      select 1 from public.user_roles
      where user_id=_user_id and tenant_id=_tenant_id
    );
$function$;
revoke all on function private.is_tenant_member(uuid,uuid) from public, anon;
grant execute on function private.is_tenant_member(uuid,uuid) to authenticated, service_role;

create or replace function private.user_branch_id(_user_id uuid,_tenant_id uuid)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select case when _user_id=(select auth.uid()) then (
    select branch_id from public.user_roles
    where user_id=_user_id and tenant_id=_tenant_id
    limit 1
  ) else null end;
$function$;
revoke all on function private.user_branch_id(uuid,uuid) from public, anon;
grant execute on function private.user_branch_id(uuid,uuid) to authenticated, service_role;

create or replace function private.user_has_role_in_tenant(_user_id uuid,_tenant_id uuid,_roles text[])
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select _user_id=(select auth.uid())
    and exists (
      select 1 from public.user_roles
      where user_id=_user_id and tenant_id=_tenant_id
        and role::text=any(_roles)
    );
$function$;
revoke all on function private.user_has_role_in_tenant(uuid,uuid,text[]) from public, anon;
grant execute on function private.user_has_role_in_tenant(uuid,uuid,text[]) to authenticated, service_role;

create or replace function private.was_hired_by(_target uuid,_actor uuid,_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select _actor=(select auth.uid())
    and exists (
      select 1 from public.user_roles
      where user_id=_target and tenant_id=_tenant_id and hired_by=_actor
    );
$function$;
revoke all on function private.was_hired_by(uuid,uuid,uuid) from public, anon;
grant execute on function private.was_hired_by(uuid,uuid,uuid) to authenticated, service_role;

-- Tenant owners have tenant-wide branch administration. Company owners/managers
-- remain limited to branches belonging to their assigned company.
drop policy if exists company_scope_branches_insert on public.branches;
create policy company_scope_branches_insert on public.branches
as restrictive for insert to authenticated
with check (
  public.is_super_owner((select auth.uid()))
  or private.is_tenant_owner_user((select auth.uid()),tenant_id)
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid())
      and ur.tenant_id=branches.tenant_id
      and ur.company_id=branches.company_id
      and ur.role in ('owner','manager')
  )
);

drop policy if exists company_scope_branches_update on public.branches;
create policy company_scope_branches_update on public.branches
as restrictive for update to authenticated
using (
  private.can_access_branch((select auth.uid()),tenant_id,id)
)
with check (
  public.is_super_owner((select auth.uid()))
  or private.is_tenant_owner_user((select auth.uid()),tenant_id)
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id=(select auth.uid())
      and ur.tenant_id=branches.tenant_id
      and ur.company_id=branches.company_id
      and ur.role in ('owner','manager')
  )
);


-- Trigger functions are invoked by PostgreSQL triggers, not by client RPCs.
-- Remove unnecessary direct EXECUTE grants from all API roles.
revoke all on function private.enforce_inventory_reference_tenant() from public, anon, authenticated, service_role;
revoke all on function private.enforce_notification_audience_tenant() from public, anon, authenticated, service_role;
revoke all on function private.enforce_notification_read_tenant() from public, anon, authenticated, service_role;
revoke all on function private.enforce_same_tenant_foreign_key() from public, anon, authenticated, service_role;
revoke all on function private.enforce_tenant_user_membership() from public, anon, authenticated, service_role;
revoke all on function private.prevent_cash_refund_overdraw() from public, anon, authenticated, service_role;

commit;
