export type CustomShortcut = { title: string; url: string };

export const CUSTOM_SHORTCUT_ROUTES = new Set([
  "/dashboard", "/pos", "/sales", "/tables", "/kitchen", "/products", "/inventory",
  "/inventory/movements", "/purchases", "/suppliers", "/reports", "/customers",
  "/cash-sessions", "/expenses", "/expense-categories", "/branches", "/categories",
  "/users", "/users-admin", "/companies", "/departments", "/job-titles",
  "/employment-types", "/roles", "/team-permissions", "/notifications",
  "/hr/employees", "/hr/attendance", "/hr/leaves", "/hr/compensation", "/hr/payroll",
  "/ads", "/promotions", "/support", "/profile", "/settings",
]);

export function isAllowedCustomShortcutRoute(value: unknown): value is string {
  return typeof value === "string" && CUSTOM_SHORTCUT_ROUTES.has(value);
}

export function normalizeCustomShortcuts(value: unknown): CustomShortcut[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const normalized: CustomShortcut[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const url = item.url;
    if (!title || title.length > 28 || !isAllowedCustomShortcutRoute(url) || seen.has(url)) continue;
    seen.add(url);
    normalized.push({ title, url });
    if (normalized.length === 12) break;
  }
  return normalized;
}
