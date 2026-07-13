import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSuperOwner } from "@/hooks/use-super-owner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  ShieldAlert,
  Users,
  Building2,
  ScrollText,
  KeyRound,
  Briefcase,
  History,
  Bell,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/owner-center")({ component: OwnerCenterPage });

function OwnerCenterPage() {
  const { isSuperOwner, loading } = useSuperOwner();

  const stats = useQuery({
    queryKey: ["owner-center-stats"],
    queryFn: async () => {
      const [tenants, users, branches, audits, logins] = await Promise.all([
        supabase.from("tenants").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("branches").select("id", { count: "exact", head: true }),
        supabase.from("audit_logs").select("id", { count: "exact", head: true }),
        supabase.from("login_history").select("id", { count: "exact", head: true }),
      ]);
      return {
        tenants: tenants.count ?? 0,
        users: users.count ?? 0,
        branches: branches.count ?? 0,
        audits: audits.count ?? 0,
        logins: logins.count ?? 0,
      };
    },
    enabled: isSuperOwner,
  });

  if (loading) return <Loader2 className="mx-auto my-12 h-6 w-6 animate-spin text-primary" />;

  if (!isSuperOwner) {
    return (
      <div className="space-y-6">
        <PageHeader title="مركز تحكم المالك" />
        <Card>
          <CardContent className="flex items-center gap-3 p-8 text-muted-foreground">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            هذه الصفحة متاحة لمالك النظام فقط.
          </CardContent>
        </Card>
      </div>
    );
  }

  const cards = [
    { title: "الشركات", count: stats.data?.tenants, icon: Building2, to: "/admin" },
    { title: "المستخدمون", count: stats.data?.users, icon: Users, to: "/users-admin" },
    { title: "الفروع", count: stats.data?.branches, icon: Building2, to: "/branches" },
    { title: "سجل التدقيق", count: stats.data?.audits, icon: ScrollText, to: "/audit-logs" },
    { title: "عمليات الدخول", count: stats.data?.logins, icon: History, to: "/login-history" },
  ];

  const links = [
    { to: "/users-admin", title: "إدارة المستخدمين", icon: Users },
    { to: "/companies", title: "الشركات", icon: Building2 },
    { to: "/departments", title: "الأقسام الإدارية", icon: Briefcase },
    { to: "/job-titles", title: "المسميات الوظيفية", icon: Briefcase },
    { to: "/employment-types", title: "أنواع التوظيف", icon: Briefcase },
    { to: "/team-permissions", title: "صلاحيات الفريق", icon: KeyRound },
    { to: "/audit-logs", title: "سجل التدقيق", icon: ScrollText },
    { to: "/login-history", title: "سجل الدخول", icon: History },
    { to: "/notifications", title: "الإشعارات", icon: Bell },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="مركز تحكم المالك"
        subtitle="لوحة مالك النظام — نظرة شاملة وأدوات الإدارة العليا."
        action={<Badge>Super Owner</Badge>}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <Card key={c.title}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <div className="text-xs text-muted-foreground">{c.title}</div>
                <div className="text-2xl font-bold">{stats.isLoading ? "…" : c.count ?? 0}</div>
              </div>
              <c.icon className="h-6 w-6 text-primary/60" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-3 text-sm font-semibold">الأدوات الإدارية</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="flex items-center gap-2 rounded-md border p-3 text-sm hover:bg-muted/50"
              >
                <l.icon className="h-4 w-4 text-primary" />
                <span>{l.title}</span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
