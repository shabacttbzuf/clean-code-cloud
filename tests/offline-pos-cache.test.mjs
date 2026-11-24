import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cache = await readFile(new URL("../src/lib/offline-reference-cache.ts", import.meta.url), "utf8");
const pos = await readFile(new URL("../src/routes/_authenticated/pos.tsx", import.meta.url), "utf8");
const root = await readFile(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
const authRoute = await readFile(new URL("../src/routes/_authenticated/route.tsx", import.meta.url), "utf8");
const tenantHook = await readFile(new URL("../src/hooks/use-active-tenant.ts", import.meta.url), "utf8");
const membershipsHook = await readFile(new URL("../src/hooks/use-tenant.ts", import.meta.url), "utf8");
const serviceWorker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

test("offline reference cache is tenant, user, company and branch scoped", () => {
  for (const part of ["scope.tenantId", "scope.userId", "scope.companyId", "scope.branchId"]) {
    assert.ok(cache.includes(part), `missing cache scope part: ${part}`);
  }
  assert.match(cache, /OFFLINE_CACHE_MAX_AGE_MS = 14 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(cache, /OFFLINE_AUTH_CACHE_MAX_AGE_MS = 12 \* 60 \* 60 \* 1000/);
});

test("offline fallback never hides authorization and RLS failures", () => {
  assert.match(cache, /value.status === 401 \|\| value.status === 403/);
  assert.match(cache, /value.code === "42501"/);
  assert.match(cache, /if \(isAuthorizationFailure\(error\)\) throw error/);
});

test("offline authentication uses only an already persisted Supabase session", () => {
  assert.match(authRoute, /navigator\.onLine/);
  assert.match(authRoute, /supabase\.auth\.getSession\(\)/);
  assert.match(authRoute, /supabase\.auth\.getUser\(\)/);
  assert.match(tenantHook, /auth-memberships:v1/);
  assert.match(membershipsHook, /auth-memberships:v1/);
});

test("offline document cache excludes OAuth query strings and auth page", () => {
  assert.match(serviceWorker, /contentType\.includes\("text\/html"\)/);
  assert.match(serviceWorker, /!url\.search/);
  assert.match(serviceWorker, /url\.pathname !== "\/auth"/);
  assert.match(serviceWorker, /restaurant-app-documents-v1/);
});

test("POS caches only branch list and product/category reference catalog", () => {
  assert.match(pos, /"pos-branches"/);
  assert.match(pos, /"pos-products"/);
  assert.match(pos, /"pos-categories"/);
  assert.match(pos, /queryKey: \["products-pos", tenantId, userId/);
  assert.match(pos, /queryKey: \["categories-min", tenantId, userId/);
});

test("offline POS is draft-only and blocks all sale submission", () => {
  assert.match(pos, /لا يمكن إتمام البيع دون اتصال/);
  assert.match(pos, /if \(!navigator\.onLine\) throw new Error/);
  assert.match(pos, /أضيف المنتج إلى مسودة محلية/);
  assert.match(pos, /if \(!openSession\.data && \(isOnline \|\| !unlocked\)\)/);
});

test("first service worker activation reloads once to cache the app shell", () => {
  assert.match(root, /restaurant-pwa-first-control-reload-v1/);
  assert.match(root, /navigator\.serviceWorker\.ready/);
  assert.match(root, /window\.location\.reload\(\)/);
});

test("private reference cache is cleared when the user signs out", () => {
  assert.match(root, /if \(event === "SIGNED_OUT"\) void clearOfflineCache\(\)/);
});
