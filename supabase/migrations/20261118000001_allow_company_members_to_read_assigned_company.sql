-- Allow a company manager to read only the company assigned to their membership.
-- Super owners retain global visibility; unassigned tenant owners retain tenant company visibility.
begin;

drop policy if exists permission_gate_companies_select on public.companies;
create policy permission_gate_companies_select on public.companies
as restrictive for select to authenticated
using (
  public.is_super_owner((select auth.uid()))
  or has_permission((select auth.uid()), tenant_id, 'companies.view')
  or exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.tenant_id = companies.tenant_id
      and ur.company_id = companies.id
      and ur.role in ('owner', 'manager')
  )
  or exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.tenant_id = companies.tenant_id
      and ur.company_id is null
      and ur.role = 'owner'
  )
);

commit;
