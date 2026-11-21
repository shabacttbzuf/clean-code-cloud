import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { appNavigationGroups } from "@/components/app-sidebar";
import { AppLauncher } from "@/components/app-launcher";
import { WorkspaceTabs } from "@/components/workspace-tabs";
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
import { Moon, Sun, LogOut, User as UserIcon, Loader2, Bell, Maximize2, Minimize2, CalendarDays, Building2, Search, CircleHelp } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useMemberships } from "@/hooks/use-tenant";
import { toast } from "sonner";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { useSuperOwner } from "@/hooks/use-super-owner";
import { safeInternalNotificationPath } from "@/lib/notification-links";

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
  return (
    <div className="workspace-surface flex min-h-screen w-full flex-col">
      <TopBar />
      <WorkspaceTabs />
      <main className="min-w-0 flex-1 p-3 sm:p-4 md:p-6">
        <PermissionRouteGuard />
      </main>
    </div>
  );
}

/**
 * UI route checks complement (never replace) the database RLS and server-action
 * permission checks. Keep this map aligned with public.permissions and the applications launcher.
 */
const ROUTE_PERMISSION_RULES: Array<{ prefix: string; permission: string }> = [
  { prefix: "/dashboard", permission: "dashboard.view" },
  { prefix: "/reports", permission: "reports.view" },
  { prefix: "/pos", permission: "pos.use" },
  { prefix: "/kitchen", permission: "kitchen.view" },
  { prefix: "/tables", permission: "tables.view" },
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
  { prefix: "/ads", permission: "ads.manage" },
  { prefix: "/promotions", permission: "promotions.manage" },
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
  const { isSuperOwner, totalCount, loading: ownerLoading } = useSuperOwner();
  const requiredPermission = permissionForPath(pathname);
  const ownerOnly = pathname === "/owner-center" || (pathname === "/admin" && totalCount > 0);

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
  const { tenantId, tenant, membership, memberships, switchTenant } = useActiveTenant();
  const { user } = useAuthSession();
  const { isSuperOwner } = useSuperOwner();
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchPermissions = useQuery({
    queryKey: ["topbar-search-permissions", tenantId, user?.id],
    queryFn: async () => {
      if (!tenantId) return new Set<string>();
      const { data, error } = await supabase.rpc("get_my_permissions", { _tenant_id: tenantId });
      if (error) throw error;
      return new Set<string>((data ?? []) as string[]);
    },
    enabled: !!tenantId && !!user?.id && !isSuperOwner,
    staleTime: 30_000,
  });
  const branchQuery = useQuery({
    queryKey: ["topbar-active-branch", tenantId, membership?.branch_id],
    queryFn: async () => {
      if (!tenantId || !membership?.branch_id) return null;
      const { data, error } = await supabase.from("branches").select("id,name").eq("tenant_id", tenantId).eq("id", membership.branch_id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId && !!membership?.branch_id,
    staleTime: 60_000,
  });
  const tenantOptionsQuery = useQuery({
    queryKey: ["topbar-tenant-options", user?.id, memberships.map((item) => item.tenant_id).sort().join(":")],
    queryFn: async () => {
      const ids = memberships.map((item) => item.tenant_id);
      if (!ids.length) return [];
      const { data, error } = await supabase.from("tenants").select("id,name").in("id", ids);
      if (error) throw error;
      return data ?? [];
    },
    enabled: memberships.length > 1,
    staleTime: 60_000,
  });
  const [clock, setClock] = useState(() => new Date());
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    const sync = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => { window.clearInterval(timer); document.removeEventListener("fullscreenchange", sync); };
  }, []);
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { toast.error("تعذر تغيير وضع ملء الشاشة في هذا المتصفح."); }
  }
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
      if (!tenantId || !user?.id) return { items: [], readIds: new Set<string>(), unreadCount: 0 };
      const [itemsResult, totalResult, readCountResult] = await Promise.all([
        supabase.from("notifications")
          .select("id,title,body,urgency,kind,created_at,audience_type,action_path,action_label")
          .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(12),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        (supabase.from("notification_reads" as any) as any)
          .select("notification_id,notifications!inner(tenant_id)", { count: "exact", head: true })
          .eq("user_id", user.id).eq("notifications.tenant_id", tenantId),
      ]);
      if (itemsResult.error) throw itemsResult.error;
      if (totalResult.error) throw totalResult.error;
      if (readCountResult.error) throw readCountResult.error;
      const recentIds = (itemsResult.data ?? []).map((row) => row.id);
      const recentReads = recentIds.length
        ? await (supabase.from("notification_reads" as any) as any)
            .select("notification_id").eq("user_id", user.id).in("notification_id", recentIds)
        : { data: [], error: null };
      if (recentReads.error) throw recentReads.error;
      return {
        items: itemsResult.data ?? [],
        readIds: new Set<string>((recentReads.data ?? []).map((row: { notification_id: string }) => row.notification_id)),
        unreadCount: Math.max(0, (totalResult.count ?? 0) - (readCountResult.count ?? 0)),
      };
    },
    enabled: !!tenantId && !!user?.id,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;
  async function markNotificationRead(notificationId: string): Promise<boolean> {
    if (!user?.id) return false;
    const { error } = await (supabase.from("notification_reads" as any) as any)
      .upsert({ notification_id: notificationId, user_id: user.id }, { onConflict: "notification_id,user_id" });
    if (error) { toast.error("تعذر تحديث حالة الإشعار"); return false; }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["topbar-notifications", tenantId, user.id] }),
      qc.invalidateQueries({ queryKey: ["notifications-list", tenantId, user.id] }),
    ]);
    return true;
  }
  async function markAllNotificationsRead() {
    if (!user?.id || !tenantId) return;
    try {
      const allIds: string[] = [];
      for (let from = 0; ; from += 500) {
        const { data, error } = await supabase.from("notifications").select("id")
          .eq("tenant_id", tenantId).order("created_at", { ascending: false }).range(from, from + 499);
        if (error) throw error;
        allIds.push(...(data ?? []).map((row) => row.id));
        if ((data ?? []).length < 500) break;
      }
      const readIds = new Set<string>();
      for (let from = 0; ; from += 500) {
        const { data, error } = await (supabase.from("notification_reads" as any) as any)
          .select("notification_id").eq("user_id", user.id).range(from, from + 499);
        if (error) throw error;
        for (const row of data ?? []) readIds.add(row.notification_id);
        if ((data ?? []).length < 500) break;
      }
      const unreadIds = allIds.filter((id) => !readIds.has(id));
      for (let i = 0; i < unreadIds.length; i += 500) {
        const { error } = await (supabase.from("notification_reads" as any) as any).upsert(
          unreadIds.slice(i, i + 500).map((notification_id) => ({ notification_id, user_id: user.id })),
          { onConflict: "notification_id,user_id" },
        );
        if (error) throw error;
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["topbar-notifications", tenantId, user.id] }),
        qc.invalidateQueries({ queryKey: ["notifications-list", tenantId, user.id] }),
      ]);
    } catch {
      toast.error("تعذر تحديث الإشعارات");
    }
  }
  async function openNotification(notification: any) {
    const target = safeInternalNotificationPath(notification.action_path);
    if (!target) {
      await markNotificationRead(notification.id);
      return;
    }
    const targetPath = target.split(/[?#]/, 1)[0];
    const requiredPermission = permissionForPath(targetPath);
    const allowed = isSuperOwner || (requiredPermission
      ? searchPermissions.data?.has(requiredPermission) === true
      : targetPath === "/profile" || targetPath === "/notifications");
    if (!allowed) {
      toast.error("لا تملك صلاحية فتح وجهة هذا الإشعار.");
      return;
    }
    if (await markNotificationRead(notification.id)) navigate({ to: target as any });
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

  const searchItems = appNavigationGroups.flatMap((group) => group.items).filter((item) => {
    const query = globalSearch.trim().toLocaleLowerCase("ar");
    const permitted = isSuperOwner || (!!searchPermissions.data && (!item.permission || searchPermissions.data.has(item.permission)));
    return permitted && query.length > 0 && item.title.toLocaleLowerCase("ar").includes(query);
  }).slice(0, 8);

  const initial = displayName.charAt(0) || "?";

  return (
    <header className="sticky top-0 z-30 flex min-h-[68px] items-center justify-between gap-3 border-b border-[#dbe5f4] bg-[rgba(248,250,255,.96)] px-3 py-2 shadow-[0_3px_14px_rgba(16,47,92,.06)] backdrop-blur-xl sm:px-5" dir="rtl">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Link to="/support" aria-label="مركز المساعدة والدعم" title="مركز المساعدة والدعم">
          <Button variant="outline" size="icon" className="rounded-xl border-[#dce5f3] bg-white text-[#174b91] shadow-sm">
            <CircleHelp className="h-5 w-5" />
          </Button>
        </Link>
        <AppLauncher />
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#174b91] to-[#102f5c] text-[#f5c65b] shadow-sm"><Building2 className="h-5 w-5" /></div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="min-w-0 rounded-lg px-1 text-right outline-none transition hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-[#174b91]" aria-label="اختيار الشركة">
              <span className="block truncate text-sm font-extrabold text-[#102f5c] sm:text-base">{tenant?.name || "نظام إدارة المطاعم"}</span>
              <span className="block text-[10px] text-slate-500">{memberships.length > 1 ? "تبديل الشركة" : "نظام إدارة المطاعم المتكامل"}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>الشركات المتاحة لحسابك</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {memberships.map((item) => (
              <DropdownMenuItem key={item.tenant_id} onSelect={() => {
                if (item.tenant_id !== tenantId) {
                  switchTenant(item.tenant_id);
                  toast.success("تم تبديل الشركة بنجاح");
                }
              }} className="cursor-pointer">
                <Building2 className="ml-2 h-4 w-4" />
                <span className="min-w-0 flex-1 truncate">{tenantOptionsQuery.data?.find((option) => option.id === item.tenant_id)?.name || (item.tenant_id === tenantId ? tenant?.name : "شركة") || "شركة"}</span>
                {item.tenant_id === tenantId ? <span className="text-xs text-emerald-600">الحالية</span> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="hidden items-center gap-2 rounded-full border border-[#dce5f3] bg-white px-3 py-2 text-xs font-bold text-[#174b91] shadow-sm lg:flex"><Building2 className="h-4 w-4" />{branchQuery.data?.name || (membership?.branch_id ? "الفرع المحدد" : "جميع الفروع")}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <div className="hidden items-center gap-2 rounded-full border border-[#dce5f3] bg-white px-3 py-2 text-[11px] font-semibold text-[#425b7d] shadow-sm md:flex"><CalendarDays className="h-4 w-4 text-[#174b91]" />{clock.toLocaleDateString("ar-YE",{weekday:"long",day:"numeric",month:"long"})}</div>
        <div className="relative hidden w-[min(28vw,300px)] lg:block">
          <div className="flex items-center gap-2 rounded-full border border-[#dce5f3] bg-white px-3 py-2 shadow-sm focus-within:border-primary/50">
            <Search className="h-4 w-4 shrink-0 text-[#174b91]" />
            <input value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} onFocus={() => setSearchOpen(true)} onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)} onKeyDown={(event) => { if (event.key === "Escape") { setGlobalSearch(""); setSearchOpen(false); } if (event.key === "Enter" && searchItems[0]) { navigate({ to: searchItems[0].url as any }); setGlobalSearch(""); setSearchOpen(false); } }} placeholder="البحث في النظام..." aria-label="البحث الشامل داخل النظام" className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400" />
          </div>
          {searchOpen && globalSearch.trim() && <div className="absolute right-0 top-full z-50 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border bg-white p-2 text-slate-800 shadow-xl" dir="rtl">
            {searchPermissions.isError ? <p role="alert" className="p-3 text-xs text-destructive">تعذر التحقق من صلاحيات البحث.</p> : searchPermissions.isLoading && !isSuperOwner ? <p className="p-3 text-xs text-slate-500">جارٍ التحقق من الصلاحيات...</p> : searchItems.length ? searchItems.map((item) => <button key={item.url} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { navigate({ to: item.url as any }); setGlobalSearch(""); setSearchOpen(false); }} className="flex w-full items-center rounded-lg px-3 py-2 text-right text-sm hover:bg-blue-50">{item.title}</button>) : <p className="p-3 text-xs text-slate-500">لا توجد نتائج متاحة.</p>}
          </div>}
        </div>
        <Button type="button" variant="outline" size="icon" onClick={toggleFullscreen} aria-label={fullscreen ? "الخروج من ملء الشاشة" : "ملء الشاشة"} className="hidden rounded-xl border-[#dce5f3] bg-white text-[#174b91] shadow-sm sm:inline-flex">{fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button>
        <Button variant="outline" size="icon" onClick={toggle} aria-label="تبديل الوضع" className="hidden rounded-xl border-[#dce5f3] bg-white text-[#174b91] shadow-sm sm:inline-flex">{theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="relative rounded-xl border-[#dce5f3] bg-white text-[#174b91] shadow-sm" aria-label="الإشعارات"><Bell className="h-5 w-5" />{unreadCount > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-bold text-white">{unreadCount > 9 ? "9+" : unreadCount}</span>}</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[min(92vw,360px)]">
            <div className="flex items-center justify-between px-2 py-1.5"><DropdownMenuLabel className="p-0">الإشعارات {unreadCount > 0 ? "(" + unreadCount + ")" : ""}</DropdownMenuLabel><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={markAllNotificationsRead}>قراءة الكل</Button></div><DropdownMenuSeparator />
            {(notificationsQuery.data?.items ?? []).length === 0 ? <div className="px-3 py-6 text-center text-sm text-muted-foreground">لا توجد إشعارات جديدة</div> : (notificationsQuery.data?.items ?? []).map((n: any) => { const isRead = notificationsQuery.data?.readIds.has(n.id); return <DropdownMenuItem key={n.id} className="block cursor-pointer whitespace-normal py-2" onSelect={() => { void openNotification(n); }}><div className="flex items-start gap-2">{!isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />}<div className="min-w-0 flex-1"><div className={isRead ? "text-sm font-normal" : "text-sm font-semibold"}>{n.title}</div>{n.body && <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</div>}<div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground"><span>{new Date(n.created_at).toLocaleString("ar-YE")}</span>{n.action_path && <span className="font-semibold text-primary">{n.action_label || "فتح"}</span>}</div></div></div></DropdownMenuItem>; })}
            <DropdownMenuSeparator /><DropdownMenuItem onSelect={() => navigate({ to: "/notifications" })} className="justify-center text-primary">عرض كل الإشعارات</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" className="h-11 gap-2 rounded-full px-1.5 sm:px-2"><Avatar className="h-9 w-9 border-2 border-[#dce5f3]"><AvatarFallback className="bg-[#e8effb] font-bold text-[#174b91]">{initial}</AvatarFallback></Avatar><span className="hidden min-w-0 text-right sm:block"><span className="block max-w-28 truncate text-xs font-extrabold text-[#102f5c]">{displayName}</span><span className="block text-[10px] text-slate-500">حساب المستخدم</span></span></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuLabel className="text-sm font-semibold">{displayName}</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem onClick={() => navigate({ to: "/profile" })}><UserIcon className="ml-2 h-4 w-4" />ملفي الشخصي</DropdownMenuItem><DropdownMenuItem onClick={() => navigate({ to: "/settings" })}><UserIcon className="ml-2 h-4 w-4" />الإعدادات</DropdownMenuItem><DropdownMenuItem onClick={handleSignOut} disabled={signingOut}><LogOut className="ml-2 h-4 w-4" />تسجيل الخروج</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
