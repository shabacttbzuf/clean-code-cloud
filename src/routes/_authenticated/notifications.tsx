import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { useAuthSession } from "@/hooks/use-auth-session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/notifications")({ component: NotificationsPage });

function NotificationsPage() {
  const { tenantId, loading } = useActiveTenant();
  const { user } = useAuthSession();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notifications-list", tenantId, user?.id],
    queryFn: async () => {
      const [items, reads] = await Promise.all([
        supabase.from("notifications").select("*").eq("tenant_id", tenantId!).order("created_at", { ascending: false }).limit(100),
        (supabase.from("notification_reads" as any) as any).select("notification_id").eq("user_id", user!.id),
      ]);
      if (items.error) throw items.error;
      if (reads.error) throw reads.error;
      return { items: items.data ?? [], readIds: new Set<string>((reads.data ?? []).map((r: { notification_id: string }) => r.notification_id)) };
    },
    enabled: !!tenantId && !!user?.id,
    refetchInterval: 30_000,
  });
  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!user?.id || !ids.length) return;
      const { error } = await (supabase.from("notification_reads" as any) as any).upsert(
        ids.map((notification_id) => ({ notification_id, user_id: user.id })),
        { onConflict: "notification_id,user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications-list", tenantId, user?.id] });
      qc.invalidateQueries({ queryKey: ["topbar-notifications", tenantId, user?.id] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر تحديث الإشعار"),
  });
  const unread = (q.data?.items ?? []).filter((n: any) => !q.data?.readIds.has(n.id));

  if (loading) return <Loader2 className="mx-auto my-12 h-6 w-6 animate-spin text-primary" />;
  return (
    <div className="space-y-6">
      <PageHeader title="الإشعارات" subtitle="تنبيهات الشركة والفرع والحساب، مع حالة قراءة مستقلة لكل مستخدم."
        action={<Button variant="outline" onClick={() => markRead.mutate(unread.map((n: any) => n.id))} disabled={!unread.length || markRead.isPending}><CheckCheck className="ml-2 h-4 w-4" />قراءة الكل</Button>} />
      <Card><CardContent className="p-4">
        {q.isLoading ? <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin" /> : (q.data?.items ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground"><Bell className="h-8 w-8 opacity-40" /><div>لا توجد إشعارات بعد.</div></div>
        ) : (
          <div className="space-y-2">
            {(q.data?.items ?? []).map((n: any) => {
              const isRead = q.data?.readIds.has(n.id);
              return <div key={n.id} className={`rounded-md border p-3 ${isRead ? "opacity-75" : "border-primary/40 bg-primary/[0.03]"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                    {!isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                    <Badge variant={n.urgency === "critical" ? "destructive" : "outline"}>{n.urgency}</Badge><span>{n.title}</span>
                  </div>
                  {!isRead && <Button size="sm" variant="ghost" onClick={() => markRead.mutate([n.id])}>تمت القراءة</Button>}
                </div>
                {n.body && <p className="mt-2 text-sm text-muted-foreground">{n.body}</p>}
                <div className="mt-2 text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString("ar-YE")} — {n.audience_type}</div>
              </div>;
            })}
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}
