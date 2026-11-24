const DB_NAME = "restaurant-offline-data";
const DB_VERSION = 1;
const STORE_NAME = "private-reference-data";
export const OFFLINE_CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

type CacheRecord<T> = {
  key: string;
  schemaVersion: 1;
  savedAt: number;
  data: T;
};

let databasePromise: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (databasePromise) return databasePromise;

  const pending: Promise<IDBDatabase | null> = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  }).then((database): IDBDatabase | null => {
    if (!database) databasePromise = null;
    return database;
  });
  databasePromise = pending;
  return pending;
}

export function offlineCacheKey(
  scope: { tenantId: string; userId: string; companyId?: string | null; branchId?: string | null },
  resource: string,
): string {
  return [
    "v1",
    scope.tenantId,
    scope.userId,
    scope.companyId ?? "no-company",
    scope.branchId ?? "no-branch",
    resource,
  ].map((part) => encodeURIComponent(part)).join(":");
}

export async function writeOfflineCache<T>(key: string, data: T): Promise<void> {
  const database = await openDatabase();
  if (!database) return;

  await new Promise<void>((resolve) => {
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put({
        key,
        schemaVersion: 1,
        savedAt: Date.now(),
        data,
      } satisfies CacheRecord<T>);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function readOfflineCache<T>(
  key: string,
  maxAgeMs = OFFLINE_CACHE_MAX_AGE_MS,
): Promise<{ data: T; savedAt: number } | null> {
  const database = await openDatabase();
  if (!database) return null;

  return new Promise((resolve) => {
    try {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => {
        const record = request.result as CacheRecord<T> | undefined;
        if (!record || record.schemaVersion !== 1 || !Number.isFinite(record.savedAt)) {
          resolve(null);
          return;
        }
        if (Date.now() - record.savedAt > maxAgeMs) {
          void deleteOfflineCache(key);
          resolve(null);
          return;
        }
        resolve({ data: record.data, savedAt: record.savedAt });
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function deleteOfflineCache(key: string): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearOfflineCache(): Promise<void> {
  const database = await openDatabase();
  if (!database) return;
  await new Promise<void>((resolve) => {
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

function isAuthorizationFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { status?: number; code?: string };
  return value.status === 401 || value.status === 403 ||
    value.code === "42501" || value.code === "PGRST301";
}

/** Network-first cache for non-sensitive reference data only. Never mask revoked access. */
export async function withOfflineFallback<T>(
  key: string,
  loadFromServer: () => Promise<T>,
): Promise<T> {
  try {
    const fresh = await loadFromServer();
    await writeOfflineCache(key, fresh);
    return fresh;
  } catch (error) {
    if (isAuthorizationFailure(error)) throw error;
    const cached = await readOfflineCache<T>(key);
    if (cached) return cached.data;
    throw error;
  }
}
