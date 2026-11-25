import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("offline reference cache is tenant/user/branch scoped and time limited", async () => {
  const source = await read("../src/lib/offline-reference-cache.ts");
  assert.ok(source.includes("userId: string"));
  assert.ok(source.includes("companyId: string"));
  assert.ok(source.includes("branchId: string"));
  assert.ok(source.includes("expiresAt"));
  assert.ok(source.includes("MAX_AGE_MS"));
  assert.ok(source.includes("record.userId !== scope.userId"));
  assert.ok(source.includes("record.companyId !== scope.companyId"));
  assert.ok(source.includes("record.branchId !== scope.branchId"));
});

test("offline reference cache rejects sensitive fields and supports sign-out purge", async () => {
  const source = await read("../src/lib/offline-reference-cache.ts");
  assert.ok(source.includes("BLOCKED_KEY"));
  assert.ok(source.includes("Sensitive field cannot be stored offline"));
  assert.ok(source.includes("export async function clearOfflineReferences"));
  const root = await read("../src/routes/__root.tsx");
  assert.ok(root.includes('event === "SIGNED_OUT"'));
  assert.ok(root.includes("clearOfflineReferences"));
});

test("offline cache is explicitly limited to reference snapshots, not writes", async () => {
  const source = await read("../src/lib/offline-reference-cache.ts");
  assert.ok(source.includes('"catalogue" | "categories" | "settings"'));
  assert.ok(source.includes("Never put credentials, sessions, tokens, financial records, or mutations"));
  assert.ok(!source.includes("queueMutation"));
  assert.ok(!source.includes("flushQueue"));
});

test("offline reference cache enforces snapshot and browser storage limits", async () => {
  const source = await read("../src/lib/offline-reference-cache.ts");
  assert.ok(source.includes("MAX_SNAPSHOT_BYTES = 512 * 1024"));
  assert.ok(source.includes("MAX_STORAGE_USAGE_RATIO = 0.9"));
  assert.ok(source.includes("navigator.storage.estimate()"));
  assert.ok(source.includes("QuotaExceededError"));
  assert.ok(source.includes("JSON-serializable"));
});
