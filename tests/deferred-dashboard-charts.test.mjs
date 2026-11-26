import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const dashboard = await readFile(new URL("../src/routes/_authenticated/dashboard.tsx", import.meta.url), "utf8");
const deferred = await readFile(new URL("../src/components/deferred-dashboard-charts.tsx", import.meta.url), "utf8");
const charts = await readFile(new URL("../src/components/dashboard-charts.tsx", import.meta.url), "utf8");

test("dashboard defers Recharts until the chart section approaches the viewport", () => {
  assert.match(dashboard, /DeferredDashboardCharts trend=\{stats\.data\.trend\} byCategory=\{stats\.data\.byCat\}/);
  assert.doesNotMatch(dashboard, /from ["']recharts["']/);
  assert.match(deferred, /lazy\(\(\)\s*=>\s*import\(["']\.\/dashboard-charts["']\)/);
  assert.match(deferred, /IntersectionObserver/);
  assert.match(deferred, /rootMargin:\s*["']240px 0px["']/);
  assert.match(deferred, /observer\.disconnect\(\)/);
  assert.match(deferred, /<Suspense/);
});

test("deferred chart module preserves both operational visualizations", () => {
  assert.match(charts, /<LineChart/);
  assert.match(charts, /<PieChart/);
  assert.match(charts, /ResponsiveContainer/);
});
