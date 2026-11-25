import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261120030000_enforce_company_scope_marketing_reads.sql", import.meta.url), "utf8");
const priorScopeMigration = readFileSync(new URL("../supabase/migrations/20261119000006_company_scope_marketing_notifications.sql", import.meta.url), "utf8");
const dashboardPage = readFileSync(new URL("../src/routes/_authenticated/dashboard.tsx", import.meta.url), "utf8");
const posPage = readFileSync(new URL("../src/routes/_authenticated/pos.tsx", import.meta.url), "utf8");
const adsPage = readFileSync(new URL("../src/routes/_authenticated/ads.tsx", import.meta.url), "utf8");

test("marketing campaign reads remain tenant/company scoped", () => {
  assert.ok(migration.includes('DROP POLICY IF EXISTS "Tenant members read marketing campaigns"'));
  assert.ok(migration.includes("Tenant members read scoped marketing campaigns"));
  assert.ok(priorScopeMigration.includes("company_scope_marketing_campaigns_select"));
  assert.ok(priorScopeMigration.includes("company_id=marketing_campaigns.company_id"));
  assert.ok(priorScopeMigration.includes("is_super_owner"));
});

test("company-scoped administrators only query their own campaigns in the management UI", () => {
  assert.ok(adsPage.includes('queryKey: ["marketing-campaigns", tenantId, membership?.company_id ?? "tenant"]'));
  assert.ok(adsPage.includes('query = query.eq("company_id", membership.company_id)'));
  assert.ok(adsPage.includes("campaign.company_id === membership.company_id"));
});

test("dashboard and POS promotions are filtered to the active company and expose retry on query failure", () => {
  assert.ok(dashboardPage.includes('membership?.company_id ?? "tenant"'));
  assert.ok(dashboardPage.includes("company_id.is.null,company_id.eq."));
  assert.ok(dashboardPage.includes("campaignsQuery.isError"));
  assert.ok(dashboardPage.includes("campaignsQuery.refetch()"));
  assert.ok(posPage.includes('membership?.company_id ?? "tenant"'));
  assert.ok(posPage.includes("company_id.is.null,company_id.eq."));
  assert.ok(posPage.includes("posPromos.isError"));
  assert.ok(posPage.includes("posPromos.refetch()"));
});

test("marketing management action controls use granular permissions and retain company scope", () => {
  assert.ok(adsPage.includes('hasPermission("ads.view")'));
  assert.ok(adsPage.includes('hasPermission("ads.create")'));
  assert.ok(adsPage.includes('hasPermission("ads.edit")'));
  assert.ok(adsPage.includes('hasPermission("ads.approve")'));
  assert.ok(adsPage.includes('hasPermission("ads.delete")'));
  assert.ok(adsPage.includes("campaign.company_id === membership.company_id"));
});
