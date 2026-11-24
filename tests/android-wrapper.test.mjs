import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = await readFile(new URL("../capacitor.config.ts", import.meta.url), "utf8");
const fallback = await readFile(new URL("../android-web/index.html", import.meta.url), "utf8");
const workflow = await readFile(
  new URL("../.github/workflows/android-wrapper.yml", import.meta.url),
  "utf8",
);

test("Capacitor wrapper targets the Termux loopback runtime by default", () => {
  assert.match(config, /http:\/\/127\.0\.0\.1:5173/);
  assert.match(config, /CAPACITOR_SERVER_URL/);
  assert.match(config, /cleartext: localServerUrl\.startsWith\("http:\/\/"/);
  assert.match(config, /com\.shafiq\.restaurantmanagement/);
});

test("Android fallback explains how to start the Termux web server", () => {
  assert.match(fallback, /bun run dev --host 0\.0\.0\.0/);
  assert.match(fallback, /5173/);
  assert.match(fallback, /lang="ar" dir="rtl"/);
});

test("Android workflow builds and uploads a debug APK", () => {
  assert.match(workflow, /bun install --frozen-lockfile/);
  assert.match(workflow, /bunx cap add android/);
  assert.match(workflow, /assembleDebug/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
});
