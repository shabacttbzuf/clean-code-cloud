import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261111033000_enforce_role_permissions.sql", import.meta.url),
  "utf8",
);

test("permission catalogue is enforced with restrictive RLS gates", () => {
  assert.match(migration, /AS RESTRICTIVE FOR SELECT TO authenticated/);
  assert.match(migration, /AS RESTRICTIVE FOR INSERT TO authenticated/);
  assert.match(migration, /AS RESTRICTIVE FOR UPDATE TO authenticated/);
  assert.match(migration, /AS RESTRICTIVE FOR DELETE TO authenticated/);
  assert.match(migration, /public\.has_permission\(\(select auth\.uid\(\)\), tenant_id/);
  assert.match(migration, /role_permissions' THEN[\s\S]*tenant_id IS NULL OR public\.has_permission/);
});

test("critical transactional RPCs verify the acting user's exact permission", () => {
  for (const key of [
    "pos.create_sale",
    "cash.close",
    "purchases.create",
    "purchases.manage",
    "sales.refund",
    "inventory.adjust",
  ]) {
    assert.ok(migration.includes(`Permission denied: ${key}`), `missing guard for ${key}`);
  }
});

test("enterprise server actions validate permission keys instead of broad role names", () => {
  const source = readFileSync(
    new URL("../src/lib/enterprise.functions.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /async function assertPermission/);
  for (const key of [
    "companies.manage",
    "departments.manage",
    "job_titles.manage",
    "employment_types.manage",
    "users.edit",
    "users.approve",
    "users.force_password_reset",
    "roles.manage",
    "notifications.manage",
  ]) {
    assert.ok(source.includes(`"${key}"`), `missing server permission check for ${key}`);
  }
  assert.doesNotMatch(source, /assertTenantAdmin\(|assertOwner\(/);
});

test("sidebar resolves permissions from the database instead of role-name guesses", () => {
  const sidebar = readFileSync(
    new URL("../src/components/app-sidebar.tsx", import.meta.url),
    "utf8",
  );
  assert.match(sidebar, /get_my_permissions/);
  assert.match(sidebar, /group\.items\.filter\(allowed\)/);
  assert.match(sidebar, /permission: "pos\.use"/);
  assert.match(sidebar, /permission: "reports\.view"/);
});

test("leave decisions allow either explicit approval or rejection permission", () => {
  assert.match(migration, /permission_gate_leave_requests_update_decision[\s\S]*hr\.leaves\.approve[\s\S]*hr\.leaves\.reject/);
});
test("managers receive team-permission management while custom-role editing remains owner-only", () => {
  assert.match(migration, /manager'::public\.app_role, 'permissions\.manage'/);
  assert.match(migration, /roles\.manage/);
});

test("cashier and waiter defaults match the POS responsibility boundary", () => {
  assert.match(migration, /cashier'::public\.app_role, 'categories\.view'/);
  assert.match(migration, /cashier'::public\.app_role, 'inventory\.view'/);
  assert.match(migration, /DELETE FROM public\.role_permissions[\s\S]*builtin_role = 'waiter'[\s\S]*pos\.create_sale/);
});
