import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/routes/_authenticated/settings.tsx", import.meta.url), "utf8");

test("company-scoped marketing controls require the same settings.manage permission enforced by RLS", () => {
  assert.match(source, /marketingPermissions = useQuery/);
  assert.match(source, /supabase\.rpc\("get_my_permissions", \{ _tenant_id: tenantId \}\)/);
  assert.match(source, /marketingPermissions\.data\?\.includes\("settings\.manage"\) === true/);
});

test("tenant-wide and Super Owner management remain explicit while campaign actions stay company-scoped", () => {
  assert.match(source, /const isTenantOwner = role === "owner" && !membership\?\.company_id/);
  assert.match(source, /isSuperOwner \|\|\s*isTenantOwner \|\|\s*\(canManageMarketing && !!membership\?\.company_id && membership\.company_id === campaign\.company_id\)/);
});
