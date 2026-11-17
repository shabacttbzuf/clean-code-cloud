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
  assert.match(creatorScope, /private\\.can_access_creator_company/);
  assert.match(creatorScope, /viewer\\.company_id = creator\\.company_id/);
  assert.match(creatorScope, /viewer\\.user_id = \\(select auth\\.uid\\(\\)\\)/);
  assert.match(creatorScope, /creator_scope_%I/);
  assert.match(creatorScope, /creator_update_%I/);
  assert.match(creatorScope, /creator_delete_%I/);
  assert.match(creatorScope, /user_roles_company_member_idx/);
});

const operationalScope = readFileSync(new URL("../supabase/migrations/20261118000003_enforce_company_scope_across_operational_data.sql", import.meta.url), "utf8");

test("company RLS boundaries cover branch operations, HR records, financial children, profiles and audit trails", () => {
  for (const table of ["inventory", "inventory_transactions", "sales", "purchases", "cash_sessions", "expenses", "departments", "employees", "payroll_runs"]) {
    assert.match(operationalScope, new RegExp("company_boundary_" + table + "_select"));
  }
  for (const helper of ["can_access_employee_record", "can_access_payroll_run_record", "can_access_sale_record", "can_access_purchase_record", "can_access_purchase_return_record", "can_access_sale_refund_record"]) {
    assert.match(operationalScope, new RegExp(helper));
  }
  for (const table of ["attendance", "bonuses", "deductions", "leave_requests", "payroll_items", "profiles", "user_roles", "audit_logs", "login_history"]) {
    assert.match(operationalScope, new RegExp("company_boundary_" + table + "_select"));
  }
});
