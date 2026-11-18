import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261119000002_scope_customer_payment_idempotency.sql", import.meta.url),
  "utf8",
);

test("idempotent payment replay is restricted to the original actor and sale", () => {
  assert.match(migration, /v_existing\.created_by\s+is distinct from auth\.uid\(\)/i);
  assert.match(migration, /v_existing\.sale_id\s+is distinct from _sale_id/i);
  assert.match(migration, /private\.can_access_branch\(auth\.uid\(\),\s*_tenant_id,\s*v_existing\.branch_id\)/i);
});

test("same-context retry remains idempotent and does not create a second payment", () => {
  assert.match(migration, /if found then[\s\S]*?return v_existing;[\s\S]*?end if;/i);
  assert.equal((migration.match(/insert into public\.customer_payments/gi) ?? []).length, 1);
});

test("payment RPC remains authenticated-only and keeps a fixed search path", () => {
  assert.match(migration, /security definer\s+set search_path = pg_catalog, public, private, pg_temp/i);
  assert.match(migration, /revoke all on function public\.record_customer_payment[\s\S]*from public,anon/i);
  assert.match(migration, /grant execute on function public\.record_customer_payment[\s\S]*to authenticated,service_role/i);
});
