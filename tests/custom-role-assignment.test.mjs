import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261112004325_assignable_custom_roles.sql", import.meta.url), "utf8");
const usersFunctions = readFileSync(new URL("../src/lib/users.functions.ts", import.meta.url), "utf8");
const usersPage = readFileSync(new URL("../src/routes/_authenticated/users.tsx", import.meta.url), "utf8");
const enterpriseUsersPage = readFileSync(new URL("../src/routes/_authenticated/users-admin.tsx", import.meta.url), "utf8");
const teamPermissionsPage = readFileSync(new URL("../src/routes/_authenticated/team-permissions.tsx", import.meta.url), "utf8");

test("custom role assignment is tenant-bound by a composite foreign key", () => {
  assert.match(migration, /foreign key \(custom_role_id, tenant_id\)/i);
  assert.match(migration, /references public\.custom_roles \(id, tenant_id\)/i);
  assert.match(migration, /custom_roles_id_tenant_unique/);
});

test("effective permissions use custom-role grants instead of inheriting waiter defaults", () => {
  assert.match(migration, /if v_custom_role_id is not null then[\s\S]*role_kind = 'custom'/);
  assert.match(migration, /rp\.tenant_id = _tenant_id/);
  assert.match(migration, /if v_override is not null then return v_override/);
});

test("custom role assignment requires both role-management and user role-change permissions", () => {
  assert.match(migration, /has_permission\(auth\.uid\(\), _tenant_id, 'roles\.manage'\)/);
  assert.match(migration, /has_permission\(auth\.uid\(\), _tenant_id, 'users\.change_role'\)/);
  assert.match(migration, /custom_role_id is null or public\.has_permission/);
  assert.match(migration, /assign_custom_role_to_user/);
});

test("server user actions assign only tenant-owned custom roles through the guarded RPC", () => {
  assert.match(usersFunctions, /custom_role_id: z\.string\(\)\.uuid\(\)\.optional\(\)\.nullable\(\)/);
  assert.match(usersFunctions, /\.eq\("tenant_id", data\.tenant_id\)\.maybeSingle\(\)/);
  assert.match(usersFunctions, /rpc\("assign_custom_role_to_user"/);
  assert.match(usersFunctions, /roles\.manage/);
});

test("staff creation and role changes expose tenant custom roles", () => {
  assert.match(usersPage, /customRoles/);
  assert.match(usersPage, /custom_role_id/);
  assert.match(usersPage, /custom:\$\{r\.id\}/);
  assert.match(enterpriseUsersPage, /custom_role_name/);
  assert.match(enterpriseUsersPage, /custom_role_id/);
});

test("team permission review displays the custom role's actual permission defaults", () => {
  assert.match(teamPermissionsPage, /custom-role-default-perms/);
  assert.match(teamPermissionsPage, /selectedTeamMember\.custom_role_id/);
  assert.match(teamPermissionsPage, /custom_role_name/);
});

const ownerGuardMigration = readFileSync(new URL("../supabase/migrations/20261112005125_owner_only_custom_role_management.sql", import.meta.url), "utf8");
test("custom role assignment is owner-only even if a permission override is granted", () => {
  assert.match(ownerGuardMigration, /Only the tenant owner or platform super owner may assign custom roles/);
  assert.match(ownerGuardMigration, /actor_role\.role = 'owner'::public\.app_role/);
});
