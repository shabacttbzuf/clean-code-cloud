import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261115000005_company_branch_creator_isolation.sql", import.meta.url), "utf8");
const companyRls = readFileSync(new URL("../supabase/migrations/20261115000006_enforce_company_branch_rls.sql", import.meta.url), "utf8");
const branches = readFileSync(new URL("../src/routes/_authenticated/branches.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/hooks/use-active-tenant.ts", import.meta.url), "utf8");

test("branches require a tenant-consistent company and preserve legacy records", () => {
  assert.match(migration, /branches_company_id_fkey/);
  assert.match(migration, /Select the company that owns this branch/);
  assert.match(migration, /having count\(\*\) = 1/);
});

test("branch and company RLS is company-aware while preserving platform-owner access", () => {
  assert.match(migration, /private\.can_access_branch/);
  assert.match(companyRls, /company_scope_branches_select/);
  assert.match(companyRls, /company_scope_companies_select/);
  assert.match(companyRls, /public\.super_owners/);
});

test("branch creation UI submits the selected company", () => {
  assert.match(branches, /الشركة التابعة للفرع/);
  assert.match(branches, /company_id: companyId/);
  assert.match(hook, /company_id, custom_role_id/);
});
