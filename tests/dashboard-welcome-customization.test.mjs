import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync(new URL("../src/routes/_authenticated/dashboard.tsx", import.meta.url), "utf8");

test("welcome background preferences are isolated by tenant, company, branch and user", () => {
  assert.match(dashboard, /restaurant-dashboard-hero:\\$\\{tenantId \\?\\? "none"\\}:\\$\\{membership\\?\\.company_id \\?\\? "tenant"\\}:\\$\\{membership\\?\\.branch_id \\?\\? "all-branches"\\}:\\$\\{user\\?\\.id \\?\\? "anonymous"\\}/);
  assert.match(dashboard, /window\\.localStorage\\.getItem\\(heroCustomizationKey\\)/);
  assert.match(dashboard, /window\\.localStorage\\.setItem\\(heroCustomizationKey/);
});

test("custom background image URLs require HTTPS and reject embedded credentials", () => {
  assert.match(dashboard, /url\\.protocol !== "https:" \\|\\| url\\.username \\|\\| url\\.password/);
  assert.match(dashboard, /أدخل رابط صورة آمن يبدأ بـ https:\\/\\//);
});

test("welcome hero displays verified company and branch labels with safe fallback", () => {
  assert.match(dashboard, /dashboard-active-company-name/);
  assert.match(dashboard, /dashboard-active-branch-name/);
  assert.match(dashboard, /companyNameQuery\\.isError/);
  assert.match(dashboard, /branchNameQuery\\.isError/);
});

test("welcome customization does not replace current ads, campaign targeting or deferred charts", () => {
  assert.match(dashboard, /<AdPlacement placement="welcome"/);
  assert.match(dashboard, /<AdPlacement placement="main"/);
  assert.match(dashboard, /<DeferredDashboardCharts/);
  assert.match(dashboard, /target_branch_ids/);
  assert.match(dashboard, /prefers-reduced-motion/);
});
