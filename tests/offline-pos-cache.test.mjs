import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cache = await readFile(new URL("../src/lib/offline-reference-cache.ts", import.meta.url), "utf8");
const pos = await readFile(new URL("../src/routes/_authenticated/pos.tsx", import.meta.url), "utf8");
const root = await readFile(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");

test("offline reference cache is tenant, user, company and branch scoped", () => {
  for (const part of ["scope.tenantId", "scope.userId", "scope.companyId", "scope.branchId"]) {
    assert.ok(cache.includes(part), `missing cache scope part: ${part}`);
  }
  assert.match(cache, /OFFLINE_CACHE_MAX_AGE_MS = 14 \* 24 \* 60 \* 60 \* 1000/);
});

test("offline fallback never hides authorization and RLS failures", () => {
  assert.match(cache, /value.status === 401 \|\| value.status === 403/);
  assert.match(cache, /value.code === "42501"/);
  assert.match(cache, /if \(isAuthorizationFailure\(error\)\) throw error/);
});

test("POS caches only its branch list and product/category reference catalog", () => {
  assert.match(pos, /"pos-branches"/);
  assert.match(pos, /"pos-products"/);
  assert.match(pos, /"pos-categories"/);
  assert.match(pos, /queryKey: \["products-pos", tenantId, userId/);
  assert.match(pos, /queryKey: \["categories-min", tenantId, userId/);
});

test("offline POS is draft-only and blocks all sale submission", () => {
  assert.match(pos, /لا يمكن إتمام البيع دون اتصال/);
  assert.match(pos, /if \(!navigator\.onLine\) throw new Error/);
  assert.match(pos, /تمت إضافة المنتج إلى مسودة محلية/);
  assert.match(pos, /holdOrDraft/);
});

test("private reference cache is cleared when the user signs out", () => {
  assert.match(root, /if \(event === "SIGNED_OUT"\) void clearOfflineCache\(\)/);
});
