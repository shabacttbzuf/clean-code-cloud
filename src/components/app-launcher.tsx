import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Search, LayoutGrid, Crown, Building, Briefcase, BadgeCheck,
  KeyRound, History, UsersRound, ShieldCheck, ScrollText, Palette, Bookmark, Star, X, Clock,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { normalizeCustomShortcuts } from "@/lib/navigation-shortcuts";
import { useSuperOwner } from "@/hooks/use-super-owner";
import { appNavigationGroups, navigationIconTone, type AppNavigationGroup } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CustomShortcut = { title: string; url: string };
type NavOverride = { title?: string; hidden?: boolean };

export function AppLauncher() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const launcherRef = useRef<HTMLDivElement>(null);
  const [customItems, setCustomItems] = useState<CustomShortcut[]>([]);
  const [navOverrides, setNavOverrides] = useState<Record<string, NavOverride>>({});
  const [favoriteUrls, setFavoriteUrls] = useState<string[]>([]);
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const { tenantId, userId } = useActiveTenant();
  const { isSuperOwner, totalCount } = useSuperOwner();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !launcherRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); setSearch(""); }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    const read = () => {
      try {
        const raw = window.localStorage.getItem("ras-custom-sidebar-items-v1");
        const parsed = raw ? JSON.parse(raw) : [];
        setCustomItems(normalizeCustomShortcuts(parsed));
      } catch { setCustomItems([]); }
      try {
        const raw = window.localStorage.getItem("ras-sidebar-overrides-v1");
        const parsed = raw ? JSON.parse(raw) : {};
        setNavOverrides(parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {});
      } catch { setNavOverrides({}); }
    };
    read();
    window.addEventListener("ras-custom-tabs-updated", read);
    window.addEventListener("ras-sidebar-overrides-updated", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("ras-custom-tabs-updated", read);
      window.removeEventListener("ras-sidebar-overrides-updated", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  useEffect(() => {
    try {
      const favorites = JSON.parse(window.localStorage.getItem("ras-app-launcher-favorites-v1") || "[]");
      setFavoriteUrls(Array.isArray(favorites) ? favorites.filter((value): value is string => typeof value === "string") : []);
    } catch { setFavoriteUrls([]); }
    try {
      const usage = JSON.parse(window.localStorage.getItem("ras-app-launcher-usage-v1") || "{}");
      setUsageCounts(usage && typeof usage === "object" && !Array.isArray(usage) ? usage : {});
    } catch { setUsageCounts({}); }
  }, []);

  const toggleFavorite = (url: string) => {
    setFavoriteUrls((current) => {
      const next = current.includes(url) ? current.filter((item) => item !== url) : [...current, url];
      try { window.localStorage.setItem("ras-app-launcher-favorites-v1", JSON.stringify(next)); } catch { /* storage may be unavailable */ }
      return next;
    });
  };

  const recordUsage = (url: string) => {
    setUsageCounts((current) => {
      const next = { ...current, [url]: (current[url] ?? 0) + 1 };
      try { window.localStorage.setItem("ras-app-launcher-usage-v1", JSON.stringify(next)); } catch { /* storage may be unavailable */ }
      return next;
    });
  };

  const permissions = useQuery({
    queryKey: ["app-launcher-permissions", tenantId, userId],
    queryFn: async () => {
      if (!tenantId) return new Set<string>();
      const { data, error } = await supabase.rpc("get_my_permissions", { _tenant_id: tenantId });
      if (error) throw error;
      return new Set<string>((data ?? []) as string[]);
    },
    enabled: !!tenantId && !!userId && !isSuperOwner,
    staleTime: 30_000,
  });

  const groups = useMemo(() => {
    const allowed = (item: { permission?: string }) =>
      isSuperOwner || (!!permissions.data && (!item.permission || permissions.data.has(item.permission)));
    const enterpriseGroup: AppNavigationGroup = {
      label: "المؤسسة",
      items: [
        { title: "إدارة المستخدمين", url: "/users-admin", icon: UsersRound, permission: "users.manage" },
        { title: "الشركات", url: "/companies", icon: Building, permission: "companies.view" },
        { title: "الأقسام الإدارية", url: "/departments", icon: Briefcase, permission: "departments.view" },
        { title: "المسميات الوظيفية", url: "/job-titles", icon: BadgeCheck, permission: "job_titles.view" },
        { title: "أنواع التوظيف", url: "/employment-types", icon: BadgeCheck, permission: "employment_types.view" },
        { title: "إدارة الأدوار", url: "/roles", icon: KeyRound, permission: "roles.view" },
        { title: "سجل الدخول", url: "/login-history", icon: History, permission: "login_history.view" },
      ],
    };
    const systemItems = [];
    if (isSuperOwner) systemItems.push({ title: "مركز تحكم المالك", url: "/owner-center", icon: Crown });
    if (isSuperOwner) systemItems.push({ title: "استوديو تطوير النظام", url: "/settings#developer-studio", icon: Palette });
    if (isSuperOwner || totalCount === 0) systemItems.push({ title: "إدارة النظام", url: "/admin", icon: ShieldCheck });
    systemItems.push({ title: "سجل التدقيق", url: "/audit-logs", icon: ScrollText, permission: "audit.view" });

    const sourceGroups: AppNavigationGroup[] = [
      ...appNavigationGroups,
      enterpriseGroup,
      { label: "النظام", items: systemItems },
      ...(isSuperOwner && customItems.length ? [{
        label: "اختصارات مخصصة",
        items: customItems.map((item) => ({ title: item.title, url: item.url, icon: Bookmark })),
      }] : []),
    ];

    const needle = search.trim().toLocaleLowerCase("ar");
    return sourceGroups.map((group) => ({
      ...group,
      items: group.items
        .filter((item) => {
          const basePath = item.url.split("#")[0];
          const effectiveTitle = navOverrides[basePath]?.title?.trim() || item.title;
          return !navOverrides[basePath]?.hidden && allowed(item) &&
            (effectiveTitle.toLocaleLowerCase("ar").includes(needle) || group.label.toLocaleLowerCase("ar").includes(needle));
        })
        .map((item) => ({
          ...item,
          title: navOverrides[item.url.split("#")[0]]?.title?.trim() || item.title,
        })),
    })).filter((group) => group.items.length);
  }, [isSuperOwner, totalCount, permissions.data, customItems, navOverrides, search]);

  // Build shortcuts only from the currently visible, permission-filtered navigation.
  // This prevents stale local favorites/usage entries from exposing inaccessible routes.
  const visibleItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const favorites = useMemo(
    () => visibleItems.filter((item) => favoriteUrls.includes(item.url)),
    [visibleItems, favoriteUrls],
  );
  const mostUsed = useMemo(
    () => visibleItems
      .filter((item) => (usageCounts[item.url] ?? 0) > 0)
      .sort((a, b) => (usageCounts[b.url] ?? 0) - (usageCounts[a.url] ?? 0))
      .slice(0, 6),
    [visibleItems, usageCounts],
  );

  return (
    <div className="relative" ref={launcherRef}>
      <Button type="button" variant="outline" size="icon" title="التطبيقات" aria-label="فتح التطبيقات" className="h-10 w-10 shrink-0 rounded-xl border-[#dce5f3] bg-white text-[#174b91] shadow-sm transition hover:border-[#174b91] hover:bg-blue-50" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <LayoutGrid className="h-[18px] w-[18px]" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 max-h-[min(78vh,680px)] w-[min(94vw,520px)] overflow-y-auto rounded-2xl border border-slate-200 bg-popover p-3 text-popover-foreground shadow-2xl ring-1 ring-black/5 sm:p-4" dir="rtl">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[#173b67]">التطبيقات والأقسام</h2>
              <p className="text-[11px] text-muted-foreground">وصول سريع إلى وحدات النظام المتاحة لك</p>
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-full" aria-label="إغلاق لوحة التطبيقات" onClick={() => { setOpen(false); setSearch(""); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="mb-3 flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن تطبيق..." aria-label="البحث عن تطبيق" />
          </div>
          {!search.trim() && (favorites.length > 0 || mostUsed.length > 0) && (
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              {favorites.length > 0 && (
                <section className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-3">
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-bold text-amber-800"><Star className="h-3.5 w-3.5 fill-current" /> المفضلة</h3>
                  <div className="flex flex-wrap gap-2">
                    {favorites.slice(0, 6).map((item) => (
                      <Link key={item.url} to={item.url as any} onClick={() => { recordUsage(item.url); setOpen(false); }} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-2.5 py-2 text-xs font-semibold hover:border-amber-400">
                        <item.icon className="h-4 w-4 text-amber-700" />{item.title}
                      </Link>
                    ))}
                  </div>
                </section>
              )}
              {mostUsed.length > 0 && (
                <section className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-bold text-[#174b91]"><Clock className="h-3.5 w-3.5" /> الأكثر استخداماً</h3>
                  <div className="flex flex-wrap gap-2">
                    {mostUsed.map((item) => (
                      <Link key={item.url} to={item.url as any} onClick={() => { recordUsage(item.url); setOpen(false); }} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-100 bg-white px-2.5 py-2 text-xs font-semibold hover:border-blue-300">
                        <item.icon className="h-4 w-4 text-[#174b91]" />{item.title}
                      </Link>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
          {permissions.isError ? <p role="alert" className="p-3 text-sm text-destructive">تعذر تحميل صلاحيات التطبيقات.</p> :
            permissions.isLoading && !isSuperOwner ? <p className="p-3 text-sm text-muted-foreground">جارٍ التحقق من الصلاحيات...</p> :
            groups.length ? groups.map((group) => (
              <section key={group.label} className="mb-3 last:mb-0">
                <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{group.label}</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {group.items.map((item) => (
                    <div key={item.url} className="group relative">
                      <Link to={item.url as any} onClick={() => { recordUsage(item.url); setOpen(false); setSearch(""); }} className="flex min-h-[76px] items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 pe-9 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ${navigationIconTone(item.url)}`}><item.icon className="h-5 w-5" /></span>
                        <span>{item.title}</span>
                      </Link>
                      <button type="button" aria-label={favoriteUrls.includes(item.url) ? `إزالة ${item.title} من المفضلة` : `إضافة ${item.title} إلى المفضلة`} aria-pressed={favoriteUrls.includes(item.url)} onClick={() => toggleFavorite(item.url)} className="absolute right-2 top-1/2 z-10 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-amber-500 transition hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400">
                        <Star className={`h-4 w-4 ${favoriteUrls.includes(item.url) ? "fill-current" : ""}`} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )) : <p className="p-4 text-center text-sm text-muted-foreground">لا توجد تطبيقات مطابقة أو متاحة.</p>}
        </div>
      )}
    </div>
  );
}
