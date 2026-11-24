import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  Building2,
  Package,
  Tags,
  Users,
  UserSquare2,
  Settings,
  ShoppingCart,
  Receipt,
  Wallet,
  Warehouse,
  ArrowLeftRight,
  Truck,
  FileText,
  DollarSign,
  BarChart3,
  Layers,
  ShieldCheck,
  ScrollText,
  KeyRound,
  Briefcase,
  CalendarDays,
  Clock,
  Gift,
  Wallet2,
  UsersRound,
  Building,
  BadgeCheck,
  History,
  Bell,
  Crown,
  Bookmark,
  Palette,
  Megaphone,
  Armchair,
  ChefHat,
  CircleHelp,
} from "lucide-react";
import { useSuperOwner } from "@/hooks/use-super-owner";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { normalizeCustomShortcuts } from "@/lib/navigation-shortcuts";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export type AppNavigationItem = { title: string; url: string; icon: typeof LayoutDashboard; permission?: string };
export type AppNavigationGroup = { label: string; items: AppNavigationItem[] };

export function navigationIconTone(url: string) {
  if (url.startsWith("/pos") || url.startsWith("/sales")) return "text-blue-600 bg-blue-50 ring-blue-100";
  if (url.startsWith("/tables")) return "text-rose-600 bg-rose-50 ring-rose-100";
  if (url.startsWith("/kitchen")) return "text-orange-600 bg-orange-50 ring-orange-100";
  if (url.startsWith("/inventory") || url.startsWith("/products") || url.startsWith("/categories")) return "text-violet-600 bg-violet-50 ring-violet-100";
  if (url.startsWith("/purchases") || url.startsWith("/suppliers")) return "text-emerald-600 bg-emerald-50 ring-emerald-100";
  if (url.startsWith("/customers") || url.startsWith("/users")) return "text-fuchsia-600 bg-fuchsia-50 ring-fuchsia-100";
  if (url.startsWith("/cash") || url.startsWith("/expenses")) return "text-amber-600 bg-amber-50 ring-amber-100";
  if (url.startsWith("/reports")) return "text-sky-600 bg-sky-50 ring-sky-100";
  if (url.startsWith("/ads") || url.startsWith("/promotions")) return "text-pink-600 bg-pink-50 ring-pink-100";
  if (url.startsWith("/hr/")) return "text-indigo-600 bg-indigo-50 ring-indigo-100";
  if (url.startsWith("/branches") || url.startsWith("/companies") || url.startsWith("/departments")) return "text-cyan-700 bg-cyan-50 ring-cyan-100";
  if (url.startsWith("/notifications")) return "text-red-600 bg-red-50 ring-red-100";
  if (url.startsWith("/settings") || url.startsWith("/team-permissions") || url.startsWith("/roles")) return "text-slate-600 bg-slate-100 ring-slate-200";
  if (url.startsWith("/support")) return "text-teal-600 bg-teal-50 ring-teal-100";
  return "text-[#174b91] bg-blue-50 ring-blue-100";
}

export const appNavigationGroups: AppNavigationGroup[] = [
  {
    label: "الرئيسية",
    items: [
      { title: "لوحة التحكم", url: "/dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
      { title: "التقارير", url: "/reports", icon: BarChart3, permission: "reports.view" },
    ],
  },
  {
    label: "البيع",
    items: [
      { title: "المبيعات ونقطة البيع", url: "/pos", icon: ShoppingCart, permission: "pos.use" },
      { title: "الطاولات", url: "/tables", icon: Armchair, permission: "tables.view" },
      { title: "الفواتير", url: "/sales", icon: Receipt, permission: "sales.view" },
      { title: "الورديات", url: "/cash-sessions", icon: Wallet, permission: "cash.view" },
      { title: "العملاء", url: "/customers", icon: UserSquare2, permission: "customers.view" },
      { title: "الإشعارات", url: "/notifications", icon: Bell, permission: "notifications.view" },
    ],
  },
  {
    label: "التشغيل",
    items: [
      { title: "شاشة المطبخ", url: "/kitchen", icon: ChefHat, permission: "kitchen.view" },
    ],
  },
  {
    label: "المخزون",
    items: [
      { title: "الرصيد", url: "/inventory", icon: Warehouse, permission: "inventory.view" },
      { title: "الحركات", url: "/inventory/movements", icon: ArrowLeftRight, permission: "inventory.movements.view" },
      { title: "الموردون", url: "/suppliers", icon: Truck, permission: "suppliers.view" },
      { title: "المشتريات", url: "/purchases", icon: FileText, permission: "purchases.view" },
    ],
  },
  {
    label: "المالية",
    items: [
      { title: "المصروفات", url: "/expenses", icon: DollarSign, permission: "expenses.view" },
      { title: "تصنيفات المصروفات", url: "/expense-categories", icon: Layers, permission: "expense_categories.manage" },
    ],
  },
  {
    label: "الموارد البشرية",
    items: [
      { title: "الموظفون", url: "/hr/employees", icon: Briefcase, permission: "hr.employees.view" },
      { title: "الحضور", url: "/hr/attendance", icon: Clock, permission: "hr.attendance.view" },
      { title: "الإجازات", url: "/hr/leaves", icon: CalendarDays, permission: "hr.leaves.view" },
      { title: "المكافآت والحسميات", url: "/hr/compensation", icon: Gift, permission: "hr.compensation.view" },
      { title: "الرواتب", url: "/hr/payroll", icon: Wallet2, permission: "hr.payroll.view" },
    ],
  },
  {
    label: "المساعدة",
    items: [
      { title: "مركز المساعدة والدعم", url: "/support", icon: CircleHelp },
    ],
  },
  {
    label: "الإعداد",
    items: [
      { title: "الفروع", url: "/branches", icon: Building2, permission: "branches.view" },
      { title: "المنتجات", url: "/products", icon: Package, permission: "products.view" },
      { title: "الأقسام", url: "/categories", icon: Tags, permission: "categories.view" },
      { title: "الموظفون", url: "/users", icon: Users, permission: "users.view" },
      { title: "صلاحيات الفريق", url: "/team-permissions", icon: KeyRound, permission: "permissions.view" },
      { title: "الإعدادات", url: "/settings", icon: Settings, permission: "settings.view" },
      { title: "الإعلانات", url: "/ads", icon: Megaphone, permission: "ads.manage" },
      { title: "العروض الترويجية", url: "/promotions", icon: Gift, permission: "promotions.manage" },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isSuperOwner, totalCount } = useSuperOwner();
  const { tenantId, userId } = useActiveTenant();
  const [customItems, setCustomItems] = useState<Array<{ title: string; url: string }>>([]);
  const [navOverrides, setNavOverrides] = useState<Record<string, { title?: string; hidden?: boolean }>>({});

  useEffect(() => {
    const read = () => {
      try {
        const raw = window.localStorage.getItem("ras-custom-sidebar-items-v1");
        const parsed = raw ? JSON.parse(raw) : [];
        setCustomItems(normalizeCustomShortcuts(parsed));
      } catch { setCustomItems([]); }
    };
    read();
    window.addEventListener("ras-custom-tabs-updated", read);
    window.addEventListener("storage", read);
    return () => { window.removeEventListener("ras-custom-tabs-updated", read); window.removeEventListener("storage", read); };
  }, []);

  useEffect(() => {
    const read = () => {
      try {
        const raw = window.localStorage.getItem("ras-sidebar-overrides-v1");
        const parsed = raw ? JSON.parse(raw) : {};
        setNavOverrides(parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {});
      } catch { setNavOverrides({}); }
    };
    read();
    window.addEventListener("ras-sidebar-overrides-updated", read);
    window.addEventListener("storage", read);
    return () => { window.removeEventListener("ras-sidebar-overrides-updated", read); window.removeEventListener("storage", read); };
  }, []);

  const permissionsQuery = useQuery({
    queryKey: ["sidebar-effective-permissions", tenantId, userId],
    queryFn: async () => {
      if (!tenantId) return new Set<string>();
      const { data, error } = await supabase.rpc("get_my_permissions", { _tenant_id: tenantId });
      if (error) throw error;
      return new Set<string>((data ?? []) as string[]);
    },
    enabled: !!tenantId && !!userId && !isSuperOwner,
    staleTime: 30_000,
  });
  const allowed = (item: AppNavigationItem) =>
    isSuperOwner || (!!permissionsQuery.data && (!item.permission || permissionsQuery.data.has(item.permission)));

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

  const showAdmin = isSuperOwner || totalCount === 0;
  const systemItems: AppNavigationItem[] = [];
  if (isSuperOwner) systemItems.push({ title: "مركز تحكم المالك", url: "/owner-center", icon: Crown });
  if (isSuperOwner) systemItems.push({ title: "استوديو تطوير النظام", url: "/settings#developer-studio", icon: Palette });
  if (showAdmin) systemItems.push({ title: "إدارة النظام", url: "/admin", icon: ShieldCheck });
  systemItems.push({ title: "سجل التدقيق", url: "/audit-logs", icon: ScrollText, permission: "audit.view" });

  const customGroup: AppNavigationGroup = {
    label: "اختصارات مخصصة",
    items: customItems.map((item) => ({ title: item.title, url: item.url, icon: Bookmark })),
  };

  const allGroups: AppNavigationGroup[] = [
    ...appNavigationGroups,
    enterpriseGroup,
    { label: "النظام", items: systemItems },
    ...(isSuperOwner && customItems.length ? [customGroup] : []),
  ].map((group) => ({
    ...group,
    items: group.items
      .filter((item) => !navOverrides[item.url.split("#")[0]]?.hidden && allowed(item))
      .map((item) => ({
        ...item,
        title: navOverrides[item.url.split("#")[0]]?.title?.trim() || item.title,
      })),
  })).filter((group) => group.items.length > 0);

  return (
    <Sidebar collapsible="icon" side="right">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Building2 className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm font-bold text-sidebar-foreground">إدارة الأعمال</span>
              <span className="truncate text-[10px] text-sidebar-foreground/60">منصة الشركات والفروع</span>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {allGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const itemPath = item.url.split("#")[0];
                  const active =
                    pathname === itemPath ||
                    (itemPath !== "/dashboard" && pathname.startsWith(itemPath + "/")) ||
                    (itemPath === "/inventory" && pathname === "/inventory") ||
                    (itemPath === "/inventory/movements" && pathname.startsWith("/inventory/movements"));
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                        {item.url.includes("#") ? (
                          <a href={item.url} className="flex items-center gap-2">
                            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ring-1 ${navigationIconTone(item.url)}`}><item.icon className="h-4 w-4" /></span>
                            <span>{item.title}</span>
                          </a>
                        ) : (
                          <Link to={item.url} className="flex items-center gap-2">
                            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ring-1 ${navigationIconTone(item.url)}`}><item.icon className="h-4 w-4" /></span>
                            <span>{item.title}</span>
                          </Link>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
