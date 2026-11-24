import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const routeGuard = readFileSync(new URL("../src/routes/_authenticated/route.tsx", import.meta.url), "utf8");
const superOwnerHook = readFileSync(new URL("../src/hooks/use-super-owner.ts", import.meta.url), "utf8");
const permissionActions = readFileSync(new URL("../src/lib/demo-data.functions.ts", import.meta.url), "utf8");

test("authenticated routes fail closed when no permission mapping exists", () => {
  assert.match(routeGuard, /const isKnownRoute = !!requiredPermission \|\| ownerOnly \|\| isExplicitlyPublic/);
  assert.match(routeGuard, /if \(!isKnownRoute\)/);
  assert.match(routeGuard, /تم منع الوصول احتياطياً/);
});

test("advertising, promotions and settings routes require explicit effective permissions", () => {
  assert.match(routeGuard, /\{ prefix: "\/ads", permission: "ads\.manage" \}/);
  assert.match(routeGuard, /\{ prefix: "\/promotions", permission: "promotions\.manage" \}/);
  assert.match(routeGuard, /\{ prefix: "\/settings", permission: "settings\.view" \}/);
  assert.match(routeGuard, /get_my_permissions/);
});

test("super owner status is validated and administration fails closed on an unknown status", () => {
  assert.match(superOwnerHook, /Number\.isSafeInteger\(data\.totalCount\)/);
  assert.match(superOwnerHook, /typeof data\.isSuperOwner !== "boolean"/);
  assert.match(routeGuard, /!superOwnerStatusKnown/);
  assert.match(routeGuard, /refetchSuperOwnerStatus/);
});

test("user permission mutations verify actor, target membership and protect super owner accounts", () => {
  const action = permissionActions.slice(permissionActions.indexOf("export const setUserPermission"));
  assert.match(action, /data\.user_id === context\.userId/);
  assert.match(action, /rpc\("is_super_owner"/);
  assert.match(action, /targetIsSuperOwner/);
  assert.match(action, /لا يمكن تعديل صلاحيات حساب المالك الرئيسي/);
  assert.match(action, /المستخدم المستهدف لا ينتمي إلى المؤسسة المحددة/);
  assert.match(action, /targetRoles\.some\(\(row\) => row\.role === "owner" \|\| row\.role === "manager"\)/);
  assert.match(action, /row\.hired_by !== context\.userId/);
  assert.match(action, /row\.company_id !== actorManager\.company_id/);
  assert.match(action, /get_my_permissions/);
  assert.match(action, /لا يمكنك منح صلاحية لا تملكها بنفسك/);
});

const adsMigration = readFileSync(new URL("../supabase/migrations/20261121010000_separate_ads_management_permission.sql", import.meta.url), "utf8");
const promotionsMigration = readFileSync(new URL("../supabase/migrations/20261121020000_promotional_offers_and_pos_redemptions.sql", import.meta.url), "utf8");
const settingsMigration = readFileSync(new URL("../supabase/migrations/20261118000006_platform_branding_and_notification_reads.sql", import.meta.url), "utf8");

test("advertising management has its own permission and company-scoped database write guards", () => {
  assert.match(adsMigration, /VALUES \('ads\.manage'/);
  assert.match(adsMigration, /public\.has_permission\(\(select auth\.uid\(\)\), marketing_campaigns\.tenant_id, 'ads\.manage'\)/);
  assert.match(adsMigration, /company_scope_marketing_campaigns_insert/);
  assert.match(adsMigration, /company_scope_marketing_campaigns_update/);
  assert.match(adsMigration, /company_scope_marketing_campaigns_delete/);
});

test("promotional offers have a separate permission and company/branch-scoped database policies", () => {
  assert.match(promotionsMigration, /VALUES \('promotions\.manage'/);
  assert.match(promotionsMigration, /Promotion managers insert offers/);
  assert.match(promotionsMigration, /Promotion managers update offers/);
  assert.match(promotionsMigration, /Promotion managers delete offers/);
  assert.match(promotionsMigration, /private\.can_access_branch/);
  assert.match(promotionsMigration, /private\.is_company_member/);
});

test("platform branding writes remain exclusive to the unchanged Super Owner identity", () => {
  assert.match(settingsMigration, /platform branding managed by super owner/);
  assert.match(settingsMigration, /public\.is_super_owner\(\(select auth\.uid\(\)\)\)/);
});
