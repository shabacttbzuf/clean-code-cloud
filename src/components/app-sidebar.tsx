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
} from "lucide-react";
import { useSuperOwner } from "@/hooks/use-super-owner";
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

  // Admin group is visible to super owners, and also as a "bootstrap" affordance
  // when no super owner exists yet.
  const showAdmin = isSuperOwner || totalCount === 0;
  const allGroups: Group[] = showAdmin
    ? [
        ...groups,
        {
          label: "النظام",
          items: [
            { title: "إدارة النظام", url: "/admin", icon: ShieldCheck },
            { title: "سجل التدقيق", url: "/audit-logs", icon: ScrollText },
          ],
        },
      ]
    : [
        ...groups,
        {
          label: "النظام",
          items: [{ title: "سجل التدقيق", url: "/audit-logs", icon: ScrollText }],
        },
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
