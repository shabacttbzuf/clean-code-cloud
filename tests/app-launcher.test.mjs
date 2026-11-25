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
  assert.match(launcher, /usageCounts\[item\.url\] \?\? 0/);
  assert.match(launcher, /\.sort\(\(a, b\) =>/);
});

const routeTree = readFileSync(new URL("../src/routeTree.gen.ts", import.meta.url), "utf8");

test("every launcher route is a real authenticated route and all base authenticated routes are represented", () => {
  const routeSection = routeTree.split("export interface FileRoutesByFullPath {")[1]?.split("}")[0] ?? "";
  const actualRoutes = new Set(
    [...routeSection.matchAll(/^\s*'([^']+)': typeof Authenticated/mg)]
      .map((match) => match[1].replace(/\/$/, ""))
      .filter((path) => !path.includes("$")),
  );
  const launcherSection = launcher.match(/const APP_LAUNCHER_ROUTE_PATHS = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? "";
  const launcherRoutes = [...launcherSection.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.ok(launcherRoutes.length > 0, "launcher route registry must not be empty");
  for (const path of launcherRoutes) assert.ok(actualRoutes.has(path), `launcher path is not registered: ${path}`);
  for (const path of actualRoutes) assert.ok(launcherRoutes.includes(path), `authenticated base route is missing from launcher: ${path}`);
});

test("launcher search matches both default and customized application names", () => {
  assert.match(launcher, /searchableNames = \[item\.title, effectiveTitle\]/);
  assert.match(launcher, /searchableNames\.some\(\(title\) => title\.includes\(needle\)\)/);
});

test("launcher route filtering fails closed and never renders stale inaccessible favorites", () => {
  assert.match(launcher, /APP_LAUNCHER_ROUTE_PATHS\.has\(basePath\)/);
  assert.match(launcher, /const visibleItems = useMemo\(\(\) => groups\.flatMap/);
  assert.match(launcher, /visibleItems\.filter\(\(item\) => favoriteUrls\.includes\(item\.url\)\)/);
  assert.match(launcher, /permissions\.isError \?/);
});

test("launcher provides per-application descriptions and a profile entry", () => {
  assert.match(launcher, /const APP_DESCRIPTIONS/);
  assert.match(launcher, /بيانات حسابك وتفضيلاته/);
  assert.match(launcher, /url: "\/profile", icon: UserRound/);
});
