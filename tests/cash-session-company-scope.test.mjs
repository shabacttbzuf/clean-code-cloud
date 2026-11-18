import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261119000003_scope_cash_session_close_to_branch.sql", import.meta.url),
  "utf8",
);

test("cash-session close enforces assigned company and branch before manager override", () => {
  const branchGuard = migration.indexOf("private.can_access_branch(auth.uid(), v_session.tenant_id, v_session.branch_id)");
  const adminGuard = migration.indexOf("private.is_tenant_admin(auth.uid(), v_session.tenant_id)");
  assert.ok(branchGuard >= 0, "missing branch/company access guard");
  assert.ok(adminGuard > branchGuard, "tenant-admin override must be evaluated only after branch scope");
});

test("cash-session close still requires permission and preserves cashier/admin role rule", () => {
  assert.match(migration, /has_permission\(auth\.uid\(\), v_session\.tenant_id, 'cash\.close'\)/i);
  assert.match(migration, /auth\.uid\(\) <> v_session\.cashier_id and not private\.is_tenant_admin/i);
  assert.match(migration, /update public\.cash_sessions[\s\S]*set status = 'closed'/i);
});

test("cash-session RPC remains secured with a fixed search path", () => {
  assert.match(migration, /security definer\s+set search_path = pg_catalog, public, private, pg_temp/i);
  assert.match(migration, /revoke all on function public\.close_cash_session\(uuid,numeric\) from public,anon/i);
});
