import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../src/routes/_authenticated/hr.leaves.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261120010000_secure_leave_decisions_and_deletion.sql", import.meta.url), "utf8");

test("leave decisions are tenant-scoped and only update pending requests", () => {
  assert.match(route, /\.eq\("tenant_id", tenantId\)\.eq\("status", "pending"\)/);
  assert.match(route, /approved_by: userId, approved_at: now/);
  assert.match(route, /rejected_by: userId, rejected_at: now/);
  assert.match(route, /سبب الرفض \(إلزامي\)/);
});

test("leave creation validates date range and calculates inclusive UTC days", () => {
  assert.match(route, /endMs < startMs/);
  assert.match(route, /Math\.floor\(\(endMs - startMs\) \/ 86400000\) \+ 1/);
});

test("leave deletion requires confirmation and protects approved payroll records", () => {
  assert.match(route, /window\.confirm\(/);
  assert.match(migration, /permission_gate_leave_requests_delete/);
  assert.match(migration, /prevent_deleting_payroll_linked_leave/);
  assert.match(migration, /pr\.status in \('approved', 'paid'\)/);
});
