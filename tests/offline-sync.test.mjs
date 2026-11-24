import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/lib/offline-sync.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/offline-sync-center.tsx", import.meta.url), "utf8");
const handlers = readFileSync(new URL("../src/lib/offline-handlers.ts", import.meta.url), "utf8");
const kitchen = readFileSync(new URL("../src/routes/_authenticated/kitchen.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261125000100_offline_sync_kitchen_idempotency.sql", import.meta.url), "utf8");

test("offline queue is durable and commits IndexedDB transactions before reporting success", () => {
  assert.match(source, /indexedDB\.open\(DB_NAME, DB_VERSION\)/);
  assert.match(source, /tx\.oncomplete = \(\) => resolve\(result\)/);
  assert.match(source, /createObjectStore\(STORE, \{ keyPath: "id" \}\)/);
});

test("every queued operation receives a UUID idempotency key and immutable creation metadata", () => {
  assert.match(source, /const id = crypto\.randomUUID\(\)/);
  assert.match(source, /idempotencyKey: idempotencyKey \?\? id/);
  assert.match(source, /createdAt: now/);
  assert.match(source, /userId: string/);
  assert.match(source, /tenantId: string/);
  assert.match(source, /branchId: string \| null/);
  assert.match(source, /companyId: string \| null/);
});

test("financial and stock-ledger mutations are explicitly blocked from generic offline queueing", () => {
  for (const type of ["invoice", "sale", "payment", "refund", "return", "inventory_deduction", "stock_adjustment", "purchase_receipt", "cash_movement", "payroll"]) {
    assert.ok(source.includes(`"${type}"`), `missing guard for ${type}`);
  }
  assert.match(source, /FINANCIAL_TYPES\.has\(type\) \|\| !handlers\.has\(type\)/);
});

test("sync preserves dependency order, isolates active tenant/branch/company and records partial failures", () => {
  assert.match(source, /candidate\.dependencies\.every\(\(id\) => syncedIds\.has\(id\)\)/);
  assert.match(source, /row\.scope\.tenantId === scope\.tenantId/);
  assert.match(source, /row\.scope\.branchId === scope\.branchId/);
  assert.match(source, /row\.scope\.companyId === scope\.companyId/);
  assert.match(source, /operation\.status = "conflict"/);
  assert.match(source, /operation\.status = "failed"/);
  assert.match(source, /nextRetryAt/);
});

test("automatic sync listens for restored connectivity and periodically probes reachability", () => {
  assert.match(source, /window\.addEventListener\("online", run\)/);
  assert.match(source, /window\.setInterval\(run, 30_000\)/);
  assert.match(panel, /window\.addEventListener\("offline", onOffline\)/);
  assert.match(panel, /window\.addEventListener\("online", onOnline\)/);
});

test("workspace panel shows queued, failed, conflict and last-sync state", () => {
  assert.match(panel, /معلّق/);
  assert.match(panel, /فاشل/);
  assert.match(panel, /تعارض/);
  assert.match(panel, /آخر مزامنة/);
  assert.match(panel, /مزامنة الآن/);
  assert.match(panel, /تفاصيل العمليات المحفوظة محلياً/);
  assert.match(panel, /تعارض — يتطلب مراجعة/);
});

test("identical pending requests are deduplicated before a second operation id is created", () => {
  assert.match(source, /const duplicate = existing\.find/);
  assert.match(source, /JSON\.stringify\(item\.payload\) === payloadKey/);
});

test("cross-tab workers claim operations through an IndexedDB lease", () => {
  assert.match(source, /async function claimOperation/);
  assert.match(source, /leaseExpiresAt/);
  assert.match(source, /store\.put\(current\)/);
  assert.match(source, /const syncPromises = new Map/);
});

test("only the non-financial kitchen workflow is registered as offline-safe", () => {
  assert.match(handlers, /registerOfflineHandler\("kitchen_status"/);
  assert.match(handlers, /idempotentServerSide: true/);
  assert.match(source, /handler\.idempotentServerSide !== true/);
  assert.match(handlers, /set_kitchen_order_status_idempotent/);
  assert.match(handlers, /auth\.uid\(\)/);
  assert.match(kitchen, /enqueueOfflineOperation\(/);
  assert.match(kitchen, /navigator\.onLine/);
  assert.match(kitchen, /const idempotencyKey = crypto\.randomUUID\(\)/);\n  assert.match(kitchen, /_idempotency_key: idempotencyKey/);
});

test("kitchen replay RPC persists idempotency and rechecks permission and branch access", () => {
  assert.match(migration, /PRIMARY KEY \(tenant_id, actor_id, idempotency_key\)/);
  assert.match(migration, /ON CONFLICT \(tenant_id,actor_id,idempotency_key\) DO NOTHING/);
  assert.match(migration, /private\.has_permission\(v_actor,v_order\.tenant_id,'kitchen\.manage'\)/);
  assert.match(migration, /private\.can_access_branch\(v_actor,v_order\.tenant_id,v_order\.branch_id\)/);
  assert.match(migration, /SET result=to_jsonb\(v_updated\)/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.set_kitchen_order_status_idempotent/);
  assert.match(migration, /REVOKE ALL ON TABLE private\.kitchen_order_sync_requests FROM PUBLIC, anon, authenticated/);
});
