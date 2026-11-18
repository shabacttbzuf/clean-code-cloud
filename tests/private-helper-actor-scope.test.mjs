import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261119000008_bind_branch_access_and_helper_actors.sql", import.meta.url),
  "utf8",
);

test("branch access is bound to auth.uid and includes tenant-wide owner access", () => {
  assert.match(migration, /private\.can_access_branch[\s\S]*_user_id=\(select auth\.uid\(\)\)/i);
  assert.match(migration, /tenant_owner\.role='owner'[\s\S]*tenant_owner\.company_id is null/i);
  assert.match(migration, /ur\.company_id=b\.company_id/i);
  assert.match(migration, /ur\.branch_id=_branch_id/i);
});

test("SECURITY DEFINER role helpers cannot impersonate another user", () => {
  assert.match(migration, /can_manage_expenses[\s\S]*_user_id=\(select auth\.uid\(\)\)/i);
  assert.match(migration, /has_role[\s\S]*_user_id=\(select auth\.uid\(\)\)/i);
  assert.match(migration, /is_tenant_admin[\s\S]*_user_id=\(select auth\.uid\(\)\)/i);
  assert.match(migration, /is_tenant_member[\s\S]*_user_id=\(select auth\.uid\(\)\)/i);
  assert.match(migration, /user_branch_id[\s\S]*_user_id=\(select auth\.uid\(\)\)/i);
  assert.match(migration, /user_has_role_in_tenant[\s\S]*_user_id=\(select auth\.uid\(\)\)/i);
  assert.match(migration, /was_hired_by[\s\S]*_actor=\(select auth\.uid\(\)\)/i);
});

test("tenant owners can create and update branches across companies", () => {
  assert.match(migration, /company_scope_branches_insert[\s\S]*private\.is_tenant_owner_user/i);
  assert.match(migration, /company_scope_branches_update[\s\S]*private\.is_tenant_owner_user/i);
});
