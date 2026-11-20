import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ads = readFileSync(new URL("../src/routes/_authenticated/ads.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../src/routes/_authenticated/settings.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../src/components/app-sidebar.tsx", import.meta.url), "utf8");
const workspaceTabs = readFileSync(new URL("../src/components/workspace-tabs.tsx", import.meta.url), "utf8");

test("advertising management is a dedicated authenticated route", () => {
  assert.match(ads, /createFileRoute\("\/_authenticated\/ads"\)/);
  assert.match(sidebar, /title: "الإعلانات", url: "\/ads"/);
  assert.match(workspaceTabs, /\["\/ads", "الإعلانات"\]/);
});

test("advertising management preserves tenant and company scope and permission checks", () => {
  assert.match(ads, /get_my_permissions/);
  assert.match(ads, /settings\.manage/);
  assert.match(ads, /\.eq\("tenant_id", tenantId!\)/);
  assert.match(ads, /\.eq\("company_id", membership\.company_id\)/);
});

test("campaign creation, image upload, scheduling, activation and pause remain available", () => {
  for (const feature of ["saveCampaign", "uploadImage", "starts_at", "ends_at", "updateStatus", "deleteCampaign", "restaurant-assets"]) {
    assert.ok(ads.includes(feature), "missing advertising capability: " + feature);
  }
});

test("system settings no longer contains advertising campaign management", () => {
  assert.doesNotMatch(settings, /marketing-campaigns|campaignCreate|campaignDelete|إدارة العروض والإعلانات/);
  assert.match(settings, /إعدادات الشركة|إعدادات النظام|استوديو تطوير/);
});
