import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261119000007_user_role_company_scope.sql", import.meta.url),
  "utf8",
);
const users = readFileSync(
  new URL("../src/lib/users.functions.ts", import.meta.url),
  "utf8",
);

test("user role reads are scoped to the row company and branch", () => {
  assert.match(migration, /company_scope_user_roles_select[\s\S]*as restrictive for select/i);
  assert.match(migration, /viewer\.company_id=user_roles\.company_id/i);
  assert.match(migration, /private\.can_access_branch\(\(select auth\.uid\(\)\),tenant_id,branch_id\)/i);
  assert.match(migration, /conflicting_role\.company_id<>user_roles\.company_id/i);
});

test("only tenant owners and the platform owner can administer tenant-wide roles", () => {
  assert.match(migration, /company_scope_user_roles_insert[\s\S]*role <> 'owner'/i);
  assert.match(migration, /company_scope_user_roles_update[\s\S]*role <> 'owner'/i);
  assert.match(migration, /company_scope_user_roles_delete[\s\S]*role <> 'owner'/i);
  assert.match(migration, /user_id=\(select auth\.uid\(\)\) and role='owner'[\s\S]*t\.owner_id=\(select auth\.uid\(\)\)/i);
});

test("tenant-wide custom role definitions are managed only by tenant owners", () => {
  assert.match(migration, /company_scope_custom_roles_insert[\\s\\S]*as restrictive/i);
  assert.match(migration, /company_scope_custom_roles_update[\\s\\S]*as restrictive/i);
  assert.match(migration, /company_scope_custom_roles_delete[\\s\\S]*as restrictive/i);
});

test("permission overrides cannot cross the employee company boundary", () => {
  assert.match(migration, /company_scope_user_permission_overrides_insert[\s\S]*as restrictive/i);
  assert.match(migration, /company_scope_user_permission_overrides_update[\s\S]*as restrictive/i);
  assert.match(migration, /company_scope_user_permission_overrides_delete[\s\S]*as restrictive/i);
  assert.match(migration, /private\.can_access_creator_company\(tenant_id,user_id\)/i);
});

test("role RPCs preserve company_id and reject cross-company assignment", () => {
  assert.match(migration, /assign_custom_role_to_user[\s\S]*company_id[\s\S]*You cannot assign a custom role outside your company/i);
  assert.match(migration, /replace_user_role_in_tenant[\s\S]*company_id[\s\S]*You cannot change a role outside your company/i);
  assert.match(migration, /transfer_user_role_branch[\s\S]*Branch transfer cannot cross company boundaries/i);
});

test("server-side user management resolves actor scope and stamps company_id", () => {
  assert.match(users, /async function getActorCompanyScope/);
  assert.match(users, /async function assertBranchInActorScope/);
  assert.match(users, /company_id: targetCompanyId/);
  assert.match(users, /لا يمكنك إدارة حساب موظف لا يتبع شركتك/);
  assert.match(users, /إسناد دور المدير العام متاح لمالك المؤسسة فقط/);
  assert.match(users, /لا يمكن تعديل حساب المالك الأعلى/);
});
