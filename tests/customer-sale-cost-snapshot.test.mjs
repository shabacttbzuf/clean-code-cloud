import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261119000001_customer_credit_sale_cost_snapshot.sql", import.meta.url),
  "utf8",
);

test("customer credit and partial-payment sales snapshot product cost at sale time", () => {
  assert.match(migration, /line_total\s*,\s*cost_price_snapshot/i);
  assert.match(migration, /v_product\.cost_price/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /has_permission\(auth\.uid\(\),\s*_tenant_id,\s*'pos\.create_sale'/i);
});

test("cost snapshot migration does not rewrite historical sale items", () => {
  assert.doesNotMatch(migration, /update\s+public\.sale_items/i);
});
