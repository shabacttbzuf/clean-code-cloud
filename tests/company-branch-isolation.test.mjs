import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261115000005_company_branch_creator_isolation.sql", import.meta.url), "utf8");
const companyRls = readFileSync(new URL("../supabase/migrations/20261115000006_enforce_company_branch_rls.sql", import.meta.url), "utf8");
const branches = readFileSync(new URL("../src/routes/_authenticated/branches.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/hooks/use-active-tenant.ts", import.meta.url), "utf8");

test("branches require a tenant-consistent company and preserve legacy records", () => {
  assert.match(migration, /branches_company_id_fkey/);
  assert.match(migration, /Select the company that owns this branch/);
  assert.match(migration, /having count\(\*\) = 1/);
});

test("branch and company RLS is company-aware while preserving platform-owner access", () => {
  assert.match(migration, /private\.can_access_branch/);
  assert.match(companyRls, /company_scope_branches_select/);
  assert.match(companyRls, /company_scope_companies_select/);
  assert.match(companyRls, /public\.super_owners/);
});

test("branch creation UI submits the selected company", () => {
  assert.match(branches, /الشركة التابعة للفرع/);
  assert.match(branches, /company_id: companyId/);
  assert.match(hook, /company_id, custom_role_id/);
});

const cashScope = readFileSync(new URL("../supabase/migrations/20261115000007_scope_cash_sessions_to_company.sql", import.meta.url), "utf8");

test("cash session writes and closes cannot cross company branches", () => {
  assert.match(cashScope, /company_scope_cash_sessions_insert/);
  assert.match(cashScope, /company_scope_cash_sessions_update/);
  assert.match(cashScope, /company_scope_cash_sessions_delete/);
  assert.match(cashScope, /private\.can_access_branch/);
});

const creatorScope = readFileSync(new URL("../supabase/migrations/20261118000002_company_creator_visibility_for_master_data.sql", import.meta.url), "utf8");

test("company managers can access coworkers' master records only through shared company membership", () => {
  assert.match(creatorScope, /private\.can_access_creator_company/);
  assert.match(creatorScope, /viewer\.company_id = creator\.company_id/);
  assert.match(creatorScope, /viewer\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(creatorScope, /creator_scope_%I/);
  assert.match(creatorScope, /creator_update_%I/);
  assert.match(creatorScope, /creator_delete_%I/);
  assert.match(creatorScope, /user_roles_company_member_idx/);
});

const operationalScope = readFileSync(new URL("../supabase/migrations/20261118000003_enforce_company_scope_across_operational_data.sql", import.meta.url), "utf8");

test("company RLS boundaries cover branch operations, HR records, financial children, profiles and audit trails", () => {
  assert.match(operationalScope, /create policy company_boundary_%I_select/);
  assert.match(operationalScope, /array\[\s*'cash_sessions'/);
  assert.match(operationalScope, /array\['attendance','bonuses','deductions','leave_requests'\]/);
  for (const helper of ["can_access_employee_record", "can_access_payroll_run_record", "can_access_sale_record", "can_access_purchase_record", "can_access_purchase_return_record", "can_access_sale_refund_record"]) {
    assert.match(operationalScope, new RegExp(helper));
  }
  for (const policy of ["company_boundary_departments_select", "company_boundary_employees_select", "company_boundary_expenses_select", "company_boundary_payroll_runs_select", "company_boundary_payroll_items_select", "company_boundary_profiles_select", "company_boundary_user_roles_select", "company_boundary_audit_logs_select", "company_boundary_login_history_select"]) {
    assert.match(operationalScope, new RegExp(policy));
  }
});

const compoundScope = readFileSync(new URL("../supabase/migrations/20261118000004_tighten_company_compound_scope_checks.sql", import.meta.url), "utf8");

test("compound department and payroll references must remain in the same company", () => {
  assert.match(compoundScope, /branch_id is null or private\\.can_access_branch/);
  assert.match(compoundScope, /company_id is null or private\\.is_company_member/);
  assert.match(compoundScope, /private\\.can_access_employee_record\\(tenant_id, employee_id\\)\\s+and private\\.can_access_payroll_run_record/);
});
