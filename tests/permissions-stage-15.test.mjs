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
  assert.match(action, /get_my_permissions/);
  assert.match(action, /لا يمكنك منح صلاحية لا تملكها بنفسك/);
});
