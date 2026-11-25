/**
 * Explicit, tenant-scoped IndexedDB cache for non-sensitive reference snapshots.
 * Callers must fetch data through the authenticated Supabase client/RLS first.
 * Never put credentials, sessions, tokens, financial records, or mutations here.
 */
export type OfflineScope = {
  userId: string;
  companyId: string;
  branchId: string;
};

export type OfflineReferenceKind = "catalogue" | "categories" | "settings";

type StoredRecord = {
  id: string;
  userId: string;
  companyId: string;
  branchId: string;
  kind: OfflineReferenceKind;
  value: unknown;
  savedAt: number;
  expiresAt: number;
};

const DB_NAME = "restaurant-offline-reference";
const DB_VERSION = 1;
const STORE_NAME = "snapshots";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const BLOCKED_KEY = /password|secret|token|authorization|cookie|session|credential|payment|card|bank|salary|payroll|invoice|journal|ledger|transaction|cash|profit|cost|stock|inventory|customer|employee|phone|email|national.?id/i;

function assertScope(scope: OfflineScope): void {
  for (const [key, value] of Object.entries(scope)) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`Offline cache requires a valid ${key}`);
    }
  }
}

function assertSafePayload(value: unknown, depth = 0): void {
  if (depth > 20) throw new Error("Offline reference payload is too deeply nested");
  if (Array.isArray(value)) {
    for (const item of value) assertSafePayload(item, depth + 1);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (BLOCKED_KEY.test(key)) {
      throw new Error(`Sensitive field cannot be stored offline: ${key}`);
    }
    assertSafePayload(nested, depth + 1);
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable in this browser"));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("scope", ["userId", "companyId", "branchId"], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open offline database"));
    request.onblocked = () => reject(new Error("Offline database upgrade is blocked by another tab"));
  });
}

function recordId(scope: OfflineScope, kind: OfflineReferenceKind): string {
  return [scope.userId, scope.companyId, scope.branchId, kind].join(":");
}

export async function saveOfflineReference(
  scope: OfflineScope,
  kind: OfflineReferenceKind,
  value: unknown,
  maxAgeMs = MAX_AGE_MS,
): Promise<void> {
  assertScope(scope);
  assertSafePayload(value);
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0 || maxAgeMs > MAX_AGE_MS) {
    throw new Error("Offline cache lifetime must be between 1ms and 7 days");
  }
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const now = Date.now();
      const record: StoredRecord = {
        id: recordId(scope, kind),
        ...scope,
        kind,
        value,
        savedAt: now,
        expiresAt: now + maxAgeMs,
      };
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Unable to save offline reference"));
      tx.onabort = () => reject(tx.error ?? new Error("Offline reference save aborted"));
    });
  } finally {
    db.close();
  }
}

export async function readOfflineReference<T>(
  scope: OfflineScope,
  kind: OfflineReferenceKind,
): Promise<T | null> {
  assertScope(scope);
  const db = await openDatabase();
  try {
    const record = await new Promise<StoredRecord | undefined>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME).get(recordId(scope, kind));
      request.onsuccess = () => resolve(request.result as StoredRecord | undefined);
      request.onerror = () => reject(request.error ?? new Error("Unable to read offline reference"));
    });
    if (!record) return null;
    if (
      record.userId !== scope.userId ||
      record.companyId !== scope.companyId ||
      record.branchId !== scope.branchId
    ) return null;
    if (record.expiresAt <= Date.now()) {
      await deleteOfflineReference(scope, kind);
      return null;
    }
    return record.value as T;
  } finally {
    db.close();
  }
}

export async function deleteOfflineReference(
  scope: OfflineScope,
  kind: OfflineReferenceKind,
): Promise<void> {
  assertScope(scope);
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(recordId(scope, kind));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Unable to delete offline reference"));
      tx.onabort = () => reject(tx.error ?? new Error("Offline reference deletion aborted"));
    });
  } finally {
    db.close();
  }
}

/** Purge every locally cached tenant snapshot on sign-out or identity change. */
export async function clearOfflineReferences(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Unable to clear offline references"));
      tx.onabort = () => reject(tx.error ?? new Error("Offline cache clear aborted"));
    });
  } finally {
    db.close();
  }
}
