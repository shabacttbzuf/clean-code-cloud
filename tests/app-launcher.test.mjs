import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const launcher = readFileSync(new URL("../src/components/app-launcher.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../src/components/app-sidebar.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/routes/_authenticated/route.tsx", import.meta.url), "utf8");

test("launcher consumes the existing navigation catalog and preserves item paths", () => {
  assert.match(launcher, /\.\.\.appNavigationGroups/);
  assert.match(launcher, /to=\{item\.url as any\}/);
  assert.match(sidebar, /export const appNavigationGroups/);
});

test("launcher filters sections using the active tenant permission set", () => {
  assert.match(launcher, /get_my_permissions/);
  assert.match(launcher, /permissions\.data\.has\(item\.permission\)/);
  assert.match(launcher, /!navOverrides\[basePath\]\?\.hidden/);
});

test("launcher supports search, favorites, and frequently used sections", () => {
  assert.match(launcher, /ابحث عن تطبيق/);
  assert.match(launcher, /ras-app-launcher-favorites-v1/);
  assert.match(launcher, /ras-app-launcher-usage-v1/);
  assert.match(launcher, /الأكثر استخداماً/);
});

test("launcher can be opened from the authenticated top bar", () => {
  assert.match(layout, /<AppLauncher\s*\/>/);
});

test("launcher supports keyboard and outside-click dismissal", () => {
  assert.match(launcher, /event\.key === "Escape"/);
  assert.match(launcher, /pointerdown/);
});

test("favorite and frequent shortcuts are derived from permission-filtered visible items", () => {
  assert.match(launcher, /const visibleItems = useMemo\(\(\) => groups\.flatMap/);
  assert.match(launcher, /const favorites = useMemo/);
  assert.match(launcher, /const mostUsed = useMemo/);
  assert.match(launcher, /visibleItems\.filter\(\(item\) => favoriteUrls\.includes\(item\.url\)\)/);
  assert.match(launcher, /visibleItems\.filter\(\(item\) => \(usageCounts\[item\.url\] \?\? 0\) > 0\)/);
});
