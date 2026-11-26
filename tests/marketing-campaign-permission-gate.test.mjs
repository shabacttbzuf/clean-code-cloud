import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/routes/_authenticated/ads.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261121010000_separate_ads_management_permission.sql", import.meta.url), "utf8");
const repairMigration = readFileSync(new URL("../supabase/migrations/20261121040000_reconcile_ads_campaign_write_permissions.sql", import.meta.url), "utf8");

test("marketing UI uses distinct view, create, edit, approve and delete permissions", () => {
  for (const action of ["view", "create", "edit", "approve", "delete"]) {
    assert.match(source, new RegExp(`hasPermission\\("ads\\.${action}"\\)`));
  }
  assert.match(source, /if \(!canApproveAds\)/);
  assert.match(source, /if \(!canDeleteAds\)/);
  assert.match(source, /if \(editingId \? !canEditAds : !canCreateAds\)/);
  assert.doesNotMatch(source, /settings\.manage/);
});

test("tenant-wide and Super Owner management remain explicit while campaign actions stay company-scoped", () => {
  assert.match(source, /const isTenantOwner = role === "owner" && !membership\?\.company_id/);
  assert.match(source, /if \(!isSuperOwner && !isTenantOwner\)[\s\S]*query = query\.eq\("company_id", membership\.company_id\)/);
  assert.match(source, /\.update\(payload\)\s*\.eq\("id", editingId \?\? ""\)\s*\.eq\("tenant_id", tenantId!\)/);
});

test("campaign ordering and draft preview are available without bypassing the save flow", () => {
  assert.match(source, /sort_order: normalizedSortOrder/);
  assert.ok(source.includes("Number.isInteger(normalizedSortOrder)"));
  assert.ok(source.includes("setSortOrder(String(campaign.sort_order ?? 0))"));
  assert.match(source, /معاينة الإعلان/);
  assert.match(source, /aria-label="معاينة الإعلان"/);
});

test("database grants dedicated ads permission without changing company-scope boundaries", () => {
  assert.match(migration, /INSERT INTO public\.permissions[\s\S]*'ads\.manage'/);
  assert.match(migration, /'ads\.manage'\)/);
  assert.match(migration, /company_scope_marketing_campaigns_insert/);
  assert.match(migration, /company_scope_marketing_campaigns_update/);
  assert.match(migration, /company_scope_marketing_campaigns_delete/);
  assert.doesNotMatch(migration, /DROP POLICY IF EXISTS company_scope_marketing_campaigns_select/);
});

test("follow-up migration reconciles ads.manage writes without weakening company isolation", () => {
  assert.ok(repairMigration.includes("'ads.manage'"));
  assert.match(repairMigration, /company_scope_marketing_campaigns_insert/);
  assert.match(repairMigration, /company_scope_marketing_campaigns_update/);
  assert.match(repairMigration, /company_scope_marketing_campaigns_delete/);
  assert.match(repairMigration, /FOR INSERT TO authenticated/);
  assert.match(repairMigration, /FOR UPDATE TO authenticated/);
  assert.match(repairMigration, /FOR DELETE TO authenticated/);
  assert.doesNotMatch(repairMigration, /DROP POLICY IF EXISTS company_scope_marketing_campaigns_select/);
  assert.match(source, /created_by: userId/);
  assert.match(source, /select\("id"\)\.single\(\)/);
  assert.match(source, /Marketing campaign RLS failure/);
});
