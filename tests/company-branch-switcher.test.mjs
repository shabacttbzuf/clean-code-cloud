import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const hook = readFileSync(new URL("../src/hooks/use-active-tenant.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/routes/_authenticated/route.tsx", import.meta.url), "utf8");

test("company choices are constrained to active tenant and authenticated memberships", () => {
  assert.match(hook, /from\("companies"\)\.select\("id,name"\)\.eq\("tenant_id", activeId\)/);
  assert.match(hook, /query\.in\("id", companyMembershipIds\)/);
  assert.match(hook, /item\.company_id === null && item\.branch_id === null/);
});

test("branch-bound memberships can only read their assigned branch", () => {
  assert.match(hook, /if \(membership\.branch_id\) \{[\s\S]{0,260}query = query\.eq\("id", membership\.branch_id\)/);
  assert.match(hook, /const nextBranchId = membership\.branch_id[\s\S]{0,180}\? membership\.branch_id/);
  assert.match(hook, /if \(membership\?\.branch_id && id !== membership\.branch_id\) return/);
  assert.match(hook, /!membership\.branch_id && \(isSuperOwner \|\| \["owner", "manager", "accountant"\]/);
});

test("scope switching validates choices and clears tenant-scoped query state", () => {
  assert.match(hook, /companyOptions\.some\(\(item\) => item\.id === companyId\)/);
  assert.match(hook, /branchOptions\.some\(\(item\) => item\.id === id\)/);
  assert.match(hook, /function switchCompany[\s\S]{0,700}queryClient\.clear\(\)/);
  assert.match(hook, /function switchBranch[\s\S]{0,700}queryClient\.clear\(\)/);
  assert.match(hook, /function switchTenant[\s\S]{0,700}queryClient\.clear\(\)/);
});

test("authenticated top bar exposes explicit company and branch scope controls", () => {
  assert.match(route, /اختيار الشركة/);
  assert.match(route, /نطاق الشركة/);
  assert.match(route, /اختيار الفرع/);
  assert.match(route, /نطاق الفرع/);
  assert.match(route, /companyOptions\.map/);
  assert.match(route, /branchOptions\.map/);
  assert.match(route, /item\.company_id === null && item\.branch_id === null/);
});
