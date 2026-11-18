-- Enforce company boundaries across operational, HR, finance, and audit data.
-- Every branch-bound row must belong to a branch the signed-in user can access.
begin;

create or replace function private.is_company_member(_tenant_id uuid, _company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select (select auth.uid()) is not null
    and _company_id is not null
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = (select auth.uid())
        and ur.tenant_id = _tenant_id
        and ur.company_id = _company_id
    );
$$;

create or replace function private.can_access_employee_record(_tenant_id uuid, _employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.employees e
      where e.id = _employee_id
        and e.tenant_id = _tenant_id
        and (
          e.user_id = (select auth.uid())
          or public.is_super_owner((select auth.uid()))
          or (e.branch_id is not null and private.can_access_branch((select auth.uid()), e.tenant_id, e.branch_id))
          or (e.branch_id is null and private.can_access_creator_company(e.tenant_id, e.created_by))
        )
    );
$$;

create or replace function private.can_access_payroll_run_record(_tenant_id uuid, _run_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.payroll_runs pr
      where pr.id = _run_id
        and pr.tenant_id = _tenant_id
        and (
          public.is_super_owner((select auth.uid()))
          or (pr.branch_id is not null and private.can_access_branch((select auth.uid()), pr.tenant_id, pr.branch_id))
          or (pr.branch_id is null and private.can_access_creator_company(pr.tenant_id, pr.created_by))
        )
    );
$$;

create or replace function private.can_access_sale_record(_tenant_id uuid, _sale_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.sales s
      where s.id = _sale_id and s.tenant_id = _tenant_id
        and private.can_access_branch((select auth.uid()), s.tenant_id, s.branch_id)
    );
$$;

create or replace function private.can_access_purchase_record(_tenant_id uuid, _purchase_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.purchases p
      where p.id = _purchase_id and p.tenant_id = _tenant_id
        and private.can_access_branch((select auth.uid()), p.tenant_id, p.branch_id)
    );
$$;

create or replace function private.can_access_purchase_return_record(_tenant_id uuid, _return_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.purchase_returns pr
      where pr.id = _return_id and pr.tenant_id = _tenant_id
        and private.can_access_branch((select auth.uid()), pr.tenant_id, pr.branch_id)
    );
$$;

create or replace function private.can_access_sale_refund_record(_tenant_id uuid, _refund_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.sale_refunds r
      where r.id = _refund_id and r.tenant_id = _tenant_id
        and private.can_access_branch((select auth.uid()), r.tenant_id, r.branch_id)
    );
$$;

revoke all on function private.is_company_member(uuid, uuid) from public, anon;
revoke all on function private.can_access_employee_record(uuid, uuid) from public, anon;
revoke all on function private.can_access_payroll_run_record(uuid, uuid) from public, anon;
revoke all on function private.can_access_sale_record(uuid, uuid) from public, anon;
revoke all on function private.can_access_purchase_record(uuid, uuid) from public, anon;
revoke all on function private.can_access_purchase_return_record(uuid, uuid) from public, anon;
revoke all on function private.can_access_sale_refund_record(uuid, uuid) from public, anon;
grant execute on function private.is_company_member(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_access_employee_record(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_access_payroll_run_record(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_access_sale_record(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_access_purchase_record(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_access_purchase_return_record(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_access_sale_refund_record(uuid, uuid) to authenticated, service_role;

-- Tables with a required branch_id.
do $$
declare
  t text;
begin
  foreach t in array array[
    'cash_sessions',
    'customer_payments',
    'inventory',
    'inventory_transactions',
    'purchase_returns',
    'purchases',
    'sale_refunds',
    'sales',
    'supplier_payments'
  ] loop
    execute format('drop policy if exists company_boundary_%I_select on public.%I', t, t);
    execute format('create policy company_boundary_%I_select on public.%I as restrictive for select to authenticated using (private.can_access_branch((select auth.uid()), tenant_id, branch_id))', t, t);

    execute format('drop policy if exists company_boundary_%I_insert on public.%I', t, t);
    execute format('create policy company_boundary_%I_insert on public.%I as restrictive for insert to authenticated with check (private.can_access_branch((select auth.uid()), tenant_id, branch_id))', t, t);

    execute format('drop policy if exists company_boundary_%I_update on public.%I', t, t);
    execute format('create policy company_boundary_%I_update on public.%I as restrictive for update to authenticated using (private.can_access_branch((select auth.uid()), tenant_id, branch_id)) with check (private.can_access_branch((select auth.uid()), tenant_id, branch_id))', t, t);

    execute format('drop policy if exists company_boundary_%I_delete on public.%I', t, t);
    execute format('create policy company_boundary_%I_delete on public.%I as restrictive for delete to authenticated using (private.can_access_branch((select auth.uid()), tenant_id, branch_id))', t, t);
  end loop;
end $$;

-- Tables whose branch is nullable or which also carry a company identifier.
drop policy if exists company_boundary_departments_select on public.departments;
create policy company_boundary_departments_select on public.departments as restrictive for select to authenticated
using (
  private.can_access_branch((select auth.uid()), tenant_id, branch_id)
  or private.is_company_member(tenant_id, company_id)
  or public.is_super_owner((select auth.uid()))
);
drop policy if exists company_boundary_departments_insert on public.departments;
create policy company_boundary_departments_insert on public.departments as restrictive for insert to authenticated
with check (
  private.can_access_branch((select auth.uid()), tenant_id, branch_id)
  or private.is_company_member(tenant_id, company_id)
  or public.is_super_owner((select auth.uid()))
);
drop policy if exists company_boundary_departments_update on public.departments;
create policy company_boundary_departments_update on public.departments as restrictive for update to authenticated
using (
  private.can_access_branch((select auth.uid()), tenant_id, branch_id)
  or private.is_company_member(tenant_id, company_id)
  or public.is_super_owner((select auth.uid()))
)
with check (
  private.can_access_branch((select auth.uid()), tenant_id, branch_id)
  or private.is_company_member(tenant_id, company_id)
  or public.is_super_owner((select auth.uid()))
);
drop policy if exists company_boundary_departments_delete on public.departments;
create policy company_boundary_departments_delete on public.departments as restrictive for delete to authenticated
using (
  private.can_access_branch((select auth.uid()), tenant_id, branch_id)
  or private.is_company_member(tenant_id, company_id)
  or public.is_super_owner((select auth.uid()))
);

drop policy if exists company_boundary_employees_select on public.employees;
create policy company_boundary_employees_select on public.employees as restrictive for select to authenticated
using (
  user_id = (select auth.uid())
  or (branch_id is not null and private.can_access_branch((select auth.uid()), tenant_id, branch_id))
  or (branch_id is null and private.can_access_creator_company(tenant_id, created_by))
  or public.is_super_owner((select auth.uid()))
);
drop policy if exists company_boundary_employees_insert on public.employees;
create policy company_boundary_employees_insert on public.employees as restrictive for insert to authenticated
with check (
  (branch_id is not null and private.can_access_branch((select auth.uid()), tenant_id, branch_id))
  or (branch_id is null and private.can_access_creator_company(tenant_id, created_by))
  or public.is_super_owner((select auth.uid()))
);
drop policy if exists company_boundary_employees_update on public.employees;
create policy company_boundary_employees_update on public.employees as restrictive for update to authenticated
using (
  user_id = (select auth.uid())
  or (branch_id is not null and private.can_access_branch((select auth.uid()), tenant_id, branch_id))
  or (branch_id is null and private.can_access_creator_company(tenant_id, created_by))
  or public.is_super_owner((select auth.uid()))
)
with check (
  user_id = (select auth.uid())
  or (branch_id is not null and private.can_access_branch((select auth.uid()), tenant_id, branch_id))
  or (branch_id is null and private.can_access_creator_company(tenant_id, created_by))
  or public.is_super_owner((select auth.uid()))
);
drop policy if exists company_boundary_employees_delete on public.employees;
create policy company_boundary_employees_delete on public.employees as restrictive for delete to authenticated
using (
  (branch_id is not null and private.can_access_branch((select auth.uid()), tenant_id, branch_id))
  or (branch_id is null and private.can_access_creator_company(tenant_id, created_by))
  or public.is_super_owner((select auth.uid()))
);

drop policy if exists company_boundary_expenses_select on public.expenses;
create policy company_boundary_expenses_select on public.expenses as restrictive for select to authenticated
using (
  (branch_id is not null and private.can_access_branch((select auth.uid()), tenant_id, branch_id))
  or (branch_id is null and private.can_access_creator_company(tenant_id, user_id))
  or public.is_super_owner((select auth.uid()))
);
drop policy if exists company_boundary_expenses_insert on public.expenses;
create policy company_boundary_expenses_insert on public.expenses as restrictive for insert to authenticated
with check (
  (branch_id is not null and private.can_access_branch((select auth.uid()), tenant_id, branch_id))
  or (branch_id is null and private.can_access_creator_company(tenant_id, user_id))
  or public.is_super_owner((select auth.uid()))
);
drop policy if exists company_boundary_expenses_update on public.expenses;
create policy company_boundary_expenses_update on public.expenses as restrictive for update to authenticated
using (
  (branch_id is not null and private.can_access_branch((select auth.uid()), tenant_id, branch_id))
  or (branch_id is null and private.can_access_creator_company(tenant_id, user_id))
  or public.is_super_owner((select auth.uid()))
)
with check (
  (branch_id is not null and private.can_access_branch((select auth.uid()), tenant_id, branch_id))
  or (branch_id is null and private.can_access_creator_company(tenant_id, user_id))
  or public.is_super_owner((select auth.uid()))
);
drop policy if exists company_boundary_expenses_delete on public.expenses;
create policy company_boundary_expenses_delete on public.expenses as restrictive for delete to authenticated
using (
  (branch_id is not null and private.can_access_branch((select auth.uid()), tenant_id, branch_id))
  or (branch_id is null and private.can_access_creator_company(tenant_id, user_id))
  or public.is_super_owner((select auth.uid()))
);

drop policy if exists company_boundary_payroll_runs_select on public.payroll_runs;
create policy company_boundary_payroll_runs_select on public.payroll_runs as restrictive for select to authenticated
using (
  (branch_id is not null and private.can_access_branch((select auth.uid()), tenant_id, branch_id))
  or (branch_id is null and private.can_access_creator_company(tenant_id, created_by))
  or public.is_super_owner((select auth.uid()))
);
drop policy if exists company_boundary_payroll_runs_insert on public.payroll_runs;
create policy company_boundary_payroll_runs_insert on public.payroll_runs as restrictive for insert to authenticated
with check (
  (branch_id is not null and private.can_access_branch((select auth.uid()), tenant_id, branch_id))
  or (branch_id is null and private.can_access_creator_company(tenant_id, created_by))
  or public.is_super_owner((select auth.uid()))
);
drop policy if exists company_boundary_payroll_runs_update on public.payroll_runs;
create policy company_boundary_payroll_runs_update on public.payroll_runs as restrictive for update to authenticated
using (
  (branch_id is not null and private.can_access_branch((select auth.uid()), tenant_id, branch_id))
  or (branch_id is null and private.can_access_creator_company(tenant_id, created_by))
  or public.is_super_owner((select auth.uid()))
)
with check (
  (branch_id is not null and private.can_access_branch((select auth.uid()), tenant_id, branch_id))
  or (branch_id is null and private.can_access_creator_company(tenant_id, created_by))
  or public.is_super_owner((select auth.uid()))
);
drop policy if exists company_boundary_payroll_runs_delete on public.payroll_runs;
create policy company_boundary_payroll_runs_delete on public.payroll_runs as restrictive for delete to authenticated
using (
  (branch_id is not null and private.can_access_branch((select auth.uid()), tenant_id, branch_id))
  or (branch_id is null and private.can_access_creator_company(tenant_id, created_by))
  or public.is_super_owner((select auth.uid()))
);

-- HR records inherit the employee's company through the employee's branch.
do $$
declare
  t text;
begin
  foreach t in array array['attendance', 'bonuses', 'deductions', 'leave_requests'] loop
    execute format('drop policy if exists company_boundary_%I_select on public.%I', t, t);
    execute format('create policy company_boundary_%I_select on public.%I as restrictive for select to authenticated using (private.can_access_employee_record(tenant_id, employee_id))', t, t);

    execute format('drop policy if exists company_boundary_%I_insert on public.%I', t, t);
    execute format('create policy company_boundary_%I_insert on public.%I as restrictive for insert to authenticated with check (private.can_access_employee_record(tenant_id, employee_id))', t, t);

    execute format('drop policy if exists company_boundary_%I_update on public.%I', t, t);
    execute format('create policy company_boundary_%I_update on public.%I as restrictive for update to authenticated using (private.can_access_employee_record(tenant_id, employee_id)) with check (private.can_access_employee_record(tenant_id, employee_id))', t, t);

    execute format('drop policy if exists company_boundary_%I_delete on public.%I', t, t);
    execute format('create policy company_boundary_%I_delete on public.%I as restrictive for delete to authenticated using (private.can_access_employee_record(tenant_id, employee_id))', t, t);
  end loop;
end $$;

drop policy if exists company_boundary_payroll_items_select on public.payroll_items;
create policy company_boundary_payroll_items_select on public.payroll_items as restrictive for select to authenticated
using (
  private.can_access_employee_record(tenant_id, employee_id)
  or private.can_access_payroll_run_record(tenant_id, payroll_run_id)
);
drop policy if exists company_boundary_payroll_items_insert on public.payroll_items;
create policy company_boundary_payroll_items_insert on public.payroll_items as restrictive for insert to authenticated
with check (
  private.can_access_employee_record(tenant_id, employee_id)
  or private.can_access_payroll_run_record(tenant_id, payroll_run_id)
);
drop policy if exists company_boundary_payroll_items_update on public.payroll_items;
create policy company_boundary_payroll_items_update on public.payroll_items as restrictive for update to authenticated
using (
  private.can_access_employee_record(tenant_id, employee_id)
  or private.can_access_payroll_run_record(tenant_id, payroll_run_id)
)
with check (
  private.can_access_employee_record(tenant_id, employee_id)
  or private.can_access_payroll_run_record(tenant_id, payroll_run_id)
);
drop policy if exists company_boundary_payroll_items_delete on public.payroll_items;
create policy company_boundary_payroll_items_delete on public.payroll_items as restrictive for delete to authenticated
using (
  private.can_access_employee_record(tenant_id, employee_id)
  or private.can_access_payroll_run_record(tenant_id, payroll_run_id)
);

-- Child rows inherit the company boundary of their parent transaction.
do $$
declare
  t text;
  fn text;
  parent_col text;
begin
  for t, fn, parent_col in
    select * from (values
      ('payments', 'private.can_access_sale_record', 'sale_id'),
      ('sale_items', 'private.can_access_sale_record', 'sale_id'),
      ('purchase_items', 'private.can_access_purchase_record', 'purchase_id'),
      ('purchase_return_items', 'private.can_access_purchase_return_record', 'purchase_return_id'),
      ('sale_refund_items', 'private.can_access_sale_refund_record', 'refund_id')
    ) as x(table_name, helper, parent_column)
  loop
    execute format('drop policy if exists company_boundary_%I_select on public.%I', t, t);
    execute format('create policy company_boundary_%I_select on public.%I as restrictive for select to authenticated using (%s(tenant_id, %I))', t, t, fn, parent_col);

    execute format('drop policy if exists company_boundary_%I_insert on public.%I', t, t);
    execute format('create policy company_boundary_%I_insert on public.%I as restrictive for insert to authenticated with check (%s(tenant_id, %I))', t, t, fn, parent_col);

    execute format('drop policy if exists company_boundary_%I_update on public.%I', t, t);
    execute format('create policy company_boundary_%I_update on public.%I as restrictive for update to authenticated using (%s(tenant_id, %I)) with check (%s(tenant_id, %I))', t, t, fn, parent_col, fn, parent_col);

    execute format('drop policy if exists company_boundary_%I_delete on public.%I', t, t);
    execute format('create policy company_boundary_%I_delete on public.%I as restrictive for delete to authenticated using (%s(tenant_id, %I))', t, t, fn, parent_col);
  end loop;
end $$;

-- Company membership also bounds access to staff profiles, role memberships, audit logs, and login history.
drop policy if exists company_boundary_profiles_select on public.profiles;
create policy company_boundary_profiles_select on public.profiles as restrictive for select to authenticated
using (
  id = (select auth.uid())
  or private.can_access_creator_company(tenant_id, id)
  or public.is_super_owner((select auth.uid()))
);
drop policy if exists company_boundary_profiles_update on public.profiles;
create policy company_boundary_profiles_update on public.profiles as restrictive for update to authenticated
using (
  id = (select auth.uid())
  or private.can_access_creator_company(tenant_id, id)
  or public.is_super_owner((select auth.uid()))
)
with check (
  id = (select auth.uid())
  or private.can_access_creator_company(tenant_id, id)
  or public.is_super_owner((select auth.uid()))
);

drop policy if exists company_boundary_user_roles_select on public.user_roles;
create policy company_boundary_user_roles_select on public.user_roles as restrictive for select to authenticated
using (
  user_id = (select auth.uid())
  or private.can_access_creator_company(tenant_id, user_id)
  or public.is_super_owner((select auth.uid()))
);

drop policy if exists company_boundary_audit_logs_select on public.audit_logs;
create policy company_boundary_audit_logs_select on public.audit_logs as restrictive for select to authenticated
using (
  public.is_super_owner((select auth.uid()))
  or private.can_access_creator_company(tenant_id, user_id)
);

drop policy if exists company_boundary_login_history_select on public.login_history;
create policy company_boundary_login_history_select on public.login_history as restrictive for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_super_owner((select auth.uid()))
  or private.can_access_creator_company(tenant_id, user_id)
);

drop policy if exists company_boundary_user_permission_overrides_select on public.user_permission_overrides;
create policy company_boundary_user_permission_overrides_select on public.user_permission_overrides as restrictive for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_super_owner((select auth.uid()))
  or private.can_access_creator_company(tenant_id, user_id)
);

commit;
