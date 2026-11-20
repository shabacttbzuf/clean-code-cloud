import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261120030000_enforce_company_scope_marketing_reads.sql", import.meta.url),
  "utf8",
);
const priorScopeMigration = readFileSync(
  new URL("../supabase/migrations/20261119000006_company_scope_marketing_notifications.sql", import.meta.url),
  "utf8",
);
const dashboardPage = readFileSync(\n  new URL("../src/routes/_authenticated/dashboard.tsx", import.meta.url),\n  "utf8",\n);\nconst posPage = readFileSync(\n  new URL("../src/routes/_authenticated/pos.tsx", import.meta.url),\n  "utf8",\n);\nconst settingsPage = readFileSync(
  new URL("../src/routes/_authenticated/settings.tsx", import.meta.url),
  "utf8",
);

test("marketing campaign reads no longer have a permissive tenant-wide SELECT policy", () => {
  assert.match(migration, /DROP POLICY IF EXISTS "Tenant members read marketing campaigns"/);
  assert.match(migration, /ON public\.marketing_campaigns/);
  assert.match(priorScopeMigration, /company_scope_marketing_campaigns_select/);
  assert.match(priorScopeMigration, /company_id=marketing_campaigns\.company_id/);
  assert.match(priorScopeMigration, /is_super_owner/);
});

test("company-scoped administrators only query their own campaigns in the management UI", () => {
  assert.match(settingsPage, /queryKey: \["marketing-campaigns", tenantId, membership\?\.company_id \?\? "tenant"\]/);
  assert.match(settingsPage, /if \(!isSuperOwner && !isTenantOwner\)\s*\{\s*if \(!membership\?\.company_id\) return \[\];\s*query = query\.eq\("company_id", membership\.company_id\);/);
});

test("dashboard and POS promotions are filtered to the active company and expose retry on query failure", () => {
  assert.match(dashboardPage, /membership\?\.company_id \?\? "tenant"/);
  assert.match(dashboardPage, /company_id\.is\.null,company_id\.eq\./);
  assert.match(dashboardPage, /campaignsQuery\.isError/);
  assert.match(dashboardPage, /campaignsQuery\.refetch\(\)/);
  assert.match(posPage, /membership\?\.company_id \?\? "tenant"/);
  assert.match(posPage, /company_id\.is\.null,company_id\.eq\./);
  assert.match(posPage, /posPromos\.isError/);
  assert.match(posPage, /posPromos\.refetch\(\)/);
});
