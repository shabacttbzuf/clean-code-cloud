import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/routes/_authenticated/route.tsx", import.meta.url), "utf8");

const requiredRoutes = [
  ["/dashboard", "dashboard.view"],
  ["/reports", "reports.view"],
  ["/pos", "pos.use"],
  ["/sales", "sales.view"],
  ["/cash-sessions", "cash.view"],
  ["/customers", "customers.view"],
  ["/inventory", "inventory.view"],
  ["/inventory/movements", "inventory.movements.view"],
  ["/suppliers", "suppliers.view"],
  ["/purchases", "purchases.view"],
  ["/expenses", "expenses.view"],
  ["/expense-categories", "expense_categories.manage"],
  ["/hr/employees", "hr.employees.view"],
  ["/hr/attendance", "hr.attendance.view"],
  ["/hr/leaves", "hr.leaves.view"],
  ["/hr/compensation", "hr.compensation.view"],
  ["/hr/payroll", "hr.payroll.view"],
  ["/branches", "branches.view"],
  ["/products", "products.view"],
  ["/categories", "categories.view"],
  ["/users", "users.view"],
  ["/users-admin", "users.view"],
  ["/team-permissions", "permissions.view"],
  ["/roles", "roles.view"],
  ["/companies", "companies.view"],
  ["/departments", "departments.view"],
  ["/job-titles", "job_titles.view"],
  ["/employment-types", "employment_types.view"],
  ["/notifications", "notifications.view"],
  ["/login-history", "login_history.view"],
  ["/audit-logs", "audit.view"],
  ["/ads", "ads.view"],
  ["/promotions", "promotions.view"],
  ["/settings", "settings.view"],
];

test("every authenticated business route is mapped to a granular permission", () => {
  for (const [path, permission] of requiredRoutes) {
    assert.ok(
      source.includes(`{ prefix: "${path}", permission: "${permission}" }`),
      `missing route permission for ${path}: ${permission}`,
    );
  }
});

test("direct URL access is guarded and denied when permission lookup fails", () => {
  assert.match(source, /function PermissionRouteGuard\(\)/);
  assert.match(source, /return <Outlet \/>/);
  assert.match(source, /permissionsQuery\.isError/);
  assert.match(source, /ليس لديك صلاحية الوصول إلى هذه الصفحة/);
  assert.match(source, /normalizedPath === "\/owner-center"/);
  assert.match(source, /tenant\?\.owner_id !== userId/);
});

test("route normalization safely strips trailing slashes", () => {
  assert.ok(source.includes(String.raw`pathname.replace(/\/+$/, "")`));
});

test("nested routes use the most specific permission mapping", () => {
  assert.match(source, /\.sort\(\(a, b\) => b\.prefix\.length - a\.prefix\.length\)/);
  assert.match(source, /pathname\.startsWith\(rule\.prefix \+ "\/"\)/);
});

test("first-owner bootstrap remains reachable only while no Super Owner exists", () => {
  assert.match(source, /const isFirstOwnerBootstrap = normalizedPath === "\/admin" && superOwnerStatusKnown && totalCount === 0 && tenant\?\.owner_id === userId/);
  assert.match(source, /isKnownRoute = !!requiredPermission \|\| ownerOnly \|\| isExplicitlyPublic \|\| isFirstOwnerBootstrap/);
  assert.match(source, /normalizedPath === "\/admin" && \(!superOwnerStatusKnown \|\| totalCount > 0 \|\| tenant\?\.owner_id !== userId\)/);
  assert.match(source, /const \{ isSuperOwner, totalCount, loading: ownerLoading, statusKnown: superOwnerStatusKnown/);
});
