export function safeInternalNotificationPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const base = "https://internal-notification.invalid";
    const target = new URL(value, base);
    if (target.origin !== base || !target.pathname.startsWith("/") || target.pathname.startsWith("//")) return null;
    const decodedPath = decodeURIComponent(target.pathname);
    if (decodedPath.startsWith("//") || decodedPath.includes("\\")) return null;
    return target.pathname + target.search + target.hash;
  } catch {
    return null;
  }
}
export function notificationPathPermission(value: string): string | null {
  const path = value.split(/[?#]/, 1)[0] ?? value;
  const rules: Array<[string, string]> = [
    ["/inventory/movements", "inventory.movements.view"],
    ["/hr/employees", "hr.employees.view"],
    ["/hr/attendance", "hr.attendance.view"],
    ["/hr/leaves", "hr.leaves.view"],
    ["/hr/compensation", "hr.compensation.view"],
    ["/hr/payroll", "hr.payroll.view"],
    ["/expense-categories", "expense_categories.manage"],
    ["/users-admin", "users.manage"],
    ["/team-permissions", "permissions.view"],
    ["/notifications", "notifications.view"],
    ["/dashboard", "dashboard.view"],
    ["/reports", "reports.view"],
    ["/pos", "pos.use"],
    ["/kitchen", "kitchen.view"],
    ["/tables", "tables.view"],
    ["/sales", "sales.view"],
    ["/cash-sessions", "cash.view"],
    ["/customers", "customers.view"],
    ["/inventory", "inventory.view"],
    ["/suppliers", "suppliers.view"],
    ["/purchases", "purchases.view"],
    ["/expenses", "expenses.view"],
    ["/branches", "branches.view"],
    ["/products", "products.view"],
    ["/categories", "categories.view"],
    ["/users", "users.view"],
    ["/ads", "ads.manage"],
    ["/promotions", "promotions.manage"],
    ["/settings", "settings.view"],
    ["/companies", "companies.view"],
    ["/roles", "roles.view"],
  ];
  const match = rules.filter(([prefix]) => path === prefix || path.startsWith(prefix + "/"))
    .sort((a, b) => b[0].length - a[0].length)[0];
  return match?.[1] ?? null;
}
