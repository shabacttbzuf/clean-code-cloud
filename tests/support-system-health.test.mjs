import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const support = readFileSync(new URL("../src/routes/_authenticated/support.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../src/routes/_authenticated/dashboard.tsx", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../src/components/app-sidebar.tsx", import.meta.url), "utf8");
const topbar = readFileSync(new URL("../src/routes/_authenticated/route.tsx", import.meta.url), "utf8");
const routeTree = readFileSync(new URL("../src/routeTree.gen.ts", import.meta.url), "utf8");

test("support center contains searchable practical guides and no fake ticket submission", () => {
  assert.match(support, /useMemo/);
  assert.match(support, /ابحث في الأدلة/);
  assert.match(support, /نسخ معلومات التشخيص/);
  assert.match(support, /لا ترسل كلمة المرور/);
  assert.match(support, /إدارة الفروع/);
  assert.match(support, /التقارير والتحليلات/);
  assert.doesNotMatch(support, /support_tickets|insert\(/);
});

test("diagnostic copy contains only non-sensitive browser and runtime context", () => {
  assert.match(support, /navigator\.userAgent/);
  assert.match(support, /navigator\.language/);
  assert.match(support, /navigator\.onLine/);
  assert.doesNotMatch(support, /tenantId|access_token|refresh_token|service_role/);
});

test("system status is healthy only after database, branch, permission, and profile checks pass", () => {
  assert.match(dashboard, /supabase\.from\("tenants"\)/);
  assert.match(dashboard, /supabase\.from\("branches"\)/);
  assert.match(dashboard, /supabase\.from\("profiles"\)/);
  assert.match(dashboard, /get_my_permissions/);
  assert.match(dashboard, /checks\.every\(\(check\) => check\.status === "ok"\)/);
  assert.match(dashboard, /overall === "healthy"/);
  assert.match(dashboard, /إعادة فحص النظام/);
});

test("help center is reachable from app navigation and the global top bar", () => {
  assert.match(navigation, /url: "\/support"/);
  assert.match(topbar, /to="\/support"/);
  assert.match(routeTree, /AuthenticatedSupportRouteImport/);
  assert.match(routeTree, /'\/_authenticated\/support'/);
});
