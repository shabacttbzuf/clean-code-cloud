import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const launcher = readFileSync(new URL("../src/components/app-launcher.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../src/components/app-sidebar.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/routes/_authenticated/route.tsx", import.meta.url), "utf8");
const routeTree = readFileSync(new URL("../src/routeTree.gen.ts", import.meta.url), "utf8");

test("launcher consumes the current navigation catalog and preserves item paths", () => {
  assert.match(launcher, /\.\.\.appNavigationGroups/);
  assert.match(launcher, /to=\{item\.url as any\}/);
  assert.match(sidebar, /export const appNavigationGroups/);
  assert.match(layout, /<AppLauncher\s*\/>/);
});

test("launcher uses fail-closed active-tenant permissions without a second stale permission query", () => {
  assert.match(launcher, /permissionsError/);
  assert.match(launcher, /permissions\.has\(item\.permission\)/);
  assert.doesNotMatch(launcher, /get_my_permissions/);
  assert.match(launcher, /APP_LAUNCHER_ROUTE_PATHS\.has\(basePath\)/);
});

test("favorites and usage summaries are derived only from permission-filtered routes", () => {
  assert.match(launcher, /const visibleItems = useMemo\(\(\) => groups\.flatMap/);
  assert.match(launcher, /const favorites = useMemo/);
  assert.match(launcher, /const mostUsed = useMemo/);
  assert.match(launcher, /visibleItems\.filter\(\(item\) => favoriteUrls\.includes\(item\.url\)\)/);
  assert.match(launcher, /usageCounts\[item\.url\] \?\? 0/);
});

test("launcher supports search, keyboard dismissal, and outside-click dismissal", () => {
  assert.match(launcher, /ابحث عن تطبيق/);
  assert.match(launcher, /event\.key === "Escape"/);
  assert.match(launcher, /pointerdown/);
});

test("every launcher route maps to a registered authenticated base route", () => {
  const routeSection = routeTree.split("export interface FileRoutesByFullPath {")[1]?.split("}")[0] ?? "";
  const actualRoutes = new Set(
    [...routeSection.matchAll(/^\s*'([^']+)': typeof Authenticated/mg)]
      .map((match) => match[1].replace(/\/$/, ""))
      .filter((path) => !path.includes("$")),
  );
  const launcherSection = launcher.match(/const APP_LAUNCHER_ROUTE_PATHS = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? "";
  const launcherRoutes = [...launcherSection.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.ok(launcherRoutes.length > 0);
  for (const path of launcherRoutes) assert.ok(actualRoutes.has(path), "unregistered route: " + path);
  for (const path of actualRoutes) assert.ok(launcherRoutes.includes(path), "missing route: " + path);
});
