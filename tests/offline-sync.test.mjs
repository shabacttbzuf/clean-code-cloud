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
  assert.match(source, /isFinancialOrInventoryOperation\(type\) \|\| !handlers\.has\(type\)/);
  assert.match(source, /BLOCKED_OPERATION_PATTERN/);
  assert.match(source, /pos\|checkout\|sale\|sales\|invoice/);
});

test("sync preserves dependency order, isolates active tenant/branch/company and records partial failures", () => {
  assert.match(source, /candidate\.dependencies\.every\(\(id\) => syncedIds\.has\(id\)\)/);
  assert.match(source, /row\.scope\.tenantId === scope\.tenantId/);
  assert.match(source, /row\.scope\.branchId === scope\.branchId/);
  assert.match(source, /row\.scope\.companyId === scope\.companyId/);
  assert.match(source, /const isConflict = \/conflict\|version\|stale\|تعارض\/i\.test\(message\)/);
  assert.match(source, /MAX_AUTOMATIC_ATTEMPTS = 12/);
  assert.match(source, /isPermanentFailure\(error\)/);
  assert.match(source, /operation\.status = isConflict \? "conflict" : isPermanent \? "blocked" : "failed"/);
  assert.match(source, /operation\.status = "failed"/);
  assert.match(source, /nextRetryAt/);
});

test("queued operations cannot replay under a different signed-in user", () => {
  assert.match(handlers, /supabase\.auth\.getUser\(\)/);
  assert.match(handlers, /authData\.user\.id !== operation\.scope\.userId/);
  assert.match(handlers, /_expected_actor_id: operation\.scope\.userId/);
  assert.match(migration, /_expected_actor_id IS DISTINCT FROM v_actor/);
  assert.match(handlers, /تغير المستخدم المسجل/);
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
  assert.match(panel, /متوقف نهائياً/);
  assert.match(panel, /تعارض/);
  assert.match(panel, /آخر مزامنة/);
  assert.match(panel, /مزامنة الآن/);
  assert.match(panel, /تفاصيل العمليات المحفوظة محلياً/);
  assert.match(panel, /تعارض — يتطلب مراجعة/);
});

test("identical pending requests are deduplicated atomically and key collisions are rejected", () => {
  assert.match(source, /const duplicate = rows\\.find/);
  assert.match(source, /const sameKey = rows\\.find/);
  assert.match(source, /validationError = new Error/);
  assert.match(source, /db\\.transaction\\(\\[STORE\\], "readwrite"\\)/);
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
  assert.match(handlers, /supabase\.auth\.getUser\(\)/);
  assert.match(handlers, /authData\.user\.id !== operation\.scope\.userId/);
  assert.match(handlers, /تغير المستخدم المسجل/);
  assert.match(handlers, /auth\.uid\(\)/);
  assert.match(kitchen, /enqueueOfflineOperation\(/);
  assert.match(kitchen, /navigator\.onLine/);
  assert.match(kitchen, /const idempotencyKey = crypto\.randomUUID\(\)/);
  assert.match(kitchen, /_idempotency_key: idempotencyKey/);
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

test("scope matching is exact, including null company and selected branch", () => {
  assert.match(source, /row\.scope\.branchId === scope\.branchId/);
  assert.match(source, /row\.scope\.companyId === scope\.companyId/);
  assert.match(source, /!sameScope\(current\.scope, scope\)/);
  assert.match(source, /يجب تحديد الفرع صراحةً/);
});

test("idempotency-key collisions and IndexedDB quota failures are handled explicitly", () => {
  assert.match(source, /QuotaExceededError/);
  assert.match(source, /sameScope/);
  assert.match(source, /idempotencyKey/);
});

test("permanent failures stop automatic retry and remain manually re-evaluable", () => {
  assert.match(source, /MAX_AUTOMATIC_ATTEMPTS = 12/);
  assert.match(source, /status = isConflict \? "conflict" : isPermanent \? "blocked" : "failed"/);
  assert.match(source, /operation\.status !== "blocked"/);
  assert.match(panel, /blocked/);
});
