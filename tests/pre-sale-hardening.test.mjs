import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261119010000_pre_sale_security_performance_hardening.sql", import.meta.url),
  "utf8",
);

test("customer-credit checkout rejects NULL and non-array item payloads before array length evaluation", () => {
  const nullGuard = migration.indexOf("_items is null or jsonb_typeof(_items) is distinct from 'array'");
  const lengthGuard = migration.indexOf("jsonb_array_length(_items)=0");
  assert.ok(nullGuard >= 0, "explicit NULL/type guard must exist");
  assert.ok(lengthGuard > nullGuard, "array length must only be evaluated after type validation");
  assert.match(migration, /Sale must contain between 1 and 300 items/);
  assert.match(migration, /cost_price_snapshot[\s\S]*v_product\.cost_price/i);
});

test("performance cleanup removes only nine verified exact duplicate permissive SELECT policies", () => {
  const legacyPolicies = [
    '"Tenant members view branches"',
    '"Tenant members view categories"',
    '"Tenant members view customers"',
    '"Members view inventory in accessible branches"',
    '"Members view txns in accessible branches"',
    '"Tenant members view products"',
    '"Members view purchases in accessible branches"',
    '"Members view sales in accessible branches"',
    '"Members view suppliers"',
  ];
  for (const policy of legacyPolicies) {
    assert.ok(migration.includes(`drop policy if exists ${policy}`), `missing safe duplicate removal for ${policy}`);
  }
  assert.equal((migration.match(/drop policy if exists/gi) ?? []).length, 9);
  assert.doesNotMatch(migration, /drop index|truncate|delete from|drop table/i);
});
