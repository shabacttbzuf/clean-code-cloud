-- Tighten compound company references: every populated scope must match the signed-in user's company.
begin;

drop policy if exists company_boundary_departments_select on public.departments;
create policy company_boundary_departments_select on public.departments as restrictive for select to authenticated
using (
  (
    (branch_id is null or private.can_access_branch((select auth.uid()), tenant_id, branch_id))
    and (company_id is null or private.is_company_member(tenant_id, company_id))
    and (branch_id is not null or company_id is not null)
  )
  or public.is_super_owner((select auth.uid()))
);

drop policy if exists company_boundary_departments_insert on public.departments;
create policy company_boundary_departments_insert on public.departments as restrictive for insert to authenticated
with check (
  (
    (branch_id is null or private.can_access_branch((select auth.uid()), tenant_id, branch_id))
    and (company_id is null or private.is_company_member(tenant_id, company_id))
    and (branch_id is not null or company_id is not null)
  )
  or public.is_super_owner((select auth.uid()))
);

drop policy if exists company_boundary_departments_update on public.departments;
create policy company_boundary_departments_update on public.departments as restrictive for update to authenticated
using (
  (
    (branch_id is null or private.can_access_branch((select auth.uid()), tenant_id, branch_id))
    and (company_id is null or private.is_company_member(tenant_id, company_id))
    and (branch_id is not null or company_id is not null)
  )
  or public.is_super_owner((select auth.uid()))
)
with check (
  (
    (branch_id is null or private.can_access_branch((select auth.uid()), tenant_id, branch_id))
    and (company_id is null or private.is_company_member(tenant_id, company_id))
    and (branch_id is not null or company_id is not null)
  )
  or public.is_super_owner((select auth.uid()))
);

drop policy if exists company_boundary_departments_delete on public.departments;
create policy company_boundary_departments_delete on public.departments as restrictive for delete to authenticated
using (
  (
    (branch_id is null or private.can_access_branch((select auth.uid()), tenant_id, branch_id))
    and (company_id is null or private.is_company_member(tenant_id, company_id))
    and (branch_id is not null or company_id is not null)
  )
  or public.is_super_owner((select auth.uid()))
);

drop policy if exists company_boundary_payroll_items_select on public.payroll_items;
create policy company_boundary_payroll_items_select on public.payroll_items as restrictive for select to authenticated
using (
  private.can_access_employee_record(tenant_id, employee_id)
  and private.can_access_payroll_run_record(tenant_id, payroll_run_id)
);

drop policy if exists company_boundary_payroll_items_insert on public.payroll_items;
create policy company_boundary_payroll_items_insert on public.payroll_items as restrictive for insert to authenticated
with check (
  private.can_access_employee_record(tenant_id, employee_id)
  and private.can_access_payroll_run_record(tenant_id, payroll_run_id)
);

drop policy if exists company_boundary_payroll_items_update on public.payroll_items;
create policy company_boundary_payroll_items_update on public.payroll_items as restrictive for update to authenticated
using (
  private.can_access_employee_record(tenant_id, employee_id)
  and private.can_access_payroll_run_record(tenant_id, payroll_run_id)
)
with check (
  private.can_access_employee_record(tenant_id, employee_id)
  and private.can_access_payroll_run_record(tenant_id, payroll_run_id)
);

drop policy if exists company_boundary_payroll_items_delete on public.payroll_items;
create policy company_boundary_payroll_items_delete on public.payroll_items as restrictive for delete to authenticated
using (
  private.can_access_employee_record(tenant_id, employee_id)
  and private.can_access_payroll_run_record(tenant_id, payroll_run_id)
);

commit;
