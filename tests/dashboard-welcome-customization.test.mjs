import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync(new URL("../src/routes/_authenticated/dashboard.tsx", import.meta.url), "utf8");

test("welcome background preferences are isolated by tenant, company, branch and user", () => {
  assert.ok(dashboard.includes('restaurant-dashboard-hero:${tenantId ?? "none"}:${membership?.company_id ?? "tenant"}:${membership?.branch_id ?? "all-branches"}:${user?.id ?? "anonymous"}'));
  assert.ok(dashboard.includes("window.localStorage.getItem(heroCustomizationKey)"));
  assert.ok(dashboard.includes("window.localStorage.setItem(heroCustomizationKey"));
});

test("custom background image URLs require HTTPS and reject embedded credentials", () => {
  assert.ok(dashboard.includes('url.protocol !== "https:" || url.username || url.password'));
  assert.ok(dashboard.includes("أدخل رابط صورة آمن يبدأ بـ https://"));
});

test("welcome hero displays verified company and branch labels with safe fallback", () => {
  assert.ok(dashboard.includes("dashboard-active-company-name"));
  assert.ok(dashboard.includes("dashboard-active-branch-name"));
  assert.ok(dashboard.includes("companyNameQuery.isError"));
  assert.ok(dashboard.includes("branchNameQuery.isError"));
});

test("welcome customization preserves current ads, campaign targeting and deferred charts", () => {
  assert.ok(dashboard.includes('<AdPlacement placement="welcome"'));
  assert.ok(dashboard.includes('<AdPlacement placement="main"'));
  assert.ok(dashboard.includes("<DeferredDashboardCharts"));
  assert.ok(dashboard.includes("target_branch_ids"));
  assert.ok(dashboard.includes("prefers-reduced-motion"));
});
