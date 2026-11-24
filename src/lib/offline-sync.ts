/**
 * Durable browser offline queue.
 *
 * Only explicitly registered, non-financial handlers may be queued. Financial,
 * inventory-ledger, payment, invoice and refund writes remain online-only until
 * their database RPCs accept and persist an idempotency key transactionally.
 */
export type OfflineOperationStatus =
  | "pending"
  | "processing"
  | "failed"
  | "conflict"
  | "synced";

export type OfflineScope = {
  userId: string;
  tenantId: string;
  branchId: string | null;
  companyId: string | null;
};

export type OfflineOperation = {
  id: string;
  idempotencyKey: string;
  type: string;
  payload: Record<string, unknown>;
  scope: OfflineScope;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  status: OfflineOperationStatus;
  dependencies: string[];
  lastError: string | null;
  syncedAt: string | null;
  nextRetryAt: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
};

export type OfflineHandler = {
  /** Must be true only for a locally safe, non-ledger operation. */
  offlineSafe: true;
  /** Server call must persist idempotencyKey atomically with its mutation. */
  send: (operation: OfflineOperation) => Promise<void>;
};

const DB_NAME = "restaurant-offline-sync";
const DB_VERSION = 1;
const STORE = "operations";
const META = "metadata";
const FINANCIAL_TYPES = new Set([
  "invoice", "sale", "payment", "refund", "return", "inventory_deduction",
  "stock_adjustment", "purchase_receipt", "cash_movement", "payroll",
]);
const handlers = new Map<string, OfflineHandler>();
const syncPromises = new Map<string, Promise<void>>();
const workerId = typeof crypto !== "undefined" ? crypto.randomUUID() : "server-render";
const LEASE_MS = 120_000;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("التخزين المحلي غير متاح في هذا المتصفح."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("status", "status");
        store.createIndex("createdAt", "createdAt");
        store.createIndex("scope", ["scope.userId", "scope.tenantId", "scope.branchId"]);
      }
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("تعذر فتح قاعدة البيانات المحلية."));
  });
}

async function transaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      const request = run(tx);
      let result!: T;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? new Error("فشلت العملية المحلية."));
      tx.onabort = () => reject(tx.error ?? new Error("تم إلغاء العملية المحلية."));
    });
  } finally {
    db.close();
  }
}

function notifyQueueChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("offline-sync:changed"));
  }
}

export function registerOfflineHandler(type: string, handler: OfflineHandler) {
  if (!type.trim() || FINANCIAL_TYPES.has(type)) {
    throw new Error("هذا النوع من العمليات لا يسمح بتسجيله للمزامنة دون اتصال.");
  }
  if (handler.offlineSafe !== true) throw new Error("يجب تأكيد أن العملية آمنة للعمل دون اتصال.");
  handlers.set(type, handler);
  return () => handlers.delete(type);
}

export async function enqueueOfflineOperation(
  type: string,
  payload: Record<string, unknown>,
  scope: OfflineScope,
  dependencies: string[] = [],
): Promise<OfflineOperation> {
  if (FINANCIAL_TYPES.has(type) || !handlers.has(type)) {
    throw new Error("هذه العملية تتطلب اتصالاً بالخادم ولا يمكن حفظها كعملية قابلة للإرسال.");
  }
  if (!scope.userId || !scope.tenantId) throw new Error("تعذر تحديد المستخدم والمؤسسة للعملية.");
  const existing = await listOfflineOperations(scope);
  const payloadKey = JSON.stringify(payload);
  const duplicate = existing.find((item) =>
    item.type === type &&
    item.status !== "synced" &&
    item.status !== "conflict" &&
    JSON.stringify(item.payload) === payloadKey
  );
  if (duplicate) return duplicate;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const operation: OfflineOperation = {
    id,
    idempotencyKey: id,
    type,
    payload: structuredClone(payload),
    scope: { ...scope },
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    status: "pending",
    dependencies: [...new Set(dependencies)],
    lastError: null,
    syncedAt: null,
    nextRetryAt: null,
    leaseOwner: null,
    leaseExpiresAt: null,
  };
  await transaction([STORE], "readwrite", (tx) => tx.objectStore(STORE).add(operation));
  notifyQueueChanged();
  return operation;
}

export async function listOfflineOperations(scope?: OfflineScope): Promise<OfflineOperation[]> {
  const rows = await transaction<OfflineOperation[]>([STORE], "readonly", (tx) =>
    tx.objectStore(STORE).getAll(),
  );
  return rows
    .filter((row) => !scope || (
      row.scope.userId === scope.userId &&
      row.scope.tenantId === scope.tenantId &&
      (scope.branchId === null || row.scope.branchId === scope.branchId) &&
      (scope.companyId === null || row.scope.companyId === scope.companyId)
    ))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function saveOperation(operation: OfflineOperation) {
  operation.updatedAt = new Date().toISOString();
  await transaction([STORE], "readwrite", (tx) => tx.objectStore(STORE).put(operation));
  notifyQueueChanged();
}

export async function getLastOfflineSyncAt(scope: OfflineScope): Promise<string | null> {
  const key = `lastSuccessfulSyncAt:${scope.userId}:${scope.tenantId}:${scope.branchId ?? "all"}:${scope.companyId ?? "none"}`;
  return (await transaction<string | undefined>([META], "readonly", (tx) =>
    tx.objectStore(META).get(key),
  )) ?? null;
}

async function claimOperation(id: string): Promise<OfflineOperation | null> {
  const db = await openDb();
  try {
    return await new Promise<OfflineOperation | null>((resolve, reject) => {
      const tx = db.transaction([STORE], "readwrite");
      const store = tx.objectStore(STORE);
      const request = store.get(id);
      let claimed: OfflineOperation | null = null;
      request.onsuccess = () => {
        const current = request.result as OfflineOperation | undefined;
        if (!current || current.status === "synced" || current.status === "conflict") return;
        const now = Date.now();
        if (current.leaseExpiresAt && new Date(current.leaseExpiresAt).getTime() > now && current.leaseOwner !== workerId) return;
        if (current.nextRetryAt && new Date(current.nextRetryAt).getTime() > now) return;
        current.status = "processing";
        current.attempts += 1;
        current.leaseOwner = workerId;
        current.leaseExpiresAt = new Date(now + LEASE_MS).toISOString();
        current.updatedAt = new Date(now).toISOString();
        store.put(current);
        claimed = current;
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve(claimed);
      tx.onerror = () => reject(tx.error ?? new Error("تعذر حجز العملية للمزامنة."));
      tx.onabort = () => reject(tx.error ?? new Error("تم إلغاء حجز العملية."));
    });
  } finally {
    db.close();
  }
}

function releaseLease(operation: OfflineOperation) {
  operation.leaseOwner = null;
  operation.leaseExpiresAt = null;
}

export async function syncOfflineOperations(scope: OfflineScope): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const lockKey = [scope.userId, scope.tenantId, scope.branchId ?? "*", scope.companyId ?? "*"].join(":");
  const existing = syncPromises.get(lockKey);
  if (existing) return existing;
  const task = (async () => {
    const rows = await listOfflineOperations(scope);
    const syncedIds = new Set(rows.filter((row) => row.status === "synced").map((row) => row.id));
    for (const candidate of rows) {
      if (candidate.status === "synced" || candidate.status === "conflict") continue;
      if (!candidate.dependencies.every((id) => syncedIds.has(id))) continue;
      const operation = await claimOperation(candidate.id);
      if (!operation) continue;
      const handler = handlers.get(operation.type);
      if (!handler || handler.offlineSafe !== true) {
        operation.status = "failed";
        operation.lastError = "لا يوجد معالج آمن ومعتمد لهذا النوع من العمليات.";
        operation.nextRetryAt = null;
        releaseLease(operation);
        await saveOperation(operation);
        continue;
      }
      try {
        await handler.send(operation);
        operation.status = "synced";
        operation.syncedAt = new Date().toISOString();
        operation.lastError = null;
        operation.nextRetryAt = null;
        releaseLease(operation);
        syncedIds.add(operation.id);
        await saveOperation(operation);
        const metaKey = "lastSuccessfulSyncAt:" + scope.userId + ":" + scope.tenantId + ":" + (scope.branchId ?? "all") + ":" + (scope.companyId ?? "none");
        await transaction([META], "readwrite", (tx) => tx.objectStore(META).put(operation.syncedAt, metaKey));
      } catch (error) {
        const message = error instanceof Error ? error.message : "فشل غير معروف أثناء المزامنة.";
        operation.status = /conflict|version|stale|تعارض/i.test(message) ? "conflict" : "failed";
        operation.lastError = message.slice(0, 1000);
        const retryDelay = Math.min(30 * 60_000, 5_000 * 2 ** Math.min(operation.attempts - 1, 8));
        operation.nextRetryAt = operation.status === "conflict" ? null : new Date(Date.now() + retryDelay).toISOString();
        releaseLease(operation);
        await saveOperation(operation);
      }
    }
  })().finally(() => { syncPromises.delete(lockKey); });
  syncPromises.set(lockKey, task);
  return task;
}

export function startOfflineSync(scope: OfflineScope) {
  if (typeof window === "undefined") return () => undefined;
  const run = () => {
    if (navigator.onLine) void syncOfflineOperations(scope);
  };
  window.addEventListener("online", run);
  const interval = window.setInterval(run, 30_000);
  run();
  return () => {
    window.removeEventListener("online", run);
    window.clearInterval(interval);
  };
}
