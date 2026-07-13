import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Bell } from "lucide-react";

export const Route = createFileRoute("/_authenticated/notifications")({ component: NotificationsPage });

function NotificationsPage() {
  const { tenantId, loading } = useActiveTenant();

  const q = useQuery({
    queryKey: ["notifications-list", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  if (loading) return <Loader2 className="mx-auto my-12 h-6 w-6 animate-spin text-primary" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="الإشعارات"
        subtitle="بنية الإشعارات جاهزة — التسليم عبر البريد / التطبيق سيُفعّل في إصدار قادم."
      />
      <Card>
        <CardContent className="p-4">
          {q.isLoading ? (
            <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin" />
          ) : (q.data ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <Bell className="h-8 w-8 opacity-40" />
              <div>لا توجد إشعارات بعد.</div>
              <div className="text-xs">
                بنية قاعدة البيانات جاهزة لاستقبال إشعارات المالك، المديرين، الفروع، الأقسام والمستخدمين.
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {q.data!.map((n: any) => (
                <div key={n.id} className="rounded-md border p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Badge variant={n.urgency === "critical" ? "destructive" : "outline"}>{n.urgency}</Badge>
                    <span>{n.title}</span>
                  </div>
                  {n.body && <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>}
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {new Date(n.created_at).toLocaleString("ar-EG")} — {n.audience_type}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
