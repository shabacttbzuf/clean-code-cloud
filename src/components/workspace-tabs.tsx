import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useSuperOwner } from "@/hooks/use-super-owner";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  X, Home, Pin, PinOff, ShoppingCart, Receipt, Armchair, ChefHat, Package,
  ArrowLeftRight, ShoppingBag, Truck, Users, Wallet, BarChart3, Megaphone,
  Gift, Bell, Settings, UserRound, Building2, ShieldCheck, ClipboardList,
  BriefcaseBusiness, Tags, FileText, CircleHelp, LayoutGrid,
} from "lucide-react";

type WorkspaceTab = { path: string; title: string; pinned?: boolean };
type DirtyState = { path: string; dirty: boolean };

// Pages dispatch ras-workspace-dirty-change with { path, dirty } when edits are pending.
const STORAGE_KEY = "ras-workspace-tabs-v2";
const MAX_TABS = 12;
const MAX_PINNED_TABS = 6;
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
  if (path.startsWith("/cash-sessions") || path.startsWith("/expenses")) return Wallet;
  if (path.startsWith("/reports")) return BarChart3;
  if (path.startsWith("/ads")) return Megaphone;
  if (path.startsWith("/promotions")) return Gift;
  if (path.startsWith("/notifications")) return Bell;
  if (path.startsWith("/settings")) return Settings;
  if (path.startsWith("/profile")) return UserRound;
  if (path.startsWith("/branches") || path.startsWith("/companies")) return Building2;
  if (path.startsWith("/roles") || path.startsWith("/team-permissions")) return ShieldCheck;
  if (path.startsWith("/audit-logs") || path.startsWith("/login-history")) return ClipboardList;
  if (path.startsWith("/hr/")) return BriefcaseBusiness;
  if (path.startsWith("/categories")) return Tags;
  if (path.startsWith("/support")) return CircleHelp;
  if (path.startsWith("/departments") || path.startsWith("/job-titles")) return FileText;
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

function readTabs(storageKey: string): WorkspaceTab[] {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter((tab): tab is WorkspaceTab =>
      !!tab && typeof tab.path === "string" && tab.path.length <= 500 &&
      typeof tab.title === "string" && tab.title.length <= 100 &&
      tab.path.startsWith("/") && !tab.path.startsWith("//") && !tab.path.includes("\\") &&
      (tab.pinned === undefined || typeof tab.pinned === "boolean")
    );
    return valid.slice(-MAX_TABS);
  } catch { return []; }
}

function limitTabs(tabs: WorkspaceTab[]) {
  const unique = tabs.filter((tab, index, all) => all.findIndex((candidate) => candidate.path === tab.path) === index);
  // Keep the dashboard pinned and reserve capacity for the active working tabs.
  const pinned = unique.filter((tab) => tab.pinned).slice(0, MAX_PINNED_TABS);
  const unpinned = unique.filter((tab) => !tab.pinned);
  return [...pinned, ...unpinned.slice(-(MAX_TABS - pinned.length))];
}

export function WorkspaceTabs() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(() => new Set());
  const [tabs, setTabs] = useState<WorkspaceTab[]>([
    { path: "/dashboard", title: "الرئيسية", pinned: true },
  ]);

  function persist(nextTabs: WorkspaceTab[]) {
    const limited = limitTabs(nextTabs);
    setTabs(limited);
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(limited)); } catch { /* storage is optional */ }
    }
  }

  useEffect(() => {
    if (!storageKey || (!isSuperOwner && permissionQuery.isLoading)) return;
    if (restoredScope.current === storageKey) return;
    restoredScope.current = storageKey;
    const restored = readTabs(storageKey).filter((tab) => {
      const permission = requiredPermission(tab.path);
      return isSuperOwner || !permission || permissionQuery.data?.has(permission) === true;
    });
    setTabs(limitTabs([
      { path: "/dashboard", title: "الرئيسية", pinned: true },
      ...restored.filter((tab) => tab.path !== "/dashboard"),
    ]));
  }, [storageKey, isSuperOwner, permissionQuery.data, permissionQuery.isLoading]);

  useEffect(() => {
    setTabs((current) => {
      const existing = current.find((tab) => tab.path === pathname);
      const next = existing
        ? current.map((tab) => tab.path === pathname ? { ...tab, title: titleFor(pathname) } : tab)
        : [...current, { path: pathname, title: titleFor(pathname) }];
      const limited = limitTabs(next);
      if (storageKey) {
        try { localStorage.setItem(storageKey, JSON.stringify(limited)); } catch { /* storage is optional */ }
      }
      return limited;
    });
  }, [pathname, storageKey]);

  const activePath = useMemo(() => pathname, [pathname]);

  useEffect(() => {
    const onDirtyChange = (event: Event) => {
      const detail = (event as CustomEvent<DirtyState>).detail;
      if (!detail || typeof detail.path !== "string" || typeof detail.dirty !== "boolean") return;
      setDirtyPaths((current) => {
        const next = new Set(current);
        if (detail.dirty) next.add(detail.path);
        else next.delete(detail.path);
        return next;
      });
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyPaths.size) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("ras-workspace-dirty-change", onDirtyChange);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("ras-workspace-dirty-change", onDirtyChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [dirtyPaths]);

  function closeTab(path: string) {
    const target = tabs.find((tab) => tab.path === path);
    if (!target || target.pinned) return;
    if (dirtyPaths.has(path) && !window.confirm("توجد تغييرات غير محفوظة في هذه الصفحة. هل تريد إغلاق التبويب رغم ذلك؟")) return;
    const next = tabs.filter((tab) => tab.path !== path);
    setDirtyPaths((current) => {
      const updated = new Set(current);
      updated.delete(path);
      return updated;
    });
    persist(next);
    if (activePath === path) {
      const fallback = next[next.length - 1]?.path ?? "/dashboard";
      navigate({ to: fallback as any });
    }
  }

  function togglePinned(path: string) {
    const target = tabs.find((tab) => tab.path === path);
    if (!target || path === "/dashboard") return;
    if (!target.pinned && tabs.filter((tab) => tab.pinned).length >= MAX_PINNED_TABS) {
      window.alert("يمكن تثبيت ستة تبويبات كحد أقصى حتى تبقى مساحة كافية لصفحات العمل.");
      return;
    }
    persist(tabs.map((tab) => tab.path === path ? { ...tab, pinned: !tab.pinned } : tab));
  }

  return (
    <nav aria-label="تبويبات الصفحات المفتوحة" className="workspace-tabs flex min-h-[58px] min-w-0 items-center gap-2 overflow-x-auto overscroll-x-contain border-b border-[#dce5f3] bg-[#f7faff]/95 px-3 py-2.5" role="tablist">
      {tabs.map((tab) => {
        const active = activePath === tab.path;
        return (
          <div key={tab.path} className={`group inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border px-3.5 py-2 text-sm font-semibold shadow-sm transition-all duration-200 ${active ? "border-[#174b91] bg-[#174b91] text-white shadow-md shadow-blue-900/15" : "border-[#dce5f3] bg-white text-[#344b70] hover:-translate-y-0.5 hover:border-[#9bb7df] hover:bg-[#f8fbff] hover:shadow-md"}`}>
            <button type="button" onClick={() => navigate({ to: tab.path as any })} className="inline-flex min-h-8 items-center gap-2 whitespace-nowrap" role="tab" aria-selected={active} aria-current={active ? "page" : undefined}>
              {(() => { const TabIcon = iconFor(tab.path); return <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${active ? "bg-white/15 text-white" : iconToneFor(tab.path)}`}><TabIcon className="h-4 w-4" aria-hidden="true" /></span>; })()}
              <span>{tab.title}</span>
              {dirtyPaths.has(tab.path) && <span className="h-2 w-2 rounded-full bg-amber-400" title="تغييرات غير محفوظة" aria-label="تغييرات غير محفوظة" />}
            </button>
            {tab.path !== "/dashboard" && (
              <button type="button" onClick={() => togglePinned(tab.path)} className="rounded-full p-0.5 opacity-60 hover:bg-black/10 hover:opacity-100" aria-label={tab.pinned ? `إلغاء تثبيت ${tab.title}` : `تثبيت ${tab.title}`} title={tab.pinned ? "إلغاء التثبيت" : "تثبيت التبويب"}>
                {tab.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              </button>
            )}
            {!tab.pinned && (
              <button type="button" onClick={() => closeTab(tab.path)} className="rounded-full p-0.5 opacity-60 hover:bg-black/10 hover:opacity-100" aria-label={`إغلاق تبويب ${tab.title}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </nav>
  );
}
