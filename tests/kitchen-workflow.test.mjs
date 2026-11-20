import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261120040000_kitchen_order_workflow.sql", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL("../src/routes/_authenticated/kitchen.tsx", import.meta.url),
  "utf8",
);
const sidebar = readFileSync(
  new URL("../src/components/app-sidebar.tsx", import.meta.url),
  "utf8",
);
const guard = readFileSync(
  new URL("../src/routes/_authenticated/route.tsx", import.meta.url),
  "utf8",
);

test("kitchen queue is a separate operational ledger and does not mutate financial sale records", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.kitchen_orders/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.kitchen_order_events/);
  assert.match(migration, /AFTER INSERT ON public\.sales/);
  assert.match(migration, /ON CONFLICT \(sale_id\) DO NOTHING/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.kitchen_orders FROM anon, authenticated/);
  assert.match(migration, /private\.set_kitchen_order_status/);
  assert.match(migration, /Invalid kitchen order status transition/);
  assert.match(migration, /permission_gate_sales_select[\s\S]*kitchen\.view/);
  assert.match(migration, /permission_gate_sale_items_select[\s\S]*kitchen\.view/);
});

test("kitchen workflow validates branch scope and uses realtime updates", () => {
  assert.match(migration, /private\.can_access_branch\(v_actor,v_order\.tenant_id,v_order\.branch_id\)/);
  assert.match(page, /postgres_changes/);
  assert.match(page, /set_kitchen_order_status/);
  assert.match(page, /kitchen\.manage/);
  assert.match(page, /kitchen-queue/);
});

test("kitchen route is visible and guarded by kitchen.view", () => {
  assert.match(sidebar, /url: "\/kitchen", icon: ChefHat, permission: "kitchen\.view"/);
  assert.match(guard, /prefix: "\/kitchen", permission: "kitchen\.view"/);
});
