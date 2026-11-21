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
  assert.match(route, /<AppLauncher \/>\s*<div className="grid h-10 w-10/);
  assert.equal((route.match(/<AppLauncher \/>/g) ?? []).length, 1);
  assert.match(launcher, /size="icon".*aria-label="فتح التطبيقات"/);
  assert.match(launcher, /max-h-\[min\(78vh,680px\)\]/);
});
