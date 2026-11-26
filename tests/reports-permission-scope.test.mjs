import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const reports = readFileSync(
  new URL("../src/routes/_authenticated/reports.tsx", import.meta.url),
  "utf8",
);

test("reports are gated by reports.view and each data domain permission", () => {
  assert.ok(reports.includes('const canViewReports = isSuperOwner || permissionsQuery.data?.has("reports.view") === true;'));
  for (const permission of [
    "sales.view", "expenses.view", "cash.view", "purchases.view",
    "inventory.view", "hr.employees.view", "hr.attendance.view",
    "promotions.manage", "ads.manage",
  ]) {
    assert.ok(reports.includes(permission), `missing report permission gate: ${permission}`);
  }
});

test("financial cost and valuation fields require both sales and expense access", () => {
  assert.ok(reports.includes("const canViewFinancialReports = canViewExpenses && canViewSalesReports;"));
  assert.ok(reports.includes('select(canViewFinancialReports ? "id, branch_id, received_at, total, status, supplier_id, reference" : "id, branch_id, received_at, status, supplier_id, reference")'));
  assert.ok(reports.includes('select(canViewFinancialReports ? "id, name, sku, cost_price, min_stock" : "id, name, sku, min_stock")'));
  assert.ok(reports.includes('product_name, quantity, line_total, sale_id, cost_price_snapshot'));
});

test("report query cache is isolated by user, company, branch, and permission fingerprint", () => {
  assert.ok(reports.includes('queryKey: ["reports", tenantId, userId, membership?.company_id, membership?.branch_id, companyId, isSuperOwner, permissionFingerprint, from, to, branchId]'));
  assert.ok(reports.includes('queryKey: ["report-branches", tenantId, userId, companyId, membership?.company_id, membership?.branch_id, isSuperOwner]'));
});

test("branch-scoped report queries fail closed when the member has no accessible branches", () => {
  assert.ok(reports.includes("if (allowedBranchIds.length === 0) return Promise.resolve({ data: [], error: null });"));
  assert.ok(reports.includes('query = query.in("branch_id", allowedBranchIds);'));
  assert.ok(reports.includes('if (branchId !== "all") query = query.eq("branch_id", branchId);'));
});

test("report export and filters require their dedicated permissions", () => {
  assert.ok(reports.includes('const canExportReports = isSuperOwner || permissionsQuery.data?.has("reports.export") === true;'));
  assert.ok(reports.includes('const canFilterReports = isSuperOwner || permissionsQuery.data?.has("reports.filter") === true;'));
  assert.ok(reports.includes("action={canPrintReports ?"));
});
