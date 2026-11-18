-- Let company managers see and maintain master records created by coworkers in the same company.
-- Resolve staff company membership from their explicitly assigned branch when the profile lacks company_id.
begin;

update public.profiles p
set company_id = b.company_id
from public.branches b
where b.id = p.branch_id
  and b.tenant_id = p.tenant_id
  and b.company_id is not null
  and p.company_id is null;

update public.user_roles ur
set company_id = p.company_id
from public.profiles p
where p.id = ur.user_id
  and p.tenant_id = ur.tenant_id
  and p.company_id is not null
  and ur.company_id is null;

create index if not exists user_roles_company_member_idx
  on public.user_roles (tenant_id, company_id, user_id)
  where company_id is not null;

create or replace function private.can_access_creator_company(
  _tenant_id uuid,
  _creator_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select
    (select auth.uid()) is not null
    and _creator_id is not null
    and exists (
      select 1
      from public.user_roles viewer
      join public.user_roles creator
        on creator.tenant_id = viewer.tenant_id
       and creator.company_id = viewer.company_id
      where viewer.user_id = (select auth.uid())
        and viewer.tenant_id = _tenant_id
        and viewer.company_id is not null
        and creator.user_id = _creator_id
    );
$$;

revoke all on function private.can_access_creator_company(uuid, uuid) from public, anon;
grant execute on function private.can_access_creator_company(uuid, uuid) to authenticated, service_role;

do $$
declare
  t text;
begin
  foreach t in array array['customers', 'suppliers', 'products'] loop
    execute format('drop policy if exists creator_scope_%I on public.%I', t, t);
    execute format(
      'create policy creator_scope_%I on public.%I as restrictive for select to authenticated using (
        created_by = (select auth.uid())
        or created_by is null
        or exists (select 1 from public.super_owners so where so.user_id = (select auth.uid()))
        or private.can_access_creator_company(tenant_id, created_by)
      )',
      t, t
    );

    execute format('drop policy if exists creator_update_%I on public.%I', t, t);
    execute format(
      'create policy creator_update_%I on public.%I as restrictive for update to authenticated using (
        created_by = (select auth.uid())
        or exists (select 1 from public.super_owners so where so.user_id = (select auth.uid()))
        or private.can_access_creator_company(tenant_id, created_by)
      ) with check (
        created_by = (select auth.uid())
        or exists (select 1 from public.super_owners so where so.user_id = (select auth.uid()))
        or private.can_access_creator_company(tenant_id, created_by)
      )',
      t, t
    );

    execute format('drop policy if exists creator_delete_%I on public.%I', t, t);
    execute format(
      'create policy creator_delete_%I on public.%I as restrictive for delete to authenticated using (
        created_by = (select auth.uid())
        or exists (select 1 from public.super_owners so where so.user_id = (select auth.uid()))
        or private.can_access_creator_company(tenant_id, created_by)
      )',
      t, t
    );
  end loop;
end $$;

commit;
