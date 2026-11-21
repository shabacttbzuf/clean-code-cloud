import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Search, LayoutGrid, Crown, Building, Briefcase, BadgeCheck,
  KeyRound, History, UsersRound, ShieldCheck, ScrollText, Palette, Bookmark,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { useSuperOwner } from "@/hooks/use-super-owner";
import { appNavigationGroups, type AppNavigationGroup } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CustomShortcut = { title: string; url: string };
type NavOverride = { title?: string; hidden?: boolean };

export function AppLauncher() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customItems, setCustomItems] = useState<CustomShortcut[]>([]);
  const [navOverrides, setNavOverrides] = useState<Record<string, NavOverride>>({});
  const { tenantId, userId } = useActiveTenant();
  const { isSuperOwner, totalCount } = useSuperOwner();

  useEffect(() => {
    const read = () => {
      try {
        const raw = window.localStorage.getItem("ras-custom-sidebar-items-v1");
        const parsed = raw ? JSON.parse(raw) : [];
        const allowedRoutes = new Set(["/dashboard", "/pos", "/sales", "/products", "/inventory", "/purchases", "/reports", "/customers", "/branches", "/users", "/settings", "/ads"]);
        setCustomItems(Array.isArray(parsed)
          ? parsed.filter((item) => item && typeof item.title === "string" && allowedRoutes.has(item.url)).slice(0, 12)
          : []);
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
          return !navOverrides[basePath]?.hidden && allowed(item) &&
            (item.title.toLocaleLowerCase("ar").includes(needle) || group.label.toLocaleLowerCase("ar").includes(needle));
        })
        .map((item) => ({
          ...item,
          title: navOverrides[item.url.split("#")[0]]?.title?.trim() || item.title,
        })),
    })).filter((group) => group.items.length);
  }, [isSuperOwner, totalCount, permissions.data, customItems, navOverrides, search]);

  return (
    <div className="relative">
      <Button type="button" variant="outline" size="icon" title="التطبيقات" aria-label="فتح التطبيقات" className="h-10 w-10 shrink-0 rounded-xl border-[#dce5f3] bg-white text-[#174b91] shadow-sm transition hover:border-[#174b91] hover:bg-blue-50" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <LayoutGrid className="h-[18px] w-[18px]" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 max-h-[min(78vh,680px)] w-[min(92vw,460px)] overflow-y-auto rounded-2xl border bg-popover p-3 text-popover-foreground shadow-2xl ring-1 ring-black/5" dir="rtl">
          <div className="mb-3 flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن تطبيق..." aria-label="البحث عن تطبيق" />
          </div>
          {permissions.isError ? <p role="alert" className="p-3 text-sm text-destructive">تعذر تحميل صلاحيات التطبيقات.</p> :
            permissions.isLoading && !isSuperOwner ? <p className="p-3 text-sm text-muted-foreground">جارٍ التحقق من الصلاحيات...</p> :
            groups.length ? groups.map((group) => (
              <section key={group.label} className="mb-3 last:mb-0">
                <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{group.label}</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {group.items.map((item) => (
                    <Link key={item.url} to={item.url as any} onClick={() => setOpen(false)} className="flex min-h-16 items-center gap-2 rounded-xl border bg-card p-2 text-sm transition hover:border-primary/40 hover:bg-primary/5">
                      <item.icon className="h-4 w-4 shrink-0 text-primary" />
                      <span>{item.title}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )) : <p className="p-4 text-center text-sm text-muted-foreground">لا توجد تطبيقات مطابقة أو متاحة.</p>}
        </div>
      )}
    </div>
  );
}
