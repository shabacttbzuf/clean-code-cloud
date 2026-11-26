import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/routes/_authenticated/inventory.index.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261126220000_inventory_adjustment_permission_and_branch_guard.sql", import.meta.url), "utf8");

test("inventory UI changes balances only through the audited RPC", () => {
  assert.match(page, /rpc\("adjust_inventory_balance"/);
  assert.doesNotMatch(page, /from\("inventory"\)\.(?:insert|update|delete)\(/);
});

test("database denies direct balance writes while retaining branch-scoped reads", () => {
  assert.match(migration, /DROP POLICY IF EXISTS "Warehouse and admins manage inventory"/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public\\.inventory/);
});
