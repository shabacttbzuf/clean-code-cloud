import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { useSuperOwner } from "@/hooks/use-super-owner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/login-history")({ component: LoginHistoryPage });

function LoginHistoryPage() {
  const { tenantId, role, userId, loading } = useActiveTenant();
  const { isSuperOwner } = useSuperOwner();
  const canSeeAll = role === "owner" || role === "manager" || isSuperOwner;

  const q = useQuery({
    queryKey: ["login-history", tenantId, canSeeAll, userId],
    queryFn: async () => {
      let query = supabase
        .from("login_history")
        .select("id, user_id, login_at, logout_at, ip, browser, os, device, session_duration_seconds, tenant_id")
        .order("login_at", { ascending: false })
        .limit(200);
      if (canSeeAll && tenantId) query = query.eq("tenant_id", tenantId);
      else if (userId) query = query.eq("user_id", userId);
      const { data } = await query;
      const ids = Array.from(new Set((data ?? []).map((r) => r.user_id)));
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
        : { data: [] };
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return (data ?? []).map((r) => ({ ...r, profile: map.get(r.user_id) }));
    },
    enabled: !!userId,
  });

  if (loading) return <Loader2 className="mx-auto my-12 h-6 w-6 animate-spin text-primary" />;

  return (
    <div className="space-y-6">
      <PageHeader title="سجل الدخول" subtitle="آخر 200 عملية دخول." />
      <Card>
        <CardContent className="p-4">
          {q.isLoading ? (
            <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المستخدم</TableHead>
                    <TableHead>الدخول</TableHead>
                    <TableHead>الخروج</TableHead>
                    <TableHead>المدة</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>الجهاز</TableHead>
                    <TableHead>المتصفح / النظام</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(q.data ?? []).map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">
                        {r.profile?.full_name ?? r.profile?.email ?? r.user_id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-xs">{new Date(r.login_at).toLocaleString("ar-EG")}</TableCell>
                      <TableCell className="text-xs">{r.logout_at ? new Date(r.logout_at).toLocaleString("ar-EG") : "—"}</TableCell>
                      <TableCell className="text-xs" dir="ltr">
                        {r.session_duration_seconds != null ? `${Math.floor(r.session_duration_seconds / 60)}m` : "—"}
                      </TableCell>
                      <TableCell dir="ltr" className="text-xs">{r.ip ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.device ?? "—"}</TableCell>
                      <TableCell className="text-xs">{[r.browser, r.os].filter(Boolean).join(" / ") || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {(q.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">لا يوجد سجل بعد.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
