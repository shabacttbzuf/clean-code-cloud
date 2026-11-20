import { useEffect, useMemo, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { X, Home, Pin } from "lucide-react";

type WorkspaceTab = { path: string; title: string; pinned?: boolean };
const STORAGE_KEY = "ras-workspace-tabs-v1";
const ROUTE_TITLES: Array<[string, string]> = [
  ["/dashboard", "الرئيسية"], ["/pos", "نقطة البيع"], ["/sales", "المبيعات"],
  ["/tables", "الطاولات"], ["/kitchen", "المطبخ"], ["/inventory/movements", "حركات المخزون"],
  ["/inventory", "المخزون"], ["/purchases", "المشتريات"], ["/suppliers", "الموردون"],
  ["/products", "المنتجات"], ["/categories", "التصنيفات"], ["/customers", "العملاء"],
  ["/cash-sessions", "الورديات"], ["/expenses", "المصروفات"], ["/reports", "التقارير"],
  ["/hr/employees", "الموظفون"], ["/hr/attendance", "الحضور"], ["/hr/leaves", "الإجازات"],
  ["/hr/payroll", "الرواتب"], ["/branches", "الفروع"], ["/companies", "الشركات"],
  ["/users", "المستخدمون"], ["/team-permissions", "الصلاحيات"], ["/notifications", "الإشعارات"],
  ["/settings", "الإعدادات"], ["/profile", "الملف الشخصي"], ["/ads", "الإعلانات"],
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
    return parsed.filter((tab): tab is WorkspaceTab =>
      !!tab && typeof tab.path === "string" && typeof tab.title === "string" &&
      tab.path.startsWith("/") && !tab.path.startsWith("//")
    ).slice(-12);
  } catch { return []; }
}

export function WorkspaceTabs() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const [tabs, setTabs] = useState<WorkspaceTab[]>(() => [
    { path: "/dashboard", title: "الرئيسية", pinned: true },
    ...readTabs().filter((tab) => tab.path !== "/dashboard"),
  ]);

  useEffect(() => {
    setTabs((current) => {
      const existing = current.find((tab) => tab.path === pathname);
      const next = existing
        ? current.map((tab) => tab.path === pathname ? { ...tab, title: titleFor(pathname) } : tab)
        : [...current, { path: pathname, title: titleFor(pathname) }].slice(-12);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage is optional */ }
      return next;
    });
  }, [pathname]);

  const activePath = useMemo(() => pathname, [pathname]);

  function closeTab(path: string) {
    const target = tabs.find((tab) => tab.path === path);
    if (!target || target.pinned) return;
    const next = tabs.filter((tab) => tab.path !== path);
    setTabs(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage is optional */ }
    if (activePath === path) {
      const fallback = next[next.length - 1]?.path ?? "/dashboard";
      navigate({ to: fallback as any });
    }
  }

  return (
    <nav aria-label="تبويبات الصفحات المفتوحة" className="workspace-tabs flex min-h-12 items-center gap-2 overflow-x-auto border-b px-3 py-2">
      {tabs.map((tab) => {
        const active = activePath === tab.path;
        return (
          <div key={tab.path} className={`group inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${active ? "border-primary/30 bg-primary text-primary-foreground shadow-sm" : "border-border bg-card text-foreground hover:border-primary/30 hover:bg-primary/5"}`}>
            <button type="button" onClick={() => navigate({ to: tab.path as any })} className="inline-flex items-center gap-2 whitespace-nowrap" aria-current={active ? "page" : undefined}>
              {tab.path === "/dashboard" ? <Home className="h-4 w-4" /> : null}
              <span>{tab.title}</span>
              {tab.pinned ? <Pin className="h-3 w-3 opacity-70" /> : null}
            </button>
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
