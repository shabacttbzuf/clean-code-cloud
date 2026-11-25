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
  | "blocked"
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
  /** Explicit assertion that the server atomically persists and replays this key. */
  idempotentServerSide: true;
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
const BLOCKED_OPERATION_PATTERN = /(^|[._-])(pos|checkout|sale|sales|invoice|payment|payments|refund|refunds|return|returns|inventory|stock|purchase|purchases|cash|payroll|accounting|journal|tax|ledger)([._-]|$)/i;

function isFinancialOrInventoryOperation(type: string) {
  return FINANCIAL_TYPES.has(type) || BLOCKED_OPERATION_PATTERN.test(type);
}

function sameScope(a: OfflineScope, b: OfflineScope) {
  return a.userId === b.userId &&
    a.tenantId === b.tenantId &&
    a.companyId === b.companyId &&
    a.branchId === b.branchId;
}

function isPermanentFailure(error: unknown) {
  const candidate = error as { code?: string; status?: number; message?: string };
  const code = candidate?.code ?? "";
  const status = candidate?.status;
  const message = candidate?.message ?? "";
  return status === 401 || status === 403 ||
    ["42501", "22023", "P0002"].includes(code) ||
    /permission denied|not authorized|authentication required|session missing|invalid .*request|not found|بيانات .*غير صالحة|صلاحية|غير مصرح/i.test(message);
}

const MAX_AUTOMATIC_ATTEMPTS = 12;
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
  if (!type.trim() || isFinancialOrInventoryOperation(type)) {
    throw new Error("هذا النوع من العمليات لا يسمح بتسجيله للمزامنة دون اتصال.");
  }
  if (handler.offlineSafe !== true || handler.idempotentServerSide !== true) throw new Error("يجب تأكيد أمان العملية ودعم الخادم لمفتاح منع التكرار.");
  handlers.set(type, handler);
  return () => handlers.delete(type);
}

export async function enqueueOfflineOperation(
  type: string,
  payload: Record<string, unknown>,
  scope: OfflineScope,
  dependencies: string[] = [],
  idempotencyKey?: string,
): Promise<OfflineOperation> {
  if (isFinancialOrInventoryOperation(type) || !handlers.has(type)) {
    throw new Error("هذه العملية تتطلب اتصالاً بالخادم ولا يمكن حفظها كعملية قابلة للإرسال.");
  }
  if (!scope.userId || !scope.tenantId) throw new Error("تعذر تحديد المستخدم والمؤسسة للعملية.");
  if (!scope.branchId) {
    throw new Error("يجب تحديد الفرع صراحةً قبل حفظ عملية قابلة للمزامنة؛ وتُحفظ الشركة إن كانت مرتبطة بالفرع.");
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const operation: OfflineOperation = {
    id,
    idempotencyKey: idempotencyKey ?? id,
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

  // Read, deduplicate and insert in one readwrite transaction to close the cross-tab race.
  const db = await openDb();
  try {
    const saved = await new Promise<OfflineOperation>((resolve, reject) => {
      const tx = db.transaction([STORE], "readwrite");
      const store = tx.objectStore(STORE);
      const request = store.getAll();
      let result = operation;
      request.onsuccess = () => {
        const duplicate = (request.result as OfflineOperation[]).find((item) =>
          sameScope(item.scope, scope) &&
          item.type === type &&
          item.status !== "synced" &&
          item.status !== "conflict" &&
          item.status !== "blocked" &&
          JSON.stringify(item.payload) === JSON.stringify(operation.payload)
        );
        if (duplicate) {
          result = duplicate;
          return;
        }
        store.add(operation);
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? new Error("تعذر حفظ العملية محلياً."));
      tx.onabort = () => reject(tx.error ?? new Error("أُلغيت عملية الحفظ المحلية."));
    });
    notifyQueueChanged();
    return saved;
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      throw new Error("مساحة التخزين المحلي ممتلئة؛ لم تُحفظ العملية. حرّر مساحة ثم أعد المحاولة.");
    }
    throw error;
  } finally {
    db.close();
  }
}

export async function listOfflineOperations(scope?: OfflineScope): Promise<OfflineOperation[]> {
  const rows = await transaction<OfflineOperation[]>([STORE], "readonly", (tx) =>
    tx.objectStore(STORE).getAll(),
  );
  return rows
    .filter((row) => !scope || (
      row.scope.userId === scope.userId &&
      row.scope.tenantId === scope.tenantId &&
      row.scope.branchId === scope.branchId &&
      row.scope.companyId === scope.companyId
    ))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function saveOperation(operation: OfflineOperation) {
  operation.updatedAt = new Date().toISOString();
  await transaction([STORE], "readwrite", (tx) => tx.objectStore(STORE).put(operation));
  notifyQueueChanged();
}

export async function retryFailedOfflineOperations(scope: OfflineScope): Promise<void> {
  const rows = await listOfflineOperations(scope);
  for (const operation of rows) {
    if (operation.status !== "failed" && operation.status !== "blocked") continue;
    operation.status = "pending";
    operation.nextRetryAt = null;
    await saveOperation(operation);
  }
}

export async function getLastOfflineSyncAt(scope: OfflineScope): Promise<string | null> {
  const key = `lastSuccessfulSyncAt:${scope.userId}:${scope.tenantId}:${scope.branchId ?? "all"}:${scope.companyId ?? "none"}`;
  return (await transaction<string | undefined>([META], "readonly", (tx) =>
    tx.objectStore(META).get(key),
  )) ?? null;
}

async function claimOperation(id: string, scope: OfflineScope): Promise<OfflineOperation | null> {
  const db = await openDb();
  try {
    return await new Promise<OfflineOperation | null>((resolve, reject) => {
      const tx = db.transaction([STORE], "readwrite");
      const store = tx.objectStore(STORE);
      const request = store.get(id);
      let claimed: OfflineOperation | null = null;
      request.onsuccess = () => {
        const current = request.result as OfflineOperation | undefined;
        if (!current || !sameScope(current.scope, scope) || current.status === "synced" || current.status === "conflict" || current.status === "blocked") return;
        const now = Date.now();
        if (current.leaseExpiresAt && new Date(current.leaseExpiresAt).getTime() > now) return;
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
    const attemptedIds = new Set<string>();
    let madeProgress = true;
    while (madeProgress) {
      madeProgress = false;
      for (const candidate of rows) {
        if (attemptedIds.has(candidate.id) || candidate.status === "synced" || candidate.status === "conflict" || candidate.status === "blocked") continue;
        if (!candidate.dependencies.every((id) => syncedIds.has(id))) continue;
        attemptedIds.add(candidate.id);
        const operation = await claimOperation(candidate.id, scope);
        if (!operation) continue;
        const handler = handlers.get(operation.type);
        if (!handler || handler.offlineSafe !== true || handler.idempotentServerSide !== true) {
          operation.status = "blocked";
          operation.lastError = "لا يوجد معالج آمن ومعتمد لهذا النوع من العمليات؛ أوقفنا الإرسال نهائياً.";
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
          madeProgress = true;
          await saveOperation(operation);
          const metaKey = "lastSuccessfulSyncAt:" + scope.userId + ":" + scope.tenantId + ":" + (scope.branchId ?? "all") + ":" + (scope.companyId ?? "none");
          await transaction([META], "readwrite", (tx) => tx.objectStore(META).put(operation.syncedAt, metaKey));
        } catch (error) {
          const message = error instanceof Error ? error.message : "فشل غير معروف أثناء المزامنة.";
          const isConflict = /conflict|version|stale|تعارض/i.test(message);
          const isPermanent = isPermanentFailure(error) || operation.attempts >= MAX_AUTOMATIC_ATTEMPTS;
          operation.status = isConflict ? "conflict" : isPermanent ? "blocked" : "failed";
          operation.lastError = message.slice(0, 1000);
          const retryDelay = Math.min(30 * 60_000, 5_000 * 2 ** Math.min(operation.attempts - 1, 12));
          operation.nextRetryAt = operation.status === "failed" ? new Date(Date.now() + retryDelay).toISOString();
          releaseLease(operation);
          await saveOperation(operation);
        }
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
