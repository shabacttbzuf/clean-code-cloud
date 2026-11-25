import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const routeGuard = readFileSync(new URL("../src/routes/_authenticated/route.tsx", import.meta.url), "utf8");
const activeTenantHook = readFileSync(new URL("../src/hooks/use-active-tenant.ts", import.meta.url), "utf8");
const superOwnerHook = readFileSync(new URL("../src/hooks/use-super-owner.ts", import.meta.url), "utf8");
const permissionActions = readFileSync(new URL("../src/lib/demo-data.functions.ts", import.meta.url), "utf8");
const granularMigration = readFileSync(new URL("../supabase/migrations/20261125010000_granular_section_action_permissions.sql", import.meta.url), "utf8");
const alignmentMigration = readFileSync(new URL("../supabase/migrations/20261125020000_granular_marketing_rls_alignment.sql", import.meta.url), "utf8");

test("authenticated routes fail closed when no permission mapping exists", () => {
  assert.ok(routeGuard.includes("const isKnownRoute = !!requiredPermission || ownerOnly || isExplicitlyPublic || isFirstOwnerBootstrap"));
  assert.ok(routeGuard.includes("if (!isKnownRoute)"));
  assert.ok(routeGuard.includes("تم منع الوصول احتياطياً"));
});

test("cached permissions and Super Owner status fail closed after a refresh error", () => {
  assert.ok(activeTenantHook.includes("!superOwnerQuery.isError && superOwnerQuery.data === true"));
  assert.ok(activeTenantHook.includes("permissionsQuery.isError ? [] : permissionsQuery.data ?? []"));
  assert.ok(superOwnerHook.includes("!query.isError && query.data?.isSuperOwner === true"));
  assert.ok(superOwnerHook.includes("query.isError ? 0 : query.data?.totalCount ?? 0"));
  assert.ok(routeGuard.includes("!permissionsQuery.isError && !!permissionsQuery.data?.has(requiredPermission)"));
});

test("advertising, promotions and settings routes require view permissions", () => {
  assert.ok(routeGuard.includes('{ prefix: "/ads", permission: "ads.view" }'));
  assert.ok(routeGuard.includes('{ prefix: "/promotions", permission: "promotions.view" }'));
  assert.ok(routeGuard.includes('{ prefix: "/settings", permission: "settings.view" }'));
  assert.ok(routeGuard.includes('supabase.rpc("get_my_permissions"'));
});

test("super owner status is validated and administration fails closed on an unknown status", () => {
  assert.ok(superOwnerHook.includes("const payload = data as Record<string, unknown>"));
  assert.ok(superOwnerHook.includes('typeof totalCount !== "number"'));
  assert.ok(superOwnerHook.includes('typeof isSuperOwner !== "boolean"'));
  assert.ok(routeGuard.includes("!superOwnerStatusKnown"));
  assert.ok(routeGuard.includes("refetchSuperOwnerStatus"));
});

test("user permission mutations verify actor, target membership and protect super owner accounts", () => {
  const action = permissionActions.slice(permissionActions.indexOf("export const setUserPermission"));
  assert.ok(action.includes("data.user_id === context.userId"));
  assert.ok(action.includes('rpc("is_super_owner"'));
  assert.ok(action.includes("targetIsSuperOwner"));
  assert.ok(action.includes("لا يمكن تعديل صلاحيات حساب المالك الرئيسي"));
  assert.ok(action.includes("المستخدم المستهدف لا ينتمي إلى المؤسسة المحددة"));
  assert.ok(action.includes('row.role === "owner" || row.role === "manager"'));
  assert.ok(action.includes("row.hired_by !== context.userId"));
  assert.ok(action.includes("get_my_permissions"));
  assert.ok(action.includes("لا يمكنك منح صلاحية لا تملكها بنفسك"));
  assert.ok(action.includes('row.role === "owner" && row.company_id == null && row.branch_id == null'));
  assert.ok(action.includes("const scopedAdmins = actorRows.filter"));
  assert.ok(action.includes("if (!scopedAdmins.length)"));
  assert.ok(action.includes("targetWithinScope"));
  assert.ok(action.includes('_permission_key: "permissions.manage"'));
  assert.ok(action.includes('targetRoles.some((row) => row.role === "owner")'));
  assert.ok(action.includes('scopedAdmins.some((row) => row.role === "manager")'));
});

test("enterprise user administration blocks self-targeting and enforces tenant/company/branch scope", () => {
  const enterprise = readFileSync(new URL("../src/lib/enterprise.functions.ts", import.meta.url), "utf8");
  const helper = enterprise.slice(enterprise.indexOf("async function assertTargetUserManageable"), enterprise.indexOf("/* -------------------- Login history"));
  assert.ok(helper.includes("actorId === targetUserId"));
  assert.ok(helper.includes('from("super_owners")'));
  assert.ok(helper.includes('row.role === "owner" && row.company_id == null'));
  assert.ok(helper.includes('row.role === "manager"'));
  assert.ok(helper.includes("targetRoles.some((row: any) => row.hired_by !== actorId)"));
  assert.ok(helper.includes("targetBranchIds.some((id) => !actorBranchIds.includes(id))"));
  assert.ok(helper.includes("targetCompanyIds.has(actorCompanyId)"));
  assert.ok(enterprise.includes('.is("company_id", null).limit(1)'));
  const patchGuard = enterprise.slice(enterprise.indexOf("async function assertEnterpriseProfilePatchScope"), enterprise.indexOf("/* -------------------- Enterprise user actions"));
  assert.ok(patchGuard.includes('from("companies")'));
  assert.ok(patchGuard.includes('from("departments")'));
  assert.ok(patchGuard.includes("resultingCompanyId !== actorCompanyId"));
  assert.ok(patchGuard.includes("department.company_id !== resultingCompanyId"));
  assert.ok(enterprise.includes("await assertEnterpriseProfilePatchScope("));
});

test("marketing CRUD and approval permissions are separate and database enforced", () => {
  for (const key of ["ads.view", "ads.create", "ads.edit", "ads.delete", "ads.approve", "promotions.view", "promotions.create", "promotions.edit", "promotions.delete", "promotions.approve"]) {
    assert.ok(granularMigration.includes("'" + key + "'"), "missing " + key);
  }
  for (const key of ["ads.create", "ads.edit", "ads.delete", "promotions.create", "promotions.edit", "promotions.delete"]) {
    assert.ok(alignmentMigration.includes("'" + key + "'"), "missing RLS gate " + key);
  }
  assert.ok(granularMigration.includes("Permission denied: ads.approve"));
  assert.ok(granularMigration.includes("Permission denied: promotions.approve"));
  assert.ok(alignmentMigration.includes("AS RESTRICTIVE FOR UPDATE TO authenticated"));
  assert.ok(alignmentMigration.includes("promotional_offers_granular_scope_update"));
  assert.ok(alignmentMigration.includes("private.can_access_branch"));
});

test("view permissions never imply HR print or marketing export capabilities", () => {
  assert.doesNotMatch(granularMigration, /\\('hr\\.(?:attendance|leaves|payroll)\\.print', 'hr\\.(?:attendance|leaves|payroll)\\.view'\\)/);
  const sectionCrud = readFileSync(new URL("../supabase/migrations/20261125030000_section_crud_permissions.sql", import.meta.url), "utf8");
  assert.doesNotMatch(sectionCrud, /\\('(?:[^']+\\.view|reports\\.export)','[^']+\\.(?:print|export)'\\)/);
});

test("permission caches are scoped and invalidated after membership or role changes", () => {
  const tenantHook = readFileSync(new URL("../src/hooks/use-active-tenant.ts", import.meta.url), "utf8");
  assert.ok(tenantHook.includes("membership?.company_id"));
  assert.ok(tenantHook.includes("membership?.branch_id"));
  assert.ok(tenantHook.includes("refetchInterval: 30_000"));
  assert.ok(tenantHook.includes('table: "user_roles"'));
  assert.ok(tenantHook.includes('table: "user_permission_overrides"'));
  assert.ok(tenantHook.includes('table: "role_permissions"'));
  assert.ok(tenantHook.includes('table: "custom_roles"'));
  assert.ok(tenantHook.includes("queryClient.removeQueries"));
  assert.ok(routeGuard.includes("membership?.company_id"));
  assert.ok(routeGuard.includes("refetchInterval: 30_000"));
});

test("platform branding writes remain exclusive to the unchanged Super Owner identity", () => {
  const settingsMigration = readFileSync(new URL("../supabase/migrations/20261118000006_platform_branding_and_notification_reads.sql", import.meta.url), "utf8");
  assert.ok(settingsMigration.includes("platform branding managed by super owner"));
  assert.ok(settingsMigration.includes("public.is_super_owner((select auth.uid()))"));
});
