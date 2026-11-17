import { createFileRoute, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger, SidebarInset, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Moon, Sun, LogOut, User as UserIcon, Loader2, Bell } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useMemberships } from "@/hooks/use-tenant";
import { toast } from "sonner";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { useSuperOwner } from "@/hooks/use-super-owner";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    return { userId: data.user.id, email: data.user.email };
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { user, loading } = useAuthSession();
  const { data: memberships, isLoading: loadingMemberships } = useMemberships(user?.id);
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || loadingMemberships) return;
    if (user && memberships !== undefined && memberships.length === 0) {
      // No tenant yet — send to onboarding (unless already there)
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/onboarding")) {
        navigate({ to: "/onboarding" });
      }
    }
  }, [user, memberships, loading, loadingMemberships, navigate]);

  if (loading || loadingMemberships) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // If no memberships, still render Outlet (onboarding page handles this)
  if (!memberships || memberships.length === 0) {
    return <Outlet />;
  }

  return <AuthShell />;
}

function AuthShell() {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  // Auto-hide the sidebar after any route change to give more workspace.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <SidebarProvider open={open} onOpenChange={setOpen}>
      <div className="flex min-h-screen w-full">
        <SidebarRouteSync />
        <AppSidebar />
        <SidebarInset className="workspace-surface">
          <TopBar />
          <main className="min-w-0 flex-1 p-4 md:p-6">
            <PermissionRouteGuard />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function SidebarRouteSync() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { setOpen, setOpenMobile } = useSidebar();
  useEffect(() => {
    setOpen(false);
    setOpenMobile(false);
  }, [pathname, setOpen, setOpenMobile]);
  return null;
}


/**
 * UI route checks complement (never replace) the database RLS and server-action
 * permission checks. Keep this map aligned with public.permissions and the sidebar.
 */
const ROUTE_PERMISSION_RULES: Array<{ prefix: string; permission: string }> = [
  { prefix: "/dashboard", permission: "dashboard.view" },
  { prefix: "/reports", permission: "reports.view" },
  { prefix: "/pos", permission: "pos.use" },
  { prefix: "/sales", permission: "sales.view" },
  { prefix: "/cash-sessions", permission: "cash.view" },
  { prefix: "/customers", permission: "customers.view" },
  { prefix: "/inventory/movements", permission: "inventory.movements.view" },
  { prefix: "/inventory", permission: "inventory.view" },
  { prefix: "/suppliers", permission: "suppliers.view" },
  { prefix: "/purchases", permission: "purchases.view" },
  { prefix: "/expenses", permission: "expenses.view" },
  { prefix: "/expense-categories", permission: "expense_categories.manage" },
  { prefix: "/hr/employees", permission: "hr.employees.view" },
  { prefix: "/hr/attendance", permission: "hr.attendance.view" },
  { prefix: "/hr/leaves", permission: "hr.leaves.view" },
  { prefix: "/hr/compensation", permission: "hr.compensation.view" },
  { prefix: "/hr/payroll", permission: "hr.payroll.view" },
  { prefix: "/branches", permission: "branches.view" },
  { prefix: "/products", permission: "products.view" },
  { prefix: "/categories", permission: "categories.view" },
  { prefix: "/users", permission: "users.view" },
  { prefix: "/users-admin", permission: "users.manage" },
  { prefix: "/team-permissions", permission: "permissions.view" },
  { prefix: "/roles", permission: "roles.view" },
  { prefix: "/companies", permission: "companies.view" },
  { prefix: "/departments", permission: "departments.view" },
  { prefix: "/job-titles", permission: "job_titles.view" },
  { prefix: "/employment-types", permission: "employment_types.view" },
  { prefix: "/notifications", permission: "notifications.view" },
  { prefix: "/login-history", permission: "login_history.view" },
  { prefix: "/audit-logs", permission: "audit.view" },
  { prefix: "/settings", permission: "settings.view" },
];

function permissionForPath(pathname: string): string | null {
  const match = ROUTE_PERMISSION_RULES
    .filter((rule) => pathname === rule.prefix || pathname.startsWith(rule.prefix + "/"))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match?.permission ?? null;
}

function PermissionRouteGuard() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { tenantId, userId, loading: tenantLoading } = useActiveTenant();
  const { isSuperOwner, loading: ownerLoading } = useSuperOwner();
  const requiredPermission = permissionForPath(pathname);
  const ownerOnly = pathname === "/admin" || pathname === "/owner-center";

  const permissionsQuery = useQuery({
    queryKey: ["route-effective-permissions", tenantId, userId],
    queryFn: async () => {
      if (!tenantId) return new Set<string>();
      const { data, error } = await supabase.rpc("get_my_permissions", { _tenant_id: tenantId });
      if (error) throw error;
      return new Set<string>((data ?? []) as string[]);
    },
    enabled: !!tenantId && !!userId && !isSuperOwner && !!requiredPermission && !ownerOnly,
    staleTime: 15_000,
  });

  if (tenantLoading || ownerLoading || (!!requiredPermission && !isSuperOwner && permissionsQuery.isLoading)) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (ownerOnly && !isSuperOwner) {
    return <div role="alert" className="mx-auto max-w-xl rounded-lg border border-destructive/30 p-6 text-center text-sm">هذه الصفحة متاحة لمالك النظام الرئيسي فقط.</div>;
  }

  if (requiredPermission && !isSuperOwner) {
    const granted = !!permissionsQuery.data?.has(requiredPermission);
    if (!granted) {
      return <div role="alert" className="mx-auto max-w-xl rounded-lg border border-destructive/30 p-6 text-center text-sm">{permissionsQuery.isError ? "تعذر التحقق من الصلاحيات. أعد المحاولة لاحقاً." : "ليس لديك صلاحية الوصول إلى هذه الصفحة."}</div>;
    }
  }

  return <Outlet />;
}

function TopBar() {
  const { theme, toggle } = useTheme();
  const { tenantId } = useActiveTenant();
  const { user } = useAuthSession();
  const { data: currentProfile } = useQuery({
    queryKey: ["topbar-profile-name", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase.from("profiles").select("full_name, username").eq("id", user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });
  const displayName = user?.email?.toLowerCase() === "shafiqalwatiry@gmail.com"
    ? "شفيق الوتيري"
    : currentProfile?.full_name?.trim() || user?.user_metadata?.full_name?.trim() || currentProfile?.username?.trim() || "مستخدم";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const notificationsQuery = useQuery({
    queryKey: ["topbar-notifications", tenantId, user?.id],
    queryFn: async () => {
      if (!tenantId || !user?.id) return { items: [], readIds: new Set<string>() };
      const [itemsResult, readsResult] = await Promise.all([
        supabase.from("notifications").select("id,title,body,urgency,kind,created_at,audience_type")
          .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(12),
        (supabase.from("notification_reads" as any) as any).select("notification_id").eq("user_id", user.id),
      ]);
      if (itemsResult.error) throw itemsResult.error;
      if (readsResult.error) throw readsResult.error;
      return { items: itemsResult.data ?? [], readIds: new Set<string>((readsResult.data ?? []).map((r: { notification_id: string }) => r.notification_id)) };
    },
    enabled: !!tenantId && !!user?.id,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
  const unreadCount = (notificationsQuery.data?.items ?? []).filter((n: any) => !notificationsQuery.data?.readIds.has(n.id)).length;
  async function markNotificationRead(notificationId: string) {
    if (!user?.id) return;
    const { error } = await (supabase.from("notification_reads" as any) as any)
      .upsert({ notification_id: notificationId, user_id: user.id }, { onConflict: "notification_id,user_id" });
    if (error) { toast.error("تعذر تحديث حالة الإشعار"); return; }
    await qc.invalidateQueries({ queryKey: ["topbar-notifications", tenantId, user.id] });
  }
  async function markAllNotificationsRead() {
    if (!user?.id) return;
    const unread = (notificationsQuery.data?.items ?? []).filter((n: any) => !notificationsQuery.data?.readIds.has(n.id));
    if (!unread.length) return;
    const { error } = await (supabase.from("notification_reads" as any) as any).upsert(
      unread.map((n: any) => ({ notification_id: n.id, user_id: user.id })), { onConflict: "notification_id,user_id" });
    if (error) { toast.error("تعذر تحديث الإشعارات"); return; }
    await qc.invalidateQueries({ queryKey: ["topbar-notifications", tenantId, user.id] });
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await qc.cancelQueries();
      qc.clear();
      try {
        const loginHistoryId = sessionStorage.getItem("clean-code-cloud-login-history-id");
        const { recordLogout } = await import("@/lib/enterprise.functions");
        await recordLogout({
          data: loginHistoryId ? { login_history_id: loginHistoryId } : {},
        });
        sessionStorage.removeItem("clean-code-cloud-login-history-id");
      } catch (historyError) {
        console.warn("Could not record logout history", historyError);
      }
      await supabase.auth.signOut();
      navigate({ to: "/auth", replace: true });
      toast.success("تم تسجيل الخروج");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل تسجيل الخروج");
    } finally {
      setSigningOut(false);
    }
  }

  const initial = displayName.charAt(0) || "?";

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-2 border-b bg-background/95 px-4 backdrop-blur">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
        <div className="text-sm font-semibold">نظام إدارة الأعمال</div>
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="الإشعارات">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-red-500" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[min(92vw,360px)]">
            <div className="flex items-center justify-between px-2 py-1.5">
              <DropdownMenuLabel className="p-0">الإشعارات {unreadCount > 0 ? "(" + unreadCount + ")" : ""}</DropdownMenuLabel>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={markAllNotificationsRead}>قراءة الكل</Button>
            </div>
            <DropdownMenuSeparator />
            {(notificationsQuery.data?.items ?? []).length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">لا توجد إشعارات جديدة</div>
            ) : (notificationsQuery.data?.items ?? []).map((n: any) => {
              const isRead = notificationsQuery.data?.readIds.has(n.id);
              return (
                <DropdownMenuItem key={n.id} className="block cursor-pointer whitespace-normal py-2" onSelect={() => markNotificationRead(n.id)}>
                  <div className="flex items-start gap-2">
                    {!isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                    <div className="min-w-0 flex-1">
                      <div className={isRead ? "text-sm font-normal" : "text-sm font-semibold"}>{n.title}</div>
                      {n.body && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</div>}
                      <div className="mt-1 text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString("ar-YE")}</div>
                    </div>
                  </div>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate({ to: "/notifications" })} className="justify-center text-primary">عرض كل الإشعارات</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="تبديل الوضع">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-sm font-semibold">{displayName}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate({ to: "/profile" })}>
              <UserIcon className="ml-2 h-4 w-4" />
              ملفي الشخصي
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
              <UserIcon className="ml-2 h-4 w-4" />
              الإعدادات
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSignOut} disabled={signingOut}>
              <LogOut className="ml-2 h-4 w-4" />
              تسجيل الخروج
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
