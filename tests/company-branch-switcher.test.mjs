import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/hooks/use-active-tenant.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/routes/_authenticated/route.tsx", import.meta.url), "utf8");

test("company choices are constrained to the active tenant and authenticated memberships", () => {
  assert.match(hook, /from\("companies"\)\.select\("id,name"\)\.eq\("tenant_id", activeId\)/);
  assert.match(hook, /query\.in\("id", companyMembershipIds\)/);
  assert.match(hook, /hasTenantWideMembership/);
  assert.match(hook, /ras-active-company:" \+ user\.id \+ ":" \+ activeId/);
});

test("branch choices are constrained by active tenant, company, and RLS", () => {
  assert.match(hook, /from\("branches"\)\.select\("id,name,company_id"\)\.eq\("tenant_id", activeId\)/);
  assert.match(hook, /query\.eq\("company_id", activeCompanyId\)/);
  assert.match(hook, /branches\.view/);
  assert.match(hook, /ras-active-branch:" \+ branchScopeKey/);
});

test("scope changes clear cached records and validate every selected company or branch", () => {
  assert.match(hook, /companyOptions\.some\(\(item\) => item\.id === companyId\)/);
  assert.match(hook, /branchOptions\.some\(\(item\) => item\.id === id\)/);
  assert.match(hook, /function switchCompany[\\s\\S]{0,900}removeActiveScopeQueries\\(\\)/);\n  assert.match(hook, /function switchBranch[\\s\\S]{0,900}removeActiveScopeQueries\\(\\)/);\n  assert.match(hook, /function switchTenant[\\s\\S]{0,900}removeActiveScopeQueries\\(\\)/);
});

test("authenticated top bar exposes company and branch scope selectors", () => {
  assert.match(route, /اختيار الشركة/);
  assert.match(route, /نطاق الشركة/);
  assert.match(route, /اختيار الفرع/);
  assert.match(route, /نطاق الفرع/);
  assert.match(route, /companyOptions\.map/);
  assert.match(route, /branchOptions\.map/);
});


test("branch-only memberships cannot select all companies or all branches even with owner-like roles", () => {
  assert.match(hook, /item\.company_id === null && item\.branch_id === null/);
  assert.match(hook, /!membership\.branch_id && \["owner", "manager", "accountant"\]/);
  assert.match(route, /item\.company_id === null && item\.branch_id === null/);
});


test("branch-bound memberships cannot enumerate or switch to sibling branches", () => {
  assert.match(hook, /if \(membership\.branch_id\) \{[\s\S]{0,260}query = query\.eq\("id", membership\.branch_id\)/);
  assert.match(hook, /const nextBranchId = membership\.branch_id[\s\S]{0,180}\? membership\.branch_id/);
  assert.match(hook, /if \(membership\?\.branch_id && id !== membership\.branch_id\) return/);
});
