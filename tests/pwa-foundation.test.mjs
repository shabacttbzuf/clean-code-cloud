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
  assert.match(worker, /addAll\\(SHELL_URLS\\)/);
  assert.match(worker, /request\.method !== "GET"/);
  assert.match(worker, /isSensitiveOrApiPath/);
  assert.match(worker, /rest\\\/v1|auth\\\/v1|functions\\\/v1|storage\\\/v1/);
  assert.match(worker, /caches\.match\("\/"\)/);
  assert.match(worker, /offline\.html/);
});

test("root registers service worker and exposes connection status", async () => {
  const root = await read("../src/routes/__root.tsx");
  assert.match(root, /register\("\/sw\.js"/);
  assert.match(root, /addEventListener\("online"/);
  assert.match(root, /addEventListener\("offline"/);
  assert.match(root, /وضع عدم الاتصال/);
});

test("CI runs for the isolated work branch family", async () => {
  const workflow = await read("../.github/workflows/ci.yml");
  assert.match(workflow, /"work\/\*\*"/);
});
