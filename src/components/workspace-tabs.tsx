import { useEffect, useMemo, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { X, Home, Pin, PinOff } from "lucide-react";

type WorkspaceTab = { path: string; title: string; pinned?: boolean };
const STORAGE_KEY = "ras-workspace-tabs-v1";
const MAX_TABS = 12;
const ROUTE_TITLES: Array<[string, string]> = [
  ["/dashboard", "الرئيسية"], ["/pos", "نقطة البيع"], ["/sales", "المبيعات"],
  ["/tables", "الطاولات"], ["/kitchen", "المطبخ"], ["/inventory/movements", "حركات المخزون"],
  ["/inventory", "المخزون"], ["/purchases", "المشتريات"], ["/suppliers", "الموردون"],
  ["/products", "المنتجات"], ["/categories", "التصنيفات"], ["/customers", "العملاء"],
  ["/cash-sessions", "الورديات"], ["/expenses", "المصروفات"], ["/reports", "التقارير"],
  ["/hr/employees", "الموظفون"], ["/hr/attendance", "الحضور"], ["/hr/leaves", "الإجازات"],
  ["/hr/payroll", "الرواتب"], ["/branches", "الفروع"], ["/companies", "الشركات"],
  ["/users", "المستخدمون"], ["/team-permissions", "الصلاحيات"], ["/notifications", "الإشعارات"],
  ["/settings", "الإعدادات"], ["/profile", "الملف الشخصي"], ["/ads", "الإعلانات"], ["/promotions", "العروض الترويجية"],
];

function titleFor(path: string) {
  const match = ROUTE_TITLES.find(([route]) => path === route || path.startsWith(route + "/"));
  if (path.startsWith("/sales/")) return "تفاصيل الفاتورة";
  return match?.[1] ?? "صفحة النظام";
}

function readTabs(): WorkspaceTab[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter((tab): tab is WorkspaceTab =>
      !!tab && typeof tab.path === "string" && typeof tab.title === "string" &&
      tab.path.startsWith("/") && !tab.path.startsWith("//") &&
      (tab.pinned === undefined || typeof tab.pinned === "boolean")
    );
    return valid.slice(-MAX_TABS);
  } catch { return []; }
}

function limitTabs(tabs: WorkspaceTab[]) {
  const unique = tabs.filter((tab, index, all) => all.findIndex((candidate) => candidate.path === tab.path) === index);
  const pinned = unique.filter((tab) => tab.pinned);
  const unpinned = unique.filter((tab) => !tab.pinned);
  return [...pinned, ...unpinned.slice(-(MAX_TABS - pinned.length))];
}

export function WorkspaceTabs() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const [tabs, setTabs] = useState<WorkspaceTab[]>(() => limitTabs([
    { path: "/dashboard", title: "الرئيسية", pinned: true },
    ...readTabs().filter((tab) => tab.path !== "/dashboard"),
  ]));

  function persist(nextTabs: WorkspaceTab[]) {
    const limited = limitTabs(nextTabs);
    setTabs(limited);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(limited)); } catch { /* storage is optional */ }
  }

  useEffect(() => {
    setTabs((current) => {
      const existing = current.find((tab) => tab.path === pathname);
      const next = existing
        ? current.map((tab) => tab.path === pathname ? { ...tab, title: titleFor(pathname) } : tab)
        : [...current, { path: pathname, title: titleFor(pathname) }];
      const limited = limitTabs(next);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(limited)); } catch { /* storage is optional */ }
      return limited;
    });
  }, [pathname]);

  const activePath = useMemo(() => pathname, [pathname]);

  function closeTab(path: string) {
    const target = tabs.find((tab) => tab.path === path);
    if (!target || target.pinned) return;
    const next = tabs.filter((tab) => tab.path !== path);
    persist(next);
    if (activePath === path) {
      const fallback = next[next.length - 1]?.path ?? "/dashboard";
      navigate({ to: fallback as any });
    }
  }

  function togglePinned(path: string) {
    const target = tabs.find((tab) => tab.path === path);
    if (!target || path === "/dashboard") return;
    persist(tabs.map((tab) => tab.path === path ? { ...tab, pinned: !tab.pinned } : tab));
  }

  return (
    <nav aria-label="تبويبات الصفحات المفتوحة" className="workspace-tabs flex min-h-12 items-center gap-2 overflow-x-auto border-b px-3 py-2">
      {tabs.map((tab) => {
        const active = activePath === tab.path;
        return (
          <div key={tab.path} className={`group inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${active ? "border-primary/30 bg-primary text-primary-foreground shadow-sm" : "border-border bg-card text-foreground hover:border-primary/30 hover:bg-primary/5"}`}>
            <button type="button" onClick={() => navigate({ to: tab.path as any })} className="inline-flex min-h-9 items-center gap-2 whitespace-nowrap" aria-current={active ? "page" : undefined}>
              {tab.path === "/dashboard" ? <Home className="h-4 w-4" /> : null}
              <span>{tab.title}</span>
            </button>
            {tab.path !== "/dashboard" && (
              <button type="button" onClick={() => togglePinned(tab.path)} className="workspace-tab-action inline-grid min-h-9 min-w-9 shrink-0 place-items-center rounded-full p-1 opacity-70 hover:bg-black/10 hover:opacity-100" aria-label={tab.pinned ? `إلغاء تثبيت ${tab.title}` : `تثبيت ${tab.title}`} title={tab.pinned ? "إلغاء التثبيت" : "تثبيت التبويب"}>
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
