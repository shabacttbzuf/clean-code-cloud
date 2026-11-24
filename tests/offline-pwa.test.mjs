import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const serviceWorker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const manifest = JSON.parse(
  await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
);
const offlinePage = await readFile(new URL("../public/offline.html", import.meta.url), "utf8");

test("service worker excludes backend and authenticated requests from its cache", () => {
  assert.match(serviceWorker, /isBackendRequest/);
  assert.match(serviceWorker, /request\.headers\.has\("authorization"\)/);
  for (const endpoint of ["rest", "auth", "storage", "functions", "realtime", "graphql"]) {
    assert.ok(serviceWorker.includes(endpoint), `expected backend exclusion for ${endpoint}`);
  }
});

test("navigation failures use the local Arabic offline page", () => {
  assert.match(serviceWorker, /request\.mode === "navigate"/);
  assert.match(serviceWorker, /caches\.match\(OFFLINE_URL\)/);
  assert.match(offlinePage, /لا يوجد اتصال بالإنترنت/);
  assert.match(offlinePage, /إعادة المحاولة/);
});

test("manifest declares an Arabic standalone web application", () => {
  assert.equal(manifest.lang, "ar");
  assert.equal(manifest.dir, "rtl");
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.src === "/icon.svg"));
});
