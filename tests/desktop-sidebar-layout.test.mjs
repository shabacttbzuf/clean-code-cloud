import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../src/routes/_authenticated/route.tsx", import.meta.url), "utf8");
const launcher = readFileSync(new URL("../src/components/app-launcher.tsx", import.meta.url), "utf8");

test("authenticated workspace renders without a side navigation drawer", () => {
  assert.doesNotMatch(route, /SidebarProvider|SidebarTrigger|SidebarInset|AppSidebar|SidebarRouteSync/);
  assert.match(route, /<div className="workspace-surface flex min-h-screen w-full flex-col">/);
});

test("the applications launcher replaces the former sidebar control in the top bar", () => {
  assert.match(route, /<AppLauncher \/>\s*<div className="topbar-brand grid h-10 w-10/);
  assert.equal((route.match(/<AppLauncher \/>/g) ?? []).length, 1);
  assert.match(launcher, /size="icon".*aria-label="فتح التطبيقات"/);
  assert.match(launcher, /max-h-\[min\(78dvh,680px\)\]/);
});


const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("global theme uses the approved deep navy, white and gold brand", () => {
  assert.match(styles, /--primary:\s*oklch\([^;]+255\)/);
  assert.match(styles, /--accent:\s*oklch\([^;]+85\)/);
  assert.match(styles, /--background:\s*oklch\(0\.985/);
  assert.doesNotMatch(styles.slice(0, styles.indexOf("@layer base")), /Deep forest green/);
});

test("workspace navigation and content include compact-screen safeguards", () => {
  assert.match(styles, /\.workspace-tabs\s*\{[^}]*overflow-x-auto|\.workspace-tabs\s*\{[^}]*overscroll-behavior-inline/s);
  assert.match(styles, /@media \(max-width: 640px\)/);
  assert.match(styles, /env\(safe-area-inset-left\)/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});
