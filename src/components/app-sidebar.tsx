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
  ChefHat,
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
} from "lucide-react";
import { useSuperOwner } from "@/hooks/use-super-owner";
import { useActiveTenant } from "@/hooks/use-active-tenant";
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

type Item = { title: string; url: string; icon: typeof LayoutDashboard; permission?: string };
type Group = { label: string; items: Item[] };

const groups: Group[] = [
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
      { title: "نقطة البيع", url: "/pos", icon: ShoppingCart, permission: "pos.use" },
      { title: "الفواتير", url: "/sales", icon: Receipt, permission: "sales.view" },
      { title: "الورديات", url: "/cash-sessions", icon: Wallet, permission: "cash.view" },
      { title: "العملاء", url: "/customers", icon: UserSquare2, permission: "customers.view" },
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
    label: "الإعداد",
    items: [
      { title: "الفروع", url: "/branches", icon: Building2, permission: "branches.view" },
      { title: "المنتجات", url: "/products", icon: Package, permission: "products.view" },
      { title: "الأقسام", url: "/categories", icon: Tags, permission: "categories.view" },
      { title: "الموظفون", url: "/users", icon: Users, permission: "users.view" },
      { title: "صلاحيات الفريق", url: "/team-permissions", icon: KeyRound, permission: "permissions.view" },
      { title: "الإعدادات", url: "/settings", icon: Settings, permission: "settings.view" },
      { title: "العروض والإعلانات", url: "/settings#marketing-campaigns", icon: Megaphone, permission: "settings.view" },
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
        const allowedRoutes = new Set(["/dashboard", "/pos", "/sales", "/products", "/inventory", "/purchases", "/reports", "/customers", "/branches", "/users", "/settings"]);
        setCustomItems(Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.title === "string" && allowedRoutes.has(item.url)).slice(0, 12) : []);
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
  const allowed = (item: Item) =>
    isSuperOwner || (!!permissionsQuery.data && (!item.permission || permissionsQuery.data.has(item.permission)));

  const enterpriseGroup: Group = {
    label: "المؤسسة",
    items: [
      { title: "إدارة المستخدمين", url: "/users-admin", icon: UsersRound, permission: "users.manage" },
      { title: "الشركات", url: "/companies", icon: Building, permission: "companies.view" },
      { title: "الأقسام الإدارية", url: "/departments", icon: Briefcase, permission: "departments.view" },
      { title: "المسميات الوظيفية", url: "/job-titles", icon: BadgeCheck, permission: "job_titles.view" },
      { title: "أنواع التوظيف", url: "/employment-types", icon: BadgeCheck, permission: "employment_types.view" },
      { title: "إدارة الأدوار", url: "/roles", icon: KeyRound, permission: "roles.view" },
      { title: "سجل الدخول", url: "/login-history", icon: History, permission: "login_history.view" },
      { title: "الإشعارات", url: "/notifications", icon: Bell, permission: "notifications.view" },
    ],
  };

  const showAdmin = isSuperOwner || totalCount === 0;
  const systemItems: Item[] = [];
  if (isSuperOwner) systemItems.push({ title: "مركز تحكم المالك", url: "/owner-center", icon: Crown });
  if (isSuperOwner) systemItems.push({ title: "استوديو تطوير النظام", url: "/settings#developer-studio", icon: Palette });
  if (showAdmin) systemItems.push({ title: "إدارة النظام", url: "/admin", icon: ShieldCheck });
  systemItems.push({ title: "سجل التدقيق", url: "/audit-logs", icon: ScrollText, permission: "audit.view" });

  const customGroup: Group = {
    label: "اختصارات مخصصة",
    items: customItems.map((item) => ({ title: item.title, url: item.url, icon: Bookmark })),
  };

  const allGroups: Group[] = [
    ...groups,
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
            <ChefHat className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-sm font-bold text-sidebar-foreground">RAS</span>
              <span className="truncate text-[10px] text-sidebar-foreground/60">محاسبة المطاعم</span>
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
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span>{item.title}</span>
                          </a>
                        ) : (
                          <Link to={item.url} className="flex items-center gap-2">
                            <item.icon className="h-4 w-4 shrink-0" />
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
