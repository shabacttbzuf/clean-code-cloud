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

test("marketing campaign reads no longer have a permissive tenant-wide SELECT policy", () => {
  assert.match(migration, /DROP POLICY IF EXISTS "Tenant members read marketing campaigns"/);
  assert.match(migration, /ON public\.marketing_campaigns/);
  assert.match(priorScopeMigration, /company_scope_marketing_campaigns_select/);
  assert.match(priorScopeMigration, /company_id=marketing_campaigns\.company_id/);
  assert.match(priorScopeMigration, /private\.is_super_owner/);
});
