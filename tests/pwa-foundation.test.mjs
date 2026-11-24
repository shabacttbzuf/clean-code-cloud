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
  assert.ok(root.includes("وضع عدم الاتصال"));
});

test("CI runs for the isolated work branch family", async () => {
  const workflow = await read("../.github/workflows/ci.yml");
  assert.ok(workflow.includes('"work/**"'));
});
