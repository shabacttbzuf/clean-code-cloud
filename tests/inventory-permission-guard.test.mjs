import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const inventoryPage = readFileSync(
  new URL("../src/routes/_authenticated/inventory.index.tsx", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/20261126220000_inventory_adjustment_permission_and_branch_guard.sql", import.meta.url),
  "utf8",
);

test("inventory adjustment UI uses the granular inventory.adjust permission", () => {
  assert.match(inventoryPage, /hasPermission\("inventory\.adjust"\)/);
  assert.match(inventoryPage, /if \(!canAdjust\) throw new Error/);
});

test("inventory balance writes are RPC-only and record a branch-scoped movement", () => {
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public\.inventory FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /DROP POLICY IF EXISTS "Warehouse and admins manage inventory"/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION private\.adjust_inventory_balance/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.adjust_inventory_balance/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SECURITY INVOKER/);
  assert.match(migration, /public\.has_permission\(v_actor_id, _tenant_id, 'inventory\.adjust'\)/);
  assert.match(migration, /private\.can_access_branch\(v_actor_id, _tenant_id, _branch_id\)/);
  assert.match(migration, /INSERT INTO public\.inventory_transactions/);
  assert.match(migration, /SET search_path = pg_catalog, public, private, pg_temp/);
});
