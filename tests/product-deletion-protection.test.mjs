import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/routes/_authenticated/products.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261125110000_prevent_product_history_deletion.sql", import.meta.url), "utf8");

test("products are archived and reactivated without deleting records", () => {
  assert.doesNotMatch(page, /from\("products"\)\.delete\(/);
  assert.match(page, /update\(\{ is_active: isActive \}\)/);
  assert.match(page, /أرشفة/);
  assert.match(page, /إعادة تفعيل/);
});

test("database protects inventory rows and transaction history from product deletion", () => {
  assert.match(migration, /REVOKE DELETE ON TABLE public\.products/);
  assert.match(migration, /inventory_product_id_fkey[\s\S]*?ON DELETE RESTRICT/);
  assert.match(migration, /inventory_transactions_product_id_fkey[\s\S]*?ON DELETE RESTRICT/);
});
