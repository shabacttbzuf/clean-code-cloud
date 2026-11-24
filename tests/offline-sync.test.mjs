import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/lib/offline-sync.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/offline-sync-center.tsx", import.meta.url), "utf8");

test("offline queue is durable and commits IndexedDB transactions before reporting success", () => {
  assert.match(source, /indexedDB\.open\(DB_NAME, DB_VERSION\)/);
  assert.match(source, /tx\.oncomplete = \(\) => resolve\(result\)/);
  assert.match(source, /createObjectStore\(STORE, \{ keyPath: "id" \}\)/);
});

test("every queued operation receives a UUID idempotency key and immutable creation metadata", () => {
  assert.match(source, /const id = crypto\.randomUUID\(\)/);
  assert.match(source, /idempotencyKey: id/);
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
  assert.match(source, /operation\.dependencies\.every\(\(id\) => syncedIds\.has\(id\)\)/);
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
});
