import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("../src/styles.css");
const route = read("../src/routes/_authenticated/route.tsx");
const launcher = read("../src/components/app-launcher.tsx");
const chart = read("../src/components/ui/chart.tsx");
const table = read("../src/components/ui/table.tsx");
const root = read("../src/routes/__root.tsx");
const pos = read("../src/routes/_authenticated/pos.tsx");
const reports = read("../src/routes/_authenticated/reports.tsx");
const settings = read("../src/routes/_authenticated/settings.tsx");
const users = read("../src/routes/_authenticated/users.tsx");

test("mobile header retains accessible help, brand and company controls", () => {
  assert.match(route, /aria-label="مركز المساعدة والدعم"/);
  assert.match(route, /aria-label="شعار النظام"/);
  assert.match(route, /aria-label="اختيار الشركة"/);
  assert.match(route, /min-h-\\[64px\\].*px-2.*sm:px-4/);
});

test("application launcher fits narrow screens without overflowing the viewport", () => {
  assert.match(launcher, /w-\\[min\\(94vw,520px\\)\\]/);
  assert.match(launcher, /max-h-\\[min\\(78vh,680px\\)\\]/);
  assert.match(launcher, /overflow-y-auto/);
  assert.match(css, /safe-area-inset-bottom/);
});

test("charts and data tables use fluid containers and horizontal overflow handling", () => {
  assert.match(chart, /aspect-video/);
  assert.match(chart, /ResponsiveContainer/);
  assert.match(table, /min-w-0 overflow-auto/);
});

test("reduced-motion preference is respected", () => {
  assert.match(css, /prefers-reduced-motion:\\s*reduce/);
});

test("safe-area support is activated at the viewport and retained in page layout", () => {
  assert.match(root, /viewport-fit=cover/);
  assert.match(css, /safe-area-inset-top/);
  assert.match(css, /safe-area-inset-bottom/);
});

test("critical sales, reports, settings and user forms retain responsive grid or scroll layouts", () => {
  assert.match(pos, /sm:grid-cols-2/);
  assert.match(pos, /overflow-y-auto/);
  assert.match(reports, /overflow-x-auto/);
  assert.match(reports, /flex-wrap/);
  assert.match(settings, /grid gap-3 sm:grid-cols-2/);
  assert.match(users, /grid-cols-2 gap-3/);
  assert.match(users, /md:grid-cols-2 xl:grid-cols-3/);
});
