import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_WORKSPACE_TABS,
  MAX_PINNED_WORKSPACE_TABS,
  addWorkspaceTab,
  closeOtherWorkspaceTabs,
  closeWorkspaceTab,
  createWorkspaceTabScope,
  normalizeWorkspacePath,
  restoreWorkspaceTabs,
  toggleWorkspaceTabPin,
} from "../src/lib/workspace-tabs-logic.mjs";

const base = [{ path: "/dashboard", title: "الرئيسية", pinned: true }];

test("opening the same route and equivalent query parameters never creates duplicate tabs", () => {
  const first = addWorkspaceTab(base, { path: "/sales?status=open&page=1", title: "المبيعات" });
  const second = addWorkspaceTab(first, { path: "/sales?page=1&status=open", title: "المبيعات" });
  assert.equal(second.length, 2);
  assert.equal(second[1].path, "/sales?page=1&status=open");
});

test("route identifiers and search parameters remain part of the tab identity", () => {
  assert.notEqual(normalizeWorkspacePath("/sales/invoice-a"), normalizeWorkspacePath("/sales/invoice-b"));
  assert.notEqual(normalizeWorkspacePath("/sales?status=open"), normalizeWorkspacePath("/sales?status=closed"));
  assert.equal(normalizeWorkspacePath("/settings#developer-studio"), "/settings");
});

test("closing a dirty tab requires explicit confirmation and pinned tabs cannot be closed", () => {
  const tabs = [
    ...base,
    { path: "/purchases", title: "المشتريات", dirty: true },
    { path: "/reports", title: "التقارير", pinned: true },
  ];
  assert.equal(closeWorkspaceTab(tabs, "/purchases").length, 3);
  assert.equal(closeWorkspaceTab(tabs, "/reports", { allowDirty: true }).length, 3);
  assert.equal(closeWorkspaceTab(tabs, "/purchases", { allowDirty: true }).length, 2);
});

test("pinning is reversible, keeps dashboard pinned and enforces the pinned limit", () => {
  let tabs = [...base];
  for (let i = 0; i < MAX_PINNED_WORKSPACE_TABS + 2; i++) {
    tabs = addWorkspaceTab(tabs, { path: `/page-${i}`, title: `صفحة ${i}` });
  }
  for (let i = 0; i < MAX_PINNED_WORKSPACE_TABS; i++) tabs = toggleWorkspaceTabPin(tabs, `/page-${i}`);
  const overLimit = toggleWorkspaceTabPin(tabs, `/page-${MAX_PINNED_WORKSPACE_TABS}`);
  assert.equal(overLimit.filter(tab => tab.pinned).length, MAX_PINNED_WORKSPACE_TABS);
  const unpinned = toggleWorkspaceTabPin(overLimit, "/page-0");
  assert.equal(unpinned.find(tab => tab.path === "/page-0").pinned, undefined);
  assert.ok(unpinned.find(tab => tab.path === "/dashboard").pinned);
});

test("restoration filters malformed, unknown and unauthorized routes and enforces tab capacity", () => {
  const stored = [
    ...Array.from({ length: MAX_WORKSPACE_TABS + 4 }, (_, i) => ({ path: `/page-${i}`, title: `P${i}` })),
    { path: "//evil.example", title: "خارج النظام" },
    { path: "/owner-center", title: "مركز المالك" },
  ];
  const restored = restoreWorkspaceTabs(stored, path => path !== "/owner-center");
  assert.equal(restored.length, MAX_WORKSPACE_TABS);
  assert.ok(restored.every(tab => !tab.path.startsWith("//") && tab.path !== "/owner-center"));
});

test("closing other tabs keeps the active and pinned tabs and protects dirty tabs until confirmed", () => {
  const tabs = [
    ...base,
    { path: "/sales", title: "المبيعات", dirty: true },
    { path: "/reports", title: "التقارير" },
    { path: "/settings", title: "الإعدادات", pinned: true },
  ];
  const protectedTabs = closeOtherWorkspaceTabs(tabs, "/reports");
  assert.deepEqual(protectedTabs.map(tab => tab.path), ["/dashboard", "/settings", "/sales", "/reports"]);
  const confirmed = closeOtherWorkspaceTabs(tabs, "/reports", { allowDirty: true });
  assert.deepEqual(confirmed.map(tab => tab.path), ["/dashboard", "/settings", "/reports"]);
});

test("tab storage scopes differ across users, companies and branches", () => {
  const a = createWorkspaceTabScope("user-a", "tenant-a", "company-a", "branch-a");
  assert.notEqual(a, createWorkspaceTabScope("user-b", "tenant-a", "company-a", "branch-a"));
  assert.notEqual(a, createWorkspaceTabScope("user-a", "tenant-b", "company-a", "branch-a"));
  assert.notEqual(a, createWorkspaceTabScope("user-a", "tenant-a", "company-b", "branch-a"));
  assert.notEqual(a, createWorkspaceTabScope("user-a", "tenant-a", "company-a", "branch-b"));
  assert.equal(createWorkspaceTabScope(null, "tenant-a", "company-a", "branch-a"), null);
});


test("tab capacity normalization preserves dirty state until explicit confirmation", () => {
  const tabs = addWorkspaceTab(base, { path: "/sales", title: "المبيعات", dirty: true });
  assert.equal(tabs.find((tab) => tab.path === "/sales").dirty, true);
  assert.equal(closeWorkspaceTab(tabs, "/sales").length, 2);
  assert.equal(closeWorkspaceTab(tabs, "/sales", { allowDirty: true }).length, 1);
});


test("workspace tab confirmations use accessible dialogs and never native alert or confirm", () => {
  const source = readFileSync(new URL("../src/components/workspace-tabs.tsx", import.meta.url), "utf8");
  assert.match(source, /useConfirmDialog/);
  assert.match(source, /shouldBlockFn: async/);
  assert.match(source, /title: "تغييرات غير محفوظة"/);
  assert.match(source, /title: "إغلاق التبويبات الأخرى؟"/);
  assert.match(source, /toast\.info\(/);
  assert.doesNotMatch(source, /window\.(?:alert|confirm|prompt)\(/);
});
