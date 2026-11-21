import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/routes/_authenticated/ads.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261121010000_separate_ads_management_permission.sql", import.meta.url), "utf8");

test("company-scoped marketing controls require the dedicated ads.manage permission", () => {
  assert.match(source, /permissions = useQuery/);
  assert.match(source, /supabase\.rpc\("get_my_permissions", \{ _tenant_id: tenantId \}\)/);
  assert.match(source, /permissions\.data\?\.includes\("ads\.manage"\) === true/);
  assert.doesNotMatch(source, /permissions\.data\?\.includes\("settings\.manage"\)/);
});

test("tenant-wide and Super Owner management remain explicit while campaign actions stay company-scoped", () => {
  assert.match(source, /const isTenantOwner = role === "owner" && !membership\?\.company_id/);
  assert.match(source, /if \(!isSuperOwner && !isTenantOwner\)[\s\S]*query = query\.eq\("company_id", membership\.company_id\)/);
  assert.match(source, /\.update\(payload\)\.eq\("id", editingId\)\.eq\("tenant_id", tenantId!\)/);
});

test("database grants dedicated ads permission without changing company-scope boundaries", () => {
  assert.match(migration, /INSERT INTO public\.permissions[\s\S]*'ads\.manage'/);
  assert.match(migration, /'ads\.manage'\)/);
  assert.match(migration, /company_scope_marketing_campaigns_insert/);
  assert.match(migration, /company_scope_marketing_campaigns_update/);
  assert.match(migration, /company_scope_marketing_campaigns_delete/);
  assert.doesNotMatch(migration, /DROP POLICY IF EXISTS company_scope_marketing_campaigns_select/);
});
