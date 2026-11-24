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
let syncPromise: Promise<void> | null = null;

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
      let result: T;
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
      row.scope.branchId === scope.branchId
    ))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function saveOperation(operation: OfflineOperation) {
  operation.updatedAt = new Date().toISOString();
  await transaction([STORE], "readwrite", (tx) => tx.objectStore(STORE).put(operation));
  notifyQueueChanged();
}

export async function getLastOfflineSyncAt(): Promise<string | null> {
  return (await transaction<string | undefined>([META], "readonly", (tx) =>
    tx.objectStore(META).get("lastSuccessfulSyncAt"),
  )) ?? null;
}

export async function syncOfflineOperations(scope: OfflineScope): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    const rows = await listOfflineOperations(scope);
    const syncedIds = new Set(rows.filter((row) => row.status === "synced").map((row) => row.id));
    for (const operation of rows) {
      if (operation.status === "synced" || operation.status === "conflict") continue;
      if (!operation.dependencies.every((id) => syncedIds.has(id))) continue;
      const handler = handlers.get(operation.type);
      if (!handler || handler.offlineSafe !== true) {
        operation.status = "failed";
        operation.lastError = "لا يوجد معالج آمن ومعتمد لهذا النوع من العمليات.";
        await saveOperation(operation);
        continue;
      }
      operation.status = "processing";
      operation.attempts += 1;
      await saveOperation(operation);
      try {
        // The handler must re-check the current session, permissions, tenant and branch
        // on the server. Never trust the scope captured in the browser as authorization.
        await handler.send(operation);
        operation.status = "synced";
        operation.syncedAt = new Date().toISOString();
        operation.lastError = null;
        syncedIds.add(operation.id);
        await saveOperation(operation);
        await transaction([META], "readwrite", (tx) =>
          tx.objectStore(META).put(operation.syncedAt, "lastSuccessfulSyncAt"),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "فشل غير معروف أثناء المزامنة.";
        operation.status = /conflict|version|stale|تعارض/i.test(message) ? "conflict" : "failed";
        operation.lastError = message.slice(0, 1000);
        await saveOperation(operation);
        // Keep later dependent operations queued; independent operations may proceed.
      }
    }
  })().finally(() => { syncPromise = null; });
  return syncPromise;
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
