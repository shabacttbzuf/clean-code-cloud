import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/routes/_authenticated/settings.tsx", import.meta.url), "utf8");

test("marketing campaign management requests only the active company for company-scoped admins", () => {
  assert.match(source, /queryKey: \["marketing-campaigns", tenantId, membership\?\.company_id \?\? "tenant"\]/);
  assert.match(source, /if \(!isSuperOwner && !isTenantOwner\)\s*\{\s*if \(!membership\?\.company_id\) return \[\];\s*query = query\.eq\("company_id", membership\.company_id\);/);
});
