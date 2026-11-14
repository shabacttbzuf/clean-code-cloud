-- Complete company boundary enforcement for companies and branches.
begin;

-- Existing manager profiles already carry an authoritative company_id.
-- Copy it to their role memberships and to branches they explicitly manage.
alter table public.branches disable trigger branches_validate_company;
update public.branches b
set company_id=p.company_id
from public.profiles p
where p.id=b.manager_id and p.tenant_id=b.tenant_id
  and p.company_id is not null and b.company_id is null;
alter table public.branches enable trigger branches_validate_company;

update public.user_roles ur
set company_id=p.company_id
from public.profiles p
where p.id=ur.user_id and p.tenant_id=ur.tenant_id
  and p.company_id is not null and ur.company_id is null;

-- Branch visibility and mutation are restricted to the assigned company.
drop policy if exists company_scope_branches_select on public.branches;
create policy company_scope_branches_select on public.branches
as restrictive for select to authenticated
using (private.can_access_branch((select auth.uid()),tenant_id,id));

drop policy if exists company_scope_branches_insert on public.branches;
create policy company_scope_branches_insert on public.branches
as restrictive for insert to authenticated
with check (
  exists(select 1 from public.super_owners so where so.user_id=(select auth.uid()))
  or exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
    and ur.tenant_id=branches.tenant_id and ur.company_id=branches.company_id
    and ur.role in ('owner','manager'))
);

drop policy if exists company_scope_branches_update on public.branches;
create policy company_scope_branches_update on public.branches
as restrictive for update to authenticated
using (private.can_access_branch((select auth.uid()),tenant_id,id))
with check (
  exists(select 1 from public.super_owners so where so.user_id=(select auth.uid()))
  or exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
    and ur.tenant_id=branches.tenant_id and ur.company_id=branches.company_id
    and ur.role in ('owner','manager'))
);

drop policy if exists company_scope_branches_delete on public.branches;
create policy company_scope_branches_delete on public.branches
as restrictive for delete to authenticated
using (private.can_access_branch((select auth.uid()),tenant_id,id));

-- Company records are visible only to their assigned company members and the platform owner.
drop policy if exists company_scope_companies_select on public.companies;
create policy company_scope_companies_select on public.companies
as restrictive for select to authenticated
using (
  exists(select 1 from public.super_owners so where so.user_id=(select auth.uid()))
  or exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
    and ur.tenant_id=companies.tenant_id
    and (ur.company_id=companies.id or (ur.company_id is null and ur.role='owner')))
);

drop policy if exists company_scope_companies_insert on public.companies;
create policy company_scope_companies_insert on public.companies
as restrictive for insert to authenticated
with check (
  exists(select 1 from public.super_owners so where so.user_id=(select auth.uid()))
  or exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
    and ur.tenant_id=companies.tenant_id and ur.company_id is null and ur.role='owner')
);

drop policy if exists company_scope_companies_update on public.companies;
create policy company_scope_companies_update on public.companies
as restrictive for update to authenticated
using (
  exists(select 1 from public.super_owners so where so.user_id=(select auth.uid()))
  or exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
    and ur.tenant_id=companies.tenant_id
    and (ur.company_id=companies.id or (ur.company_id is null and ur.role='owner')))
)
with check (
  exists(select 1 from public.super_owners so where so.user_id=(select auth.uid()))
  or exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
    and ur.tenant_id=companies.tenant_id
    and (ur.company_id=companies.id or (ur.company_id is null and ur.role='owner')))
);

drop policy if exists company_scope_companies_delete on public.companies;
create policy company_scope_companies_delete on public.companies
as restrictive for delete to authenticated
using (
  exists(select 1 from public.super_owners so where so.user_id=(select auth.uid()))
  or exists(select 1 from public.user_roles ur where ur.user_id=(select auth.uid())
    and ur.tenant_id=companies.tenant_id
    and (ur.company_id=companies.id or (ur.company_id is null and ur.role='owner')))
);

commit;
