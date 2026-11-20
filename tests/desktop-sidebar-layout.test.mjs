import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/routes/_authenticated/route.tsx", import.meta.url), "utf8");

test("desktop sidebar starts expanded instead of being forced closed", () => {
  assert.match(source, /<SidebarProvider defaultOpen=\{true\}>/);
  assert.doesNotMatch(source, /<SidebarProvider open=\{open\} onOpenChange=\{setOpen\}>/);
});

test("route changes close only the mobile drawer, not desktop navigation", () => {
  const sync = source.slice(source.indexOf("function SidebarRouteSync"), source.indexOf("/**", source.indexOf("function SidebarRouteSync")));
  assert.match(sync, /const \{ setOpenMobile \} = useSidebar\(\)/);
  assert.match(sync, /setOpenMobile\(false\)/);
  assert.doesNotMatch(sync, /setOpen\(false\)/);
});
