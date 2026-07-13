import { Link, useRouterState } from "@tanstack/react-router";
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

type Item = { title: string; url: string; icon: typeof LayoutDashboard };
type Group = { label: string; items: Item[] };

const groups: Group[] = [
  {
    label: "الرئيسية",
    items: [
      { title: "لوحة التحكم", url: "/dashboard", icon: LayoutDashboard },
      { title: "التقارير", url: "/reports", icon: BarChart3 },
    ],
  },
  {
    label: "البيع",
    items: [
      { title: "نقطة البيع", url: "/pos", icon: ShoppingCart },
      { title: "الفواتير", url: "/sales", icon: Receipt },
      { title: "الورديات", url: "/cash-sessions", icon: Wallet },
      { title: "العملاء", url: "/customers", icon: UserSquare2 },
    ],
  },
  {
    label: "المخزون",
    items: [
      { title: "الرصيد", url: "/inventory", icon: Warehouse },
      { title: "الحركات", url: "/inventory/movements", icon: ArrowLeftRight },
      { title: "الموردون", url: "/suppliers", icon: Truck },
      { title: "المشتريات", url: "/purchases", icon: FileText },
    ],
  },
  {
    label: "المالية",
    items: [
      { title: "المصروفات", url: "/expenses", icon: DollarSign },
      { title: "تصنيفات المصروفات", url: "/expense-categories", icon: Layers },
    ],
  },
  {
    label: "الموارد البشرية",
    items: [
      { title: "الموظفون", url: "/hr/employees", icon: Briefcase },
      { title: "الحضور", url: "/hr/attendance", icon: Clock },
      { title: "الإجازات", url: "/hr/leaves", icon: CalendarDays },
      { title: "المكافآت والحسميات", url: "/hr/compensation", icon: Gift },
      { title: "الرواتب", url: "/hr/payroll", icon: Wallet2 },
    ],
  },
  {
    label: "الإعداد",
    items: [
      { title: "الفروع", url: "/branches", icon: Building2 },
      { title: "المنتجات", url: "/products", icon: Package },
      { title: "الأقسام", url: "/categories", icon: Tags },
      { title: "الموظفون", url: "/users", icon: Users },
      { title: "صلاحيات الفريق", url: "/team-permissions", icon: KeyRound },
      { title: "الإعدادات", url: "/settings", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isSuperOwner, totalCount } = useSuperOwner();
  const { role } = useActiveTenant();

  const isAdmin = role === "owner" || role === "manager" || isSuperOwner;
  const isOwner = role === "owner" || isSuperOwner;

  const enterpriseGroup: Group | null = isAdmin
    ? {
        label: "المؤسسة",
        items: [
          { title: "إدارة المستخدمين", url: "/users-admin", icon: UsersRound },
          { title: "الشركات", url: "/companies", icon: Building },
          { title: "الأقسام الإدارية", url: "/departments", icon: Briefcase },
          { title: "المسميات الوظيفية", url: "/job-titles", icon: BadgeCheck },
          { title: "أنواع التوظيف", url: "/employment-types", icon: BadgeCheck },
          ...(isOwner ? [{ title: "إدارة الأدوار", url: "/roles", icon: KeyRound }] : []),
          { title: "سجل الدخول", url: "/login-history", icon: History },
          { title: "الإشعارات", url: "/notifications", icon: Bell },
        ],
      }
    : null;

  const showAdmin = isSuperOwner || totalCount === 0;
  const systemItems: Item[] = [];
  if (isSuperOwner) systemItems.push({ title: "مركز تحكم المالك", url: "/owner-center", icon: Crown });
  if (showAdmin) systemItems.push({ title: "إدارة النظام", url: "/admin", icon: ShieldCheck });
  systemItems.push({ title: "سجل التدقيق", url: "/audit-logs", icon: ScrollText });

  const allGroups: Group[] = [
    ...groups,
    ...(enterpriseGroup ? [enterpriseGroup] : []),
    { label: "النظام", items: systemItems },
  ];

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
                  const active =
                    pathname === item.url ||
                    (item.url !== "/dashboard" && pathname.startsWith(item.url + "/")) ||
                    (item.url === "/inventory" && pathname === "/inventory") ||
                    (item.url === "/inventory/movements" && pathname.startsWith("/inventory/movements"));
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                        <Link to={item.url} className="flex items-center gap-2">
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span>{item.title}</span>
                        </Link>
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
