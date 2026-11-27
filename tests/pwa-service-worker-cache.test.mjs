import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Vercel revalidates the service worker script instead of serving a stale cached worker", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const workerHeaders = config.headers?.find((entry) => entry.source === "/sw.js")?.headers ?? [];
  assert.ok(workerHeaders.some((header) =>
    header.key.toLowerCase() === "cache-control" &&
    header.value === "public, max-age=0, must-revalidate",
  ));
});

test("service worker first-control reload is guarded to one per session", () => {
  const source = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
  assert.match(source, /serviceWorker/);
  assert.match(source, /controllerchange/);
  assert.match(source, /sessionStorage/);
});
