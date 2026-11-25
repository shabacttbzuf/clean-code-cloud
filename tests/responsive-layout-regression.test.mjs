import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("../src/styles.css");
const route = read("../src/routes/_authenticated/route.tsx");
const launcher = read("../src/components/app-launcher.tsx");
const chart = read("../src/components/ui/chart.tsx");
test("mobile header uses stable semantic hooks for company, brand and help controls", () => {
  assert.match(route, /topbar-help-link/);
  assert.match(route, /topbar-brand/);
  assert.match(route, /topbar-tenant-trigger/);
  assert.doesNotMatch(css, /responsive-topbar > div:first-child > div:nth-of-type/);
});
test("application launcher remains reachable in portrait and landscape phones", () => {
  assert.match(launcher, /app-launcher-panel/);
  assert.match(css, /\.app-launcher-panel\s*\{[\s\S]*position:\s*fixed/);
  assert.match(css, /orientation:\s*landscape/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});
test("charts and tables can shrink inside narrow responsive containers", () => {
  assert.match(chart, /aspect-video w-full min-w-0 max-w-full/);
  assert.match(css, /\.responsive-table-wrap\s*\{[\s\S]*overflow-x:\s*auto/);
});
test("reduced-motion preference is respected", () => {
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});
