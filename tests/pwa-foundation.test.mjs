import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("PWA manifest is Arabic RTL and installable", async () => {
  const manifest = JSON.parse(await read("../public/manifest.webmanifest"));
  assert.equal(manifest.lang, "ar");
  assert.equal(manifest.dir, "rtl");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.src === "/icons/app-icon.svg"));
});

test("service worker caches the app shell and static assets only", async () => {
  const worker = await read("../public/sw.js");
  assert.ok(worker.includes("addAll(SHELL_URLS)"));
  assert.ok(worker.includes('request.method !== "GET"'));
  assert.ok(worker.includes("isSensitiveOrApiPath"));
  assert.ok(worker.includes("rest"));
  assert.ok(worker.includes("auth"));
  assert.ok(worker.includes('caches.match("/")'));
  assert.ok(worker.includes("offline.html"));
  assert.ok(worker.includes(".(?:js|mjs|css"));
});

test("root registers service worker and exposes connection status", async () => {
  const root = await read("../src/routes/__root.tsx");
  assert.ok(root.includes('register("/sw.js"'));
  assert.ok(root.includes('addEventListener("online"'));
  assert.ok(root.includes('addEventListener("offline"'));
  assert.ok(root.includes("غير متصل — الواجهة المحمّلة فقط"));
  assert.ok(root.includes("بيانات الخادم والعمليات فتحتاج إلى اتصال"));
});

test("CI runs for the isolated work branch family", async () => {
  const workflow = await read("../.github/workflows/ci.yml");
  assert.ok(workflow.includes('"work/**"'));
});

test("service worker caches only the public root HTML and bounds static storage", async () => {
  const worker = await read("../public/sw.js");
  assert.ok(worker.includes('url.pathname === "/" && isCacheablePublicResponse(response)'));
  assert.ok(worker.includes("MAX_STATIC_ENTRIES = 180"));
  assert.ok(worker.includes("QuotaExceededError"));
  assert.ok(worker.includes('cacheControl = response.headers.get("cache-control")'));
  assert.ok(worker.includes('response.headers.get("vary") === "*"'));
});

test("offline status retries service worker updates when connectivity returns", async () => {
  const root = await read("../src/routes/__root.tsx");
  assert.ok(root.includes('updateViaCache: "none"'));
  assert.ok(root.includes("registration.update()"));
  assert.ok(root.includes('window.removeEventListener("online", checkForUpdate)'));
  assert.ok(root.includes("queryClient.clear()"));
});

test("offline protected navigation never treats a cached session as authorization", async () => {
  const worker = await read("../public/sw.js");
  const authRoute = await read("../src/routes/_authenticated/route.tsx");
  const homeRoute = await read("../src/routes/index.tsx");
  const loginRoute = await read("../src/routes/auth.tsx");
  assert.ok(worker.includes('if (url.pathname === "/")'));
  assert.ok(worker.includes('caches.match("/offline.html")'));
  assert.ok(authRoute.includes('!navigator.onLine) throw redirect({ to: "/" })'));
  assert.ok(homeRoute.includes('!navigator.onLine) return;'));
  assert.ok(loginRoute.includes('!navigator.onLine) return;'));
});
