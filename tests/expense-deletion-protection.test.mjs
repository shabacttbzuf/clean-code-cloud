import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/routes/_authenticated/expenses.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261125100000_prevent_direct_expense_deletion.sql", import.meta.url), "utf8");

test("financial expense records are not physically deleted from the UI", () => {
  assert.doesNotMatch(page, /from\("expenses"\)\.delete\(/);
  assert.match(page, /إلغاء محاسبي موثق/);
});

test("database revokes authenticated direct deletion and removes delete RLS policy", () => {
  assert.match(migration, /DROP POLICY IF EXISTS "Admins delete expenses"/);
  assert.match(migration, /DROP POLICY IF EXISTS permission_gate_expenses_delete/);
  assert.match(migration, /DROP POLICY IF EXISTS company_boundary_expenses_delete/);
  assert.match(migration, /REVOKE DELETE ON TABLE public\.expenses FROM PUBLIC, anon, authenticated/);
});
