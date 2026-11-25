import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261125030000_section_crud_permissions.sql", import.meta.url), "utf8");
const purchaseRpc = readFileSync(new URL("../supabase/migrations/20261125040000_purchase_rpc_action_permissions.sql", import.meta.url), "utf8");
const purchaseReturnRpc = readFileSync(new URL("../supabase/migrations/20261125050000_purchase_return_rpc_action_permission.sql", import.meta.url), "utf8");
const historyReadMigration = readFileSync(new URL("../supabase/migrations/20261125060000_audit_history_permission_reads.sql", import.meta.url), "utf8");
const snapshot = readFileSync(new URL("../supabase/COMPLETE_DATABASE.sql", import.meta.url), "utf8");

const source = (path) => readFileSync(new URL("../src/routes/_authenticated/" + path, import.meta.url), "utf8");

test("CRUD permissions are catalogued for operational and HR sections", () => {
  for (const key of [
    "categories.create","categories.edit","categories.delete",
    "customers.create","customers.edit","customers.delete",
    "expenses.create","expenses.edit","expenses.delete",
    "expense_categories.create","expense_categories.edit","expense_categories.delete",
    "suppliers.create","suppliers.edit","suppliers.delete",
    "departments.create","departments.edit","departments.delete",
    "job_titles.create","job_titles.edit","job_titles.delete",
    "employment_types.create","employment_types.edit","employment_types.delete",
    "companies.create","companies.edit","companies.delete",
    "hr.employees.create","hr.employees.edit","hr.employees.delete",
    "hr.attendance.create","hr.attendance.edit","hr.attendance.delete",
    "hr.compensation.create","hr.compensation.edit","hr.compensation.delete",
    "hr.leaves.create","hr.leaves.edit","hr.leaves.delete",
    "purchases.returns.create","purchases.returns.edit","purchases.returns.delete"
  ]) assert.ok(migration.includes("'" + key + "'"), "missing permission " + key);
});

test("legacy manage grants are copied without revoking existing role grants", () => {
  assert.ok(migration.includes("ON CONFLICT DO NOTHING"));
  assert.ok(migration.includes("FROM public.role_permissions rp"));
  assert.ok(migration.includes("WHERE rp.role_kind='builtin'"));
  assert.ok(migration.includes("rp.role_kind='custom'"));
});

test("view-only roles are not silently granted print or export access", () => {
  assert.doesNotMatch(migration, /\\('(?:[^']+\\.view|reports\\.export)','[^']+\\.(?:print|export)'\\)/);
  for (const key of ["reports.print","ads.print","ads.export","promotions.print","promotions.export","hr.payroll.export"]) {
    assert.ok(migration.includes("'" + key + "'"), "missing explicit action key " + key);
  }
});

test("database action gates remain restrictive and retain legacy manage fallbacks", () => {
  for (const table of ["categories","customers","expenses","expense_categories","suppliers","departments","job_titles","employment_types","companies","employees","attendance","bonuses","deductions","leave_types","notifications","purchase_returns","purchase_return_items"]) {
    assert.ok(migration.includes("('" + table + "'"), "missing table gate " + table);
  }
  assert.ok(migration.includes("AS RESTRICTIVE FOR INSERT TO authenticated"));
  assert.ok(migration.includes("AS RESTRICTIVE FOR UPDATE TO authenticated"));
  assert.ok(migration.includes("AS RESTRICTIVE FOR DELETE TO authenticated"));
  assert.ok(migration.includes("permission_gate_leave_requests_delete_action"));
  assert.ok(migration.includes("private.can_access_branch"));
});

test("purchase receiving and return RPCs enforce action permissions and branch membership", () => {
  assert.ok(purchaseRpc.includes("'purchases.create'"));
  assert.ok(purchaseRpc.includes("'purchases.manage'"));
  assert.ok(purchaseRpc.includes("private.can_access_branch"));
  assert.ok(!purchaseRpc.includes("role = 'warehouse'"));
  assert.ok(purchaseRpc.includes("INSERT INTO public.purchase_items"));
  assert.ok(purchaseReturnRpc.includes("'purchases.returns.create'"));
  assert.ok(purchaseReturnRpc.includes("'purchases.manage'"));
  assert.ok(purchaseReturnRpc.includes("private.can_access_branch"));
  assert.ok(purchaseReturnRpc.includes("INSERT INTO public.purchase_return_items"));
});

test("operational pages use action-level controls rather than administrator-role-only gates", () => {
  const expected = [
    ["branches.tsx",["branches.create","branches.edit","branches.delete"]],
    ["products.tsx",["products.create","products.edit","products.delete"]],
    ["categories.tsx",["categories.create","categories.edit","categories.delete"]],
    ["customers.tsx",["customers.create","customers.edit","customers.delete"]],
    ["expenses.tsx",["expenses.create"]],
    ["expense-categories.tsx",["expense_categories.create","expense_categories.edit","expense_categories.delete"]],
    ["suppliers.tsx",["suppliers.create","suppliers.edit","suppliers.delete"]],
    ["hr.employees.tsx",["hr.employees.create","hr.employees.edit","hr.employees.delete"]],
    ["hr.compensation.tsx",["hr.compensation.create","hr.compensation.delete"]],
    ["hr.attendance.tsx",["hr.attendance.create","hr.attendance.edit","hr.attendance.print"]],
    ["hr.leaves.tsx",["hr.leaves.delete"]],
    ["purchases.tsx",["purchases.create","purchases.returns.create"]],
    ["companies.tsx",["companies.create","companies.edit","companies.delete"]],
    ["companies.$companyId.tsx",["companies.print"]],
    ["branches.$branchId.tsx",["branches.print"]],
    ["users.tsx",["users.create","users.change_role","users.change_branch","users.change_password","users.suspend","users.approve"]],
    ["audit-logs.tsx",["audit.view"]],
    ["login-history.tsx",["login_history.view"]],
    ["cash-sessions.tsx",["cash.close"]],
    ["reports.tsx",["reports.print"]]
  ];
  for (const [file, keys] of expected) {
    const text = source(file);
    for (const key of keys) assert.ok(text.includes('hasPermission("' + key + '")') || text.includes('"' + key + '"'), file + " missing " + key);
  }
});

test("expense deletion is deferred until an auditable void/reversal workflow exists", () => {
  const expensePage = source("expenses.tsx");
  const deletionMigration = readFileSync(new URL("../supabase/migrations/20261125100000_prevent_direct_expense_deletion.sql", import.meta.url), "utf8");
  assert.doesNotMatch(expensePage, /from\\("expenses"\\)\\.delete\\(/);
  assert.match(deletionMigration, /REVOKE DELETE ON TABLE public\\.expenses/);
});\n\ntest("complete database snapshot includes the section CRUD migration exactly once", () => {
  assert.ok(historyReadMigration.includes("'audit.view'"));
  assert.ok(historyReadMigration.includes("'login_history.view'"));
  assert.ok(historyReadMigration.includes("audit_logs_permission_read"));
  assert.ok(historyReadMigration.includes("login_history_permission_read"));
  for (const name of ["20261125030000_section_crud_permissions.sql", "20261125040000_purchase_rpc_action_permissions.sql", "20261125050000_purchase_return_rpc_action_permission.sql", "20261125060000_audit_history_permission_reads.sql"]) {
    assert.equal(snapshot.split("SOURCE MIGRATION: " + name).length - 1, 1);
    assert.ok(snapshot.includes("END MIGRATION: " + name));
  }
});
