import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { useAuthSession } from "@/hooks/use-auth-session";
import { safeInternalNotificationPath, notificationPathPermission } from "@/lib/notification-links";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/notifications")({ component: NotificationsPage });

function NotificationsPage() {
  const { tenantId, loading, hasPermission, isSuperOwner } = useActiveTenant();
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notifications-list", tenantId, user?.id],
    queryFn: async () => {
      const [items, readIds] = await Promise.all([
        (async () => {
          const rows: any[] = [];
          for (let from = 0; ; from += 500) {
            const { data, error } = await supabase.from("notifications").select("*")
              .eq("tenant_id", tenantId!).order("created_at", { ascending: false }).range(from, from + 499);
            if (error) throw error;
            rows.push(...(data ?? []));
            if ((data ?? []).length < 500) break;
          }
          return rows;
        })(),
        (async () => {
          const ids = new Set<string>();
          for (let from = 0; ; from += 500) {
            const { data, error } = await (supabase.from("notification_reads" as any) as any)
              .select("notification_id").eq("user_id", user!.id).range(from, from + 499);
            if (error) throw error;
            for (const row of data ?? []) ids.add(row.notification_id);
            if ((data ?? []).length < 500) break;
          }
          return ids;
        })(),
      ]);
      return { items, readIds };
    },
    enabled: !!tenantId && !!user?.id,
    refetchInterval: 30_000,
  });
  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!user?.id || !ids.length) return;
      for (let i = 0; i < ids.length; i += 500) {
        const { error } = await (supabase.from("notification_reads" as any) as any).upsert(
          ids.slice(i, i + 500).map((notification_id) => ({ notification_id, user_id: user.id })),
          { onConflict: "notification_id,user_id" },
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications-list", tenantId, user?.id] });
      qc.invalidateQueries({ queryKey: ["topbar-notifications", tenantId, user?.id] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر تحديث الإشعار"),
  });
  const unread = (q.data?.items ?? []).filter((n: any) => !q.data?.readIds.has(n.id));
  async function openNotification(notification: any) {
    const target = safeInternalNotificationPath(notification.action_path);
    if (!target) {
      markRead.mutate([notification.id]);
      return;
    }
    const requiredPermission = notificationPathPermission(target);
    const targetPath = target.split(/[?#]/, 1)[0] ?? target;
    const allowed = isSuperOwner || (requiredPermission
      ? hasPermission(requiredPermission)
      : targetPath === "/profile" || targetPath === "/notifications");
    if (!allowed) {
      toast.error("لا تملك صلاحية فتح وجهة هذا الإشعار.");
      return;
    }
    try {
      await markRead.mutateAsync([notification.id]);
      navigate({ to: target as any });
    } catch {
      // The mutation already reports the read failure; do not navigate on failure.
    }
  }

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
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString("ar-YE")} — {n.audience_type}</div>
                  {n.action_path && (() => {
                    const target = safeInternalNotificationPath(n.action_path);
                    const requiredPermission = target ? notificationPathPermission(target) : null;
                    const targetPath = target?.split(/[?#]/, 1)[0] ?? "";
                    const canOpen = !!target && (isSuperOwner || (requiredPermission
                      ? hasPermission(requiredPermission)
                      : targetPath === "/profile" || targetPath === "/notifications"));
                    return <Button size="sm" variant="outline" disabled={!canOpen} onClick={() => { void openNotification(n); }}>{n.action_label || "فتح"}</Button>;
                  })()}
                </div>
              </div>;
            })}
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}
