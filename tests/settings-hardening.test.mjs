import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isAllowedCustomShortcutRoute, normalizeCustomShortcuts } from "../src/lib/navigation-shortcuts.ts";

const settings = readFileSync(new URL("../src/routes/_authenticated/settings.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../src/components/app-sidebar.tsx", import.meta.url), "utf8");
const launcher = readFileSync(new URL("../src/components/app-launcher.tsx", import.meta.url), "utf8");

test("custom app shortcuts allow only known internal routes and normalize untrusted local storage", () => {
  assert.equal(isAllowedCustomShortcutRoute("/promotions"), true);
  assert.equal(isAllowedCustomShortcutRoute("/support"), true);
  assert.equal(isAllowedCustomShortcutRoute("https://evil.example"), false);
  assert.equal(isAllowedCustomShortcutRoute("//evil.example"), false);
  assert.equal(isAllowedCustomShortcutRoute("/unknown-route"), false);
  assert.deepEqual(normalizeCustomShortcuts([
    { title: "  عروض  ", url: "/promotions" },
    { title: "External", url: "https://evil.example" },
    { title: "Duplicate", url: "/promotions" },
    { title: "Bad", url: "/unknown-route" },
    { title: "x".repeat(29), url: "/support" },
    { title: "مساعدة", url: "/support" },
  ]), [
    { title: "عروض", url: "/promotions" },
    { title: "مساعدة", url: "/support" },
  ]);
});

test("settings keep campaign and promotion management outside the settings page", () => {
  assert.match(settings, /هوية المنصة/);
  assert.match(settings, /إدارة الحملات الإعلانية والعروض الترويجية تتم في أقسامها المنفصلة/);
  assert.doesNotMatch(settings, /from\("marketing_campaigns"\)|from\("promotional_offers"\)/);
  assert.match(settings, /url: "\/promotions"/);
  assert.match(settings, /url: "\/support"/);
});

test("tenant and platform branding saves validate scope, authorization, and input", () => {
  assert.match(settings, /if \(!tenantId\) throw new Error/);
  assert.match(settings, /\.select\("id"\)\.maybeSingle\(\)/);
  assert.match(settings, /if \(authError\) throw authError/);
  assert.match(settings, /if \(!authData\.user\)/);
  assert.match(settings, /parsed\.protocol !== "https:"/);
  assert.match(settings, /platformBrandQuery\.isError/);
  assert.match(settings, /platformBrandQuery\.refetch\(\)/);
});

test("app launcher and legacy sidebar use the same shortcut allowlist", () => {
  assert.match(settings, /normalizeCustomShortcuts/);
  assert.match(settings, /isAllowedCustomShortcutRoute/);
  assert.match(sidebar, /normalizeCustomShortcuts/);
  assert.match(launcher, /normalizeCustomShortcuts/);
});
