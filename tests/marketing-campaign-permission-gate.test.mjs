import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/routes/_authenticated/ads.tsx", import.meta.url), "utf8");
const legacyMigration = readFileSync(new URL("../supabase/migrations/20261121010000_separate_ads_management_permission.sql", import.meta.url), "utf8");
const granularMigration = readFileSync(new URL("../supabase/migrations/20261125010000_granular_section_action_permissions.sql", import.meta.url), "utf8");
const alignmentMigration = readFileSync(new URL("../supabase/migrations/20261125020000_granular_marketing_rls_alignment.sql", import.meta.url), "utf8");

test("advertising UI separates view, create, edit, approve and delete capabilities", () => {
  for (const key of ["ads.view", "ads.create", "ads.edit", "ads.approve", "ads.delete"]) {
    assert.ok(source.includes('hasPermission("' + key + '")'), "missing UI gate: " + key);
  }
  assert.ok(source.includes("if (editingId ? !canEditAds : !canCreateAds)"));
  assert.ok(source.includes("if (!canApproveAds)"));
  assert.ok(source.includes("if (!canDeleteAds)"));
});

test("legacy ads.manage permission remains backward compatible", () => {
  assert.ok(legacyMigration.includes("VALUES ('ads.manage'"));
  assert.ok(granularMigration.includes("'ads.manage'"));
  assert.ok(source.includes('hasPermission("ads.manage")'));
});

test("campaign action RLS and trigger checks are enforced without weakening company scope", () => {
  for (const key of ["ads.create", "ads.edit", "ads.approve", "ads.delete"]) {
    assert.ok(alignmentMigration.includes("'" + key + "'"), "missing database action gate: " + key);
    assert.ok(granularMigration.includes("'" + key + "'"), "missing trigger action gate: " + key);
  }
  for (const name of ["company_scope_marketing_campaigns_insert", "company_scope_marketing_campaigns_update", "company_scope_marketing_campaigns_delete"]) {
    assert.ok(alignmentMigration.includes(name));
  }
  assert.ok(alignmentMigration.includes("AS RESTRICTIVE FOR INSERT TO authenticated"));
  assert.ok(alignmentMigration.includes("AS RESTRICTIVE FOR UPDATE TO authenticated"));
  assert.ok(alignmentMigration.includes("AS RESTRICTIVE FOR DELETE TO authenticated"));
  assert.ok(source.includes("company_id: editingId ? editingCompanyId"));
  assert.ok(source.includes('query = query.eq("company_id", membership.company_id)'));
});
