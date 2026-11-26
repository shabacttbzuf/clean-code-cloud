import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const hook = await readFile(new URL("../src/hooks/use-active-tenant.ts", import.meta.url), "utf8");
const topbar = await readFile(new URL("../src/routes/_authenticated/route.tsx", import.meta.url), "utf8");

test("company and branch options are derived from authenticated RLS queries and membership scope", () => {
  assert.match(hook, /from\("companies"\)[\s\S]*?eq\("tenant_id", activeId\)/);
  assert.match(hook, /companyMembershipIds/);
  assert.match(hook, /from\("branches"\)[\s\S]*?eq\("tenant_id", activeId\)/);
  assert.match(hook, /eq\("company_id", activeCompanyId\)/);
});

test("company and branch selections are validated against authorized option lists", () => {
  assert.match(hook, /companyOptions\.some\(\(item\) => item\.id === companyId\)/);
  assert.match(hook, /branchOptions\.some\(\(item\) => item\.id === id\)/);
  assert.match(hook, /canSelectAll = isSuperOwner \|\| \(!membership\?\.branch_id && \["owner", "manager", "accountant"\]/);
});

test("authorization fails closed and never grants cached offline super-owner or permissions state", () => {
  assert.match(hook, /Privileged status must never be inferred from an offline\/stale cache/);
  assert.match(hook, /Authorization decisions fail closed; cached offline permissions are not grants/);
  assert.doesNotMatch(hook, /auth-super-owner:v1/);
  assert.doesNotMatch(hook, /auth-permissions:v1/);
});

test("switching company, branch or tenant removes tenant-scoped cached records", () => {
  assert.match(hook, /queryClient\.clear\(\)/);
  assert.match(hook, /queryClient\.removeQueries/);
  assert.match(hook, /setCompanySelection\(\{ scope: null/);
  assert.match(hook, /setBranchSelection\(\{ scope: null/);
});

test("top bar exposes company and branch selectors with loading and error states", () => {
  assert.match(topbar, /اختيار الفرع/);
  assert.match(topbar, /نطاق الشركة/);
  assert.match(topbar, /switchCompany\(/);
  assert.match(topbar, /switchBranch\(/);
  assert.match(topbar, /companyError/);
  assert.match(topbar, /branchLoading/);
});
