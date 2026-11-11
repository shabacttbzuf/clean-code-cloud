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
import { Moon, Sun, LogOut, User as UserIcon, Loader2 } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useMemberships } from "@/hooks/use-tenant";
import { toast } from "sonner";

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
        <SidebarInset>
          <TopBar />
          <main className="min-w-0 flex-1 p-4 md:p-6">
            <Outlet />
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

function TopBar() {
  const { theme, toggle } = useTheme();
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
        <div className="text-sm font-semibold">نظام محاسبة المطاعم</div>
      </div>
      <div className="flex items-center gap-2">
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
