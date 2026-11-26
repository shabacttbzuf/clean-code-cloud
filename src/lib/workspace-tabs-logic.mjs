export const MAX_WORKSPACE_TABS = 12;
export const MAX_PINNED_WORKSPACE_TABS = 6;

export function normalizeWorkspacePath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.length > 1000) return null;
  const withoutHash = value.split("#", 1)[0];
  const queryIndex = withoutHash.indexOf("?");
  const pathname = queryIndex < 0 ? withoutHash : withoutHash.slice(0, queryIndex);
  const query = queryIndex < 0 ? "" : withoutHash.slice(queryIndex + 1);
  if (!pathname || pathname.startsWith("//") || pathname.includes("\0")) return null;
  const params = new URLSearchParams(query);
  params.sort();
  const search = params.toString();
  return pathname + (search ? "?" + search : "");
}

export function workspacePathname(value) {
  return normalizeWorkspacePath(value)?.split("?", 1)[0] ?? "/";
}

export function createWorkspaceTabScope(userId, tenantId, companyId, branchId) {
  if (!userId || !tenantId) return null;
  return [userId, tenantId, companyId || "none", branchId || "none"].map(encodeURIComponent).join(":");
}

export function limitWorkspaceTabs(tabs) {
  const seen = new Set();
  const unique = [];
  for (const tab of tabs) {
    const path = normalizeWorkspacePath(tab?.path);
    if (!path || seen.has(path) || typeof tab.title !== "string") continue;
    seen.add(path);
    unique.push({ path, title: tab.title.slice(0, 100), ...(tab.pinned ? { pinned: true } : {}) });
  }
  const pinned = unique.filter(tab => tab.pinned).slice(0, MAX_PINNED_WORKSPACE_TABS);
  const unpinned = unique.filter(tab => !tab.pinned);
  return [...pinned, ...unpinned.slice(-(MAX_WORKSPACE_TABS - pinned.length))].map(tab => ({ ...tab, ...(tab.dirty ? { dirty: true } : {}) }));
}

export function addWorkspaceTab(tabs, tab) {
  const path = normalizeWorkspacePath(tab?.path);
  if (!path) return limitWorkspaceTabs(tabs);
  const existing = tabs.find(item => normalizeWorkspacePath(item.path) === path);
  const next = existing
    ? tabs.map(item => normalizeWorkspacePath(item.path) === path ? { ...item, title: tab.title } : item)
    : [...tabs, { path, title: tab.title, ...(tab.pinned ? { pinned: true } : {}), ...(tab.dirty ? { dirty: true } : {}) }];
  return limitWorkspaceTabs(next);
}

export function closeWorkspaceTab(tabs, path, { allowDirty = false } = {}) {
  const normalized = normalizeWorkspacePath(path);
  const target = tabs.find(tab => normalizeWorkspacePath(tab.path) === normalized);
  if (!target || target.pinned || (target.dirty && !allowDirty)) return tabs;
  return tabs.filter(tab => normalizeWorkspacePath(tab.path) !== normalized);
}

export function toggleWorkspaceTabPin(tabs, path) {
  const normalized = normalizeWorkspacePath(path);
  const target = tabs.find(tab => normalizeWorkspacePath(tab.path) === normalized);
  if (!target || normalized === "/dashboard") return tabs;
  if (!target.pinned && tabs.filter(tab => tab.pinned).length >= MAX_PINNED_WORKSPACE_TABS) return tabs;
  return limitWorkspaceTabs(tabs.map(tab => normalizeWorkspacePath(tab.path) === normalized
    ? { ...tab, pinned: !tab.pinned } : tab));
}

export function closeOtherWorkspaceTabs(tabs, activePath, { allowDirty = false } = {}) {
  const active = normalizeWorkspacePath(activePath);
  return limitWorkspaceTabs(tabs.filter(tab =>
    normalizeWorkspacePath(tab.path) === active || tab.pinned || (tab.dirty && !allowDirty)
  ));
}

export function restoreWorkspaceTabs(rawTabs, isAllowed) {
  if (!Array.isArray(rawTabs)) return [];
  const valid = rawTabs.flatMap(tab => {
    if (!tab || typeof tab !== "object" || typeof tab.path !== "string" ||
      typeof tab.title !== "string" || (tab.pinned !== undefined && typeof tab.pinned !== "boolean")) return [];
    const path = normalizeWorkspacePath(tab.path);
    if (!path || !isAllowed(workspacePathname(path))) return [];
    return [{ path, title: tab.title.slice(0, 100), ...(tab.pinned ? { pinned: true } : {}) }];
  });
  return limitWorkspaceTabs(valid);
}
