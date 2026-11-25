import { useEffect, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useSuperOwner } from "@/hooks/use-super-owner";
import { useBlocker, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  X, Home, Pin, PinOff, ShoppingCart, Receipt, Armchair, ChefHat, Package,
  ArrowLeftRight, ShoppingBag, Truck, Users, Wallet, BarChart3, Megaphone,
  Gift, Bell, Settings, UserRound, Building2, ShieldCheck, ClipboardList, Crown,
  BriefcaseBusiness, Tags, FileText, CircleHelp, LayoutGrid, PanelTopClose,
} from "lucide-react";

import {
  addWorkspaceTab, closeOtherWorkspaceTabs, closeWorkspaceTab,
  createWorkspaceTabScope, limitWorkspaceTabs, normalizeWorkspacePath,
  restoreWorkspaceTabs, toggleWorkspaceTabPin, workspacePathname,
  type WorkspaceTabRecord,
} from "@/lib/workspace-tabs-logic.mjs";

type WorkspaceTab = WorkspaceTabRecord;
type DirtyState = { path: string; dirty: boolean; scope?: string; source?: string };
const STORAGE_KEY = "ras-workspace-tabs-v3";
const MAX_PINNED_TABS = 6;
const DIRTY_KEY_SEPARATOR = "\\u0000";
function isPathDirty(paths: Set<string>, path: string): boolean {
  const normalized = normalizeWorkspacePath(path) ?? path;
  const base = workspacePathname(normalized);
  for (const entry of paths) {
    const separator = entry.indexOf(DIRTY_KEY_SEPARATOR);
    const dirtyPath = separator >= 0 ? entry.slice(0, separator) : entry;
    if (dirtyPath === normalized || dirtyPath === base) return true;
  }
  return false;
}
const ROUTE_TITLES: Array<[string, string]> = [
  ["/dashboard", "الرئيسية"], ["/pos", "نقطة البيع"], ["/sales", "المبيعات"],
  ["/tables", "الطاولات"], ["/kitchen", "المطبخ"], ["/inventory/movements", "حركات المخزون"],
  ["/inventory", "المخزون"], ["/purchases", "المشتريات"], ["/suppliers", "الموردون"],
  ["/products", "المنتجات"], ["/categories", "التصنيفات"], ["/customers", "العملاء"],
  ["/cash-sessions", "الورديات"], ["/expenses", "المصروفات"], ["/reports", "التقارير"],
  ["/hr/employees", "الموظفون"], ["/hr/attendance", "الحضور"], ["/hr/leaves", "الإجازات"],
  ["/hr/payroll", "الرواتب"], ["/hr/compensation", "التعويضات"], ["/branches", "الفروع"], ["/companies", "الشركات"],
  ["/users", "المستخدمون"], ["/users-admin", "إدارة المستخدمين"], ["/team-permissions", "صلاحيات الفرق"],
  ["/roles", "الأدوار والصلاحيات"], ["/departments", "الأقسام الإدارية"],
  ["/job-titles", "المسميات الوظيفية"], ["/employment-types", "أنواع التوظيف"],
  ["/notifications", "الإشعارات"], ["/settings", "الإعدادات"], ["/profile", "الملف الشخصي"],
  ["/ads", "الإعلانات"], ["/promotions", "العروض الترويجية"], ["/support", "الدعم والمساعدة"],
  ["/audit-logs", "سجل التدقيق"], ["/login-history", "سجل تسجيل الدخول"],
  ["/owner-center", "مركز المالك"], ["/admin", "إدارة النظام"], ["/expense-categories", "تصنيفات المصروفات"],
];

function iconFor(path: string) {
  if (path === "/dashboard") return Home;
  if (path.startsWith("/pos")) return ShoppingCart;
  if (path.startsWith("/sales")) return Receipt;
  if (path.startsWith("/tables")) return Armchair;
  if (path.startsWith("/kitchen")) return ChefHat;
  if (path.startsWith("/inventory/movements")) return ArrowLeftRight;
  if (path.startsWith("/inventory") || path.startsWith("/products")) return Package;
  if (path.startsWith("/purchases")) return ShoppingBag;
  if (path.startsWith("/suppliers")) return Truck;
  if (path.startsWith("/customers") || path.startsWith("/users")) return Users;
  if (path.startsWith("/cash-sessions") || path.startsWith("/expenses") || path.startsWith("/expense-categories")) return Wallet;
  if (path.startsWith("/reports")) return BarChart3;
  if (path.startsWith("/ads")) return Megaphone;
  if (path.startsWith("/promotions")) return Gift;
  if (path.startsWith("/notifications")) return Bell;
  if (path.startsWith("/settings")) return Settings;
  if (path.startsWith("/profile")) return UserRound;
  if (path.startsWith("/branches") || path.startsWith("/companies")) return Building2;
  if (path.startsWith("/owner-center")) return Crown;
  if (path.startsWith("/admin")) return ShieldCheck;
  if (path.startsWith("/roles") || path.startsWith("/team-permissions")) return ShieldCheck;
  if (path.startsWith("/audit-logs") || path.startsWith("/login-history")) return ClipboardList;
  if (path.startsWith("/hr/")) return BriefcaseBusiness;
  if (path.startsWith("/categories")) return Tags;
  if (path.startsWith("/support")) return CircleHelp;
  if (path.startsWith("/departments") || path.startsWith("/job-titles") || path.startsWith("/employment-types")) return FileText;
  return LayoutGrid;
}

function iconToneFor(path: string) {
  if (path.startsWith("/pos") || path.startsWith("/sales")) return "text-blue-600 bg-blue-50";
  if (path.startsWith("/tables")) return "text-rose-600 bg-rose-50";
  if (path.startsWith("/kitchen")) return "text-orange-600 bg-orange-50";
  if (path.startsWith("/inventory") || path.startsWith("/products") || path.startsWith("/categories")) return "text-violet-600 bg-violet-50";
  if (path.startsWith("/purchases") || path.startsWith("/suppliers")) return "text-emerald-600 bg-emerald-50";
  if (path.startsWith("/customers") || path.startsWith("/users")) return "text-fuchsia-600 bg-fuchsia-50";
  if (path.startsWith("/cash") || path.startsWith("/expenses")) return "text-amber-600 bg-amber-50";
  if (path.startsWith("/reports")) return "text-sky-600 bg-sky-50";
  if (path.startsWith("/ads") || path.startsWith("/promotions")) return "text-pink-600 bg-pink-50";
  if (path.startsWith("/hr/")) return "text-indigo-600 bg-indigo-50";
  if (path.startsWith("/branches") || path.startsWith("/companies") || path.startsWith("/departments")) return "text-cyan-700 bg-cyan-50";
  if (path.startsWith("/notifications")) return "text-red-600 bg-red-50";
  if (path.startsWith("/settings") || path.startsWith("/team-permissions") || path.startsWith("/roles")) return "text-slate-600 bg-slate-100";
  if (path.startsWith("/support")) return "text-teal-600 bg-teal-50";
  return "text-[#174b91] bg-blue-50";
}

function titleFor(path: string) {
  const match = ROUTE_TITLES.find(([route]) => path === route || path.startsWith(route + "/"));
  if (path.startsWith("/sales/")) return "تفاصيل الفاتورة";
  return match?.[1] ?? "صفحة النظام";
}

function readTabs(storageKey: string): unknown {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

const ROUTE_PERMISSIONS: Array<[string, string]> = [
  ["/dashboard", "dashboard.view"], ["/pos", "pos.use"], ["/sales", "sales.view"],
  ["/tables", "tables.view"], ["/kitchen", "kitchen.view"], ["/inventory/movements", "inventory.movements.view"],
  ["/inventory", "inventory.view"], ["/purchases", "purchases.view"], ["/suppliers", "suppliers.view"],
  ["/products", "products.view"], ["/categories", "categories.view"], ["/customers", "customers.view"],
  ["/cash-sessions", "cash.view"], ["/expenses", "expenses.view"], ["/reports", "reports.view"],
  ["/hr/employees", "hr.employees.view"], ["/hr/attendance", "hr.attendance.view"], ["/hr/leaves", "hr.leaves.view"],
  ["/hr/payroll", "hr.payroll.view"], ["/hr/compensation", "hr.compensation.view"], ["/branches", "branches.view"],
  ["/companies", "companies.view"], ["/users", "users.view"], ["/users-admin", "users.manage"],
  ["/team-permissions", "permissions.view"], ["/roles", "roles.view"], ["/departments", "departments.view"],
  ["/job-titles", "job_titles.view"], ["/employment-types", "employment_types.view"],
  ["/notifications", "notifications.view"], ["/settings", "settings.view"], ["/ads", "ads.manage"],
  ["/promotions", "promotions.manage"], ["/audit-logs", "audit.view"], ["/login-history", "login_history.view"],
  ["/expense-categories", "expense_categories.manage"],
];
function requiredPermission(path: string): string | null {
  return ROUTE_PERMISSIONS
    .filter(([prefix]) => path === prefix || path.startsWith(prefix + "/"))
    .sort((a, b) => b[0].length - a[0].length)[0]?.[1] ?? null;
}

export function WorkspaceTabs() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const locationHref = useRouterState({ select: (state) => state.location.href });
  const activePath = normalizeWorkspacePath(locationHref) ?? pathname;
  const navigate = useNavigate();
  const { tenantId, membership } = useActiveTenant();
  const { user } = useAuthSession();
  const { isSuperOwner } = useSuperOwner();
  const sessionScope = createWorkspaceTabScope(user?.id, tenantId, membership?.company_id, membership?.branch_id);
  const storageKey = sessionScope ? `${STORAGE_KEY}:${sessionScope}` : null;
  const permissionQuery = useQuery({
    queryKey: ["workspace-tabs-permissions", tenantId, user?.id],
    queryFn: async () => {
      if (!tenantId) return new Set<string>();
      const { data, error } = await supabase.rpc("get_my_permissions", { _tenant_id: tenantId });
      if (error) throw error;
      return new Set<string>((data ?? []) as string[]);
    },
    enabled: !!tenantId && !!user?.id && !isSuperOwner,
    staleTime: 30_000,
  });
  const [tabState, setTabState] = useState<{ scope: string | null; tabs: WorkspaceTab[] }>({
    scope: null,
    tabs: [{ path: "/dashboard", title: "الرئيسية", pinned: true }],
  });
  const [dirtyState, setDirtyState] = useState<{ scope: string | null; paths: Set<string> }>({
    scope: null,
    paths: new Set(),
  });
  const tabs = tabState.scope === storageKey && storageKey
    ? tabState.tabs
    : [{ path: "/dashboard", title: "الرئيسية", pinned: true }];
  const dirtyPaths = dirtyState.scope === sessionScope && sessionScope ? dirtyState.paths : new Set<string>();

  useEffect(() => {
    if (!storageKey || (!isSuperOwner && permissionQuery.isLoading)) return;
    if (!isSuperOwner && permissionQuery.isError) {
      setTabState({ scope: storageKey, tabs: [{ path: "/dashboard", title: "الرئيسية", pinned: true }] });
      return;
    }
    const restored = restoreWorkspaceTabs(readTabs(storageKey), (path) => {
      if (path === "/owner-center" || path === "/admin") return isSuperOwner;
      const knownRoute = ROUTE_TITLES.some(([prefix]) => path === prefix || path.startsWith(prefix + "/"));
      if (!knownRoute) return false;
      const permission = requiredPermission(path);
      return isSuperOwner || !permission || permissionQuery.data?.has(permission) === true;
    });
    setTabState({
      scope: storageKey,
      tabs: limitWorkspaceTabs([
        { path: "/dashboard", title: "الرئيسية", pinned: true },
        ...restored.filter((tab) => tab.path !== "/dashboard"),
      ]),
    });
  }, [storageKey, sessionScope, isSuperOwner, permissionQuery.data, permissionQuery.isLoading, permissionQuery.isError]);

  useEffect(() => {
    if (!storageKey || tabState.scope !== storageKey) return;
    setTabState((current) => current.scope !== storageKey ? current : {
      scope: storageKey,
      tabs: addWorkspaceTab(current.tabs, { path: activePath, title: titleFor(pathname) }),
    });
  }, [activePath, pathname, storageKey, tabState.scope]);

  useEffect(() => {
    if (!storageKey || tabState.scope !== storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(tabState.tabs)); } catch { /* storage is optional */ }
  }, [tabState, storageKey]);

  useEffect(() => {
    const onDirtyChange = (event: Event) => {
      const detail = (event as CustomEvent<DirtyState>).detail;
      if (!detail || typeof detail.path !== "string" || typeof detail.dirty !== "boolean") return;
      if (detail.scope && detail.scope !== sessionScope) return;
      const path = normalizeWorkspacePath(detail.path) ?? detail.path;
      const source = detail.source || "legacy";
      const dirtyKey = path + DIRTY_KEY_SEPARATOR + source;
      setDirtyState((current) => {
        const paths = current.scope === sessionScope ? new Set(current.paths) : new Set<string>();
        if (detail.dirty) paths.add(dirtyKey);
        else paths.delete(dirtyKey);
        return { scope: sessionScope, paths };
      });
    };
    window.addEventListener("ras-workspace-dirty-change", onDirtyChange);
    return () => window.removeEventListener("ras-workspace-dirty-change", onDirtyChange);
  }, [sessionScope]);

  const currentDirty = isPathDirty(dirtyPaths, activePath) || isPathDirty(dirtyPaths, pathname);
  useBlocker({
    shouldBlockFn: () => currentDirty && !window.confirm("توجد تغييرات غير محفوظة في هذه الصفحة. هل تريد مغادرتها دون حفظ؟"),
    enableBeforeUnload: currentDirty,
  });

  useEffect(() => {
    document.querySelector<HTMLElement>('[data-workspace-tab-active="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activePath, tabs.length]);

  function persist(nextTabs: WorkspaceTab[]) {
    setTabState({ scope: storageKey, tabs: limitWorkspaceTabs(nextTabs) });
  }

  function discardPath(path: string) {
    try {
      if (sessionScope) sessionStorage.removeItem(`ras-workspace-form-state-v1:${sessionScope}:${normalizeWorkspacePath(path) ?? path}`);
    } catch { /* Session storage is optional. */ }
    window.dispatchEvent(new CustomEvent("ras-workspace-form-discard", {
      detail: { path, scope: sessionScope },
    }));
    setDirtyState((current) => {
      const paths = current.scope === sessionScope ? new Set(current.paths) : new Set<string>();
      for (const key of paths) {
        const separator = key.indexOf(DIRTY_KEY_SEPARATOR);
        const keyPath = separator >= 0 ? key.slice(0, separator) : key;
        if (keyPath === path || keyPath === workspacePathname(path)) paths.delete(key);
      }
      return { scope: sessionScope, paths };
    });
  }

  function closeTab(path: string) {
    const target = tabs.find((tab) => tab.path === path);
    if (!target || target.pinned) return;
    const dirty = isPathDirty(dirtyPaths, path);
    if (dirty && !window.confirm("توجد تغييرات غير محفوظة في هذا التبويب. هل تريد إغلاقه وفقدان هذه التغييرات؟")) return;
    const next = closeWorkspaceTab(tabs.map(tab => ({
      ...tab, dirty: isPathDirty(dirtyPaths, tab.path),
    })), path, { allowDirty: true });
    if (next.length === tabs.length) return;
    discardPath(path);
    persist(next);
    if (activePath === path) {
      const fallback = next[next.length - 1]?.path ?? "/dashboard";
      navigate({ to: fallback as any });
    }
  }

  function closeOtherTabs() {
    const removableDirty = tabs.filter(tab => tab.path !== activePath && !tab.pinned &&
      isPathDirty(dirtyPaths, tab.path));
    if (removableDirty.length && !window.confirm("توجد تغييرات غير محفوظة في تبويبات أخرى. هل تريد إغلاق هذه التبويبات وفقدان تغييراتها؟")) return;
    const next = closeOtherWorkspaceTabs(tabs.map(tab => ({
      ...tab, dirty: isPathDirty(dirtyPaths, tab.path),
    })), activePath, { allowDirty: true });
    const retained = new Set(next.map(tab => tab.path));
    for (const tab of tabs) if (!retained.has(tab.path)) discardPath(tab.path);
    persist(next);
  }

  function togglePinned(path: string) {
    const target = tabs.find((tab) => tab.path === path);
    if (!target || path === "/dashboard") return;
    if (!target.pinned && tabs.filter((tab) => tab.pinned).length >= MAX_PINNED_TABS) {
      window.alert("يمكن تثبيت ستة تبويبات كحد أقصى حتى تبقى مساحة كافية لصفحات العمل.");
      return;
    }
    persist(toggleWorkspaceTabPin(tabs, path));
  }

  function onTabListKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex < 0 || !buttons.length) return;
    event.preventDefault();
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    let nextIndex = currentIndex;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = buttons.length - 1;
    else if (event.key === "ArrowRight") nextIndex = (currentIndex + (rtl ? -1 : 1) + buttons.length) % buttons.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex + (rtl ? 1 : -1) + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
    buttons[nextIndex]?.click();
  }

  return (
    <div className="flex min-w-0 items-center gap-2 border-b border-[#dce5f3] bg-[#f7faff]/95 px-2 py-2 sm:px-3" dir="rtl">
      <nav
        aria-label="تبويبات الصفحات المفتوحة"
        aria-orientation="horizontal"
        className="workspace-tabs flex min-h-12 min-w-0 flex-1 items-center gap-2 overflow-x-auto overscroll-x-contain py-1"
        role="tablist"
        onKeyDown={onTabListKeyDown}
      >
        {tabs.map((tab) => {
          const active = activePath === tab.path;
          const isDirty = isPathDirty(dirtyPaths, tab.path);
          return (
            <div key={tab.path} role="presentation" className={`group inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-2xl border px-2.5 py-2 text-sm font-semibold shadow-sm transition-all duration-200 sm:gap-2 sm:px-3.5 ${active ? "border-[#174b91] bg-[#174b91] text-white shadow-md shadow-blue-900/15" : "border-[#dce5f3] bg-white text-[#344b70] hover:border-[#9bb7df] hover:bg-[#f8fbff] hover:shadow-md"}`}>
              <button
                type="button"
                onClick={() => navigate({ to: tab.path as any })}
                className="inline-flex min-h-9 min-w-0 items-center gap-2 whitespace-nowrap rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[#e0ad36] focus-visible:ring-offset-2"
                role="tab"
                tabIndex={active ? 0 : -1}
                aria-selected={active}
                aria-current={active ? "page" : undefined}
                aria-label={`${tab.title}${isDirty ? " — تغييرات غير محفوظة" : ""}`}
                data-workspace-tab-active={active ? "true" : undefined}
              >
                {(() => { const TabIcon = iconFor(tab.path); return <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${active ? "bg-white/15 text-white" : iconToneFor(tab.path)}`}><TabIcon className="h-4 w-4" aria-hidden="true" /></span>; })()}
                <span className="max-w-[9rem] truncate sm:max-w-[13rem]">{tab.title}</span>
                {isDirty && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" title="تغييرات غير محفوظة" aria-label="تغييرات غير محفوظة" />}
              </button>
              {tab.path !== "/dashboard" && (
                <button type="button" onClick={() => togglePinned(tab.path)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full opacity-70 outline-none hover:bg-black/10 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-[#e0ad36]" aria-label={tab.pinned ? `إلغاء تثبيت ${tab.title}` : `تثبيت ${tab.title}`} title={tab.pinned ? "إلغاء التثبيت" : "تثبيت التبويب"}>
                  {tab.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </button>
              )}
              {!tab.pinned && (
                <button type="button" onClick={() => closeTab(tab.path)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full opacity-70 outline-none hover:bg-black/10 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-[#e0ad36]" aria-label={`إغلاق تبويب ${tab.title}`} title="إغلاق التبويب">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
      </nav>
      {tabs.some(tab => tab.path !== activePath && !tab.pinned) && (
        <button
          type="button"
          onClick={closeOtherTabs}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#dce5f3] bg-white text-[#344b70] shadow-sm outline-none hover:border-[#174b91] hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-[#174b91]"
          aria-label="إغلاق جميع التبويبات الأخرى"
          title="إغلاق التبويبات الأخرى"
        >
          <PanelTopClose className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
