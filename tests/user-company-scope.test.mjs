import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261119000007_user_role_company_scope.sql", import.meta.url),
  "utf8",
);
const helperMigration = readFileSync(
  new URL("../supabase/migrations/20261119000008_bind_branch_access_and_helper_actors.sql", import.meta.url),
  "utf8",
);
const users = readFileSync(
  new URL("../src/lib/users.functions.ts", import.meta.url),
  "utf8",
);

test("user role reads are scoped to the row company and branch without recursive RLS", () => {
  assert.match(migration, /company_scope_user_roles_select[\s\S]*private\.can_view_user_role_row/i);
  assert.match(migration, /private\.can_view_user_role_row[\s\S]*security definer/i);
  assert.match(migration, /viewer\.company_id=_row_company_id/i);
  assert.match(migration, /private\.can_access_branch\(_viewer_id,_tenant_id,_row_branch_id\)/i);
  assert.match(migration, /conflicting_role\.company_id<>_row_company_id/i);
});

test("only tenant owners and the platform owner can administer protected roles", () => {
  assert.match(migration, /company_scope_user_roles_insert[\s\S]*private\.can_manage_user_role_row/i);
  assert.match(migration, /company_scope_user_roles_update[\s\S]*private\.can_manage_user_role_row/i);
  assert.match(migration, /company_scope_user_roles_delete[\s\S]*private\.can_manage_user_role_row/i);
  assert.match(migration, /_row_role not in \('owner'::public\.app_role,'manager'::public\.app_role\)/i);
  assert.match(migration, /user_id=\(select auth\.uid\(\)\) and role='owner'[\s\S]*company_id is null and branch_id is null[\s\S]*t\.owner_id=\(select auth\.uid\(\)\)/i);
});

test("tenant-wide custom role definitions are managed only by tenant owners", () => {
  assert.match(migration, /company_scope_custom_roles_insert[\s\S]*as restrictive/i);
  assert.match(migration, /company_scope_custom_roles_update[\s\S]*as restrictive/i);
  assert.match(migration, /company_scope_custom_roles_delete[\s\S]*as restrictive/i);
  assert.match(migration, /private\.is_tenant_owner_user\(\(select auth\.uid\(\)\),tenant_id\)/i);
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

test("company managers can manage only permitted staff roles in their own company", () => {
  assert.match(migration, /company_admin\.role in \('owner','manager'\)/i);
  assert.match(migration, /public\.has_permission\(_actor_id,_tenant_id,'users\.change_role'\)/i);
  assert.match(migration, /_row_role not in \('owner'::public\.app_role,'manager'::public\.app_role\)/i);
});

test("security-definer helper actors are bound to the authenticated user", () => {
  assert.match(helperMigration, /create or replace function private\.can_access_branch[\s\S]*_user_id=\(select auth\.uid\(\)\)/i);
  assert.match(helperMigration, /create or replace function private\.is_tenant_admin[\s\S]*_user_id=\(select auth\.uid\(\)\)/i);
  assert.match(helperMigration, /create or replace function private\.user_has_role_in_tenant[\s\S]*_user_id=\(select auth\.uid\(\)\)/i);
  assert.match(helperMigration, /create or replace function private\.was_hired_by[\s\S]*_actor=\(select auth\.uid\(\)\)/i);
});

test("the platform Super Owner account cannot be modified through role RPCs or RLS", () => {
  assert.match(migration, /protected_super_owner\.user_id=_target_user_id/i);
  assert.match(migration, /The platform Super Owner account is protected/g);
  assert.match(migration, /private\.is_super_owner_target[\s\S]*_actor_id=\(select auth\.uid\(\)\)/i);
  assert.match(migration, /not public\.is_super_owner\(\(select auth\.uid\(\)\)\)/i);
  assert.match(migration, /company_scope_user_permission_overrides_insert[\s\S]*private\.is_super_owner_target/i);
  assert.match(migration, /protect_super_owner_profile_update[\s\S]*private\.is_super_owner_target/i);
  assert.match(migration, /protect_super_owner_profile_delete[\s\S]*private\.is_super_owner_target/i);
});

test("branch-only managers cannot use an inferred company assignment to manage other branches", () => {
  assert.match(users, /function hasCompanyWideUserAdminScope/);
  assert.match(users, /r\.company_id === actorScope\.companyId && \["owner", "manager"\]\.includes\(r\.role\)/);
  assert.match(users, /يجب اختيار أحد الفروع المسندة إلى حسابك لإدارة الموظفين/);
  assert.match(users, /const allowedBranchIds = new Set/);
  assert.match(users, /branchIds\.some\(\(id\) => !allowedBranchIds\.has\(id\)\)/);
});

test("branch-scoped managers cannot assign custom roles outside their assigned branches", () => {
  assert.match(migration, /v_actor_company_wide boolean/i);
  assert.match(migration, /actor_role\.company_id=v_actor_company[\s\S]*actor_role\.role in \('owner','manager'\)/i);
  assert.match(migration, /Branch-scoped manager cannot manage an unassigned company user/i);
  assert.match(migration, /Target role branch is outside the actor branch scope/i);
  assert.match(migration, /Branch-scoped manager may assign only to an assigned branch/i);
});
