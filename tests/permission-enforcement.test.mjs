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

test("leave decisions allow either explicit approval or rejection permission", () => {
  assert.match(migration, /permission_gate_leave_requests_update_decision[\s\S]*hr\.leaves\.approve[\s\S]*hr\.leaves\.reject/);
});
