import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { useAuthSession } from "@/hooks/use-auth-session";
import { safeInternalNotificationPath, notificationPathPermission } from "@/lib/notification-links";
import { getUserSettingsPreferences, isNotificationEnabled, formatUserDateTime } from "@/lib/settings-preferences";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Bell, CheckCheck, Archive, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/notifications")({ component: NotificationsPage });

function NotificationsPage() {
  const { tenantId, loading, hasPermission, isSuperOwner } = useActiveTenant();
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const preferences = getUserSettingsPreferences(user?.id);
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
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
          const archivedIds = new Set<string>();
          for (let from = 0; ; from += 500) {
            const { data, error } = await (supabase.from("notification_reads" as any) as any)
              .select("notification_id,archived_at").eq("user_id", user!.id).range(from, from + 499);
            if (error) throw error;
            for (const row of data ?? []) { ids.add(row.notification_id); if (row.archived_at) archivedIds.add(row.notification_id); }
            if ((data ?? []).length < 500) break;
          }
          return { ids, archivedIds };
        })(),
      ]);
      return { items, readIds: readIds.ids, archivedIds: readIds.archivedIds };
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
  const archiveNotification = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      if (!user?.id) throw new Error("جلسة المستخدم غير متاحة");
      const now = new Date().toISOString();
      const { error } = await (supabase.from("notification_reads" as any) as any).upsert({
        notification_id: id, user_id: user.id, read_at: now, archived_at: archived ? now : null,
      }, { onConflict: "notification_id,user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications-list", tenantId, user?.id] });
      qc.invalidateQueries({ queryKey: ["topbar-notifications", tenantId, user?.id] });
      toast.success(showArchived ? "تمت استعادة الإشعار" : "تمت أرشفة الإشعار");
    },
    onError: () => toast.error("تعذر تحديث أرشيف الإشعارات"),
  });
  const visibleItems = (q.data?.items ?? []).filter((n: any) => isNotificationEnabled(n, preferences) && (showArchived ? q.data?.archivedIds.has(n.id) : !q.data?.archivedIds.has(n.id)));
  const unread = visibleItems.filter((n: any) => !q.data?.readIds.has(n.id));
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
      <PageHeader title="الإشعارات" subtitle="تنبيهات الشركة والفرع والحساب، مع حالة قراءة وأرشفة مستقلة لكل مستخدم."
        action={<div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setShowArchived((value) => !value)}><Archive className="ml-2 h-4 w-4" />{showArchived ? "الإشعارات الحالية" : "الأرشيف"}</Button>{!showArchived && <Button variant="outline" onClick={() => markRead.mutate(unread.map((n: any) => n.id))} disabled={!unread.length || markRead.isPending}><CheckCheck className="ml-2 h-4 w-4" />قراءة الكل</Button>}</div>} />
      <Card><CardContent className="p-4">
        {q.isError ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p role="alert" className="text-sm text-destructive">تعذر تحميل الإشعارات. لم يتم تغيير حالة القراءة.</p>
            <Button variant="outline" onClick={() => void q.refetch()} disabled={q.isFetching}>إعادة المحاولة</Button>
          </div>
        ) : q.isLoading ? <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin" /> : visibleItems.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground"><Bell className="h-8 w-8 opacity-40" /><div>{showArchived ? "الأرشيف فارغ." : "لا توجد إشعارات تطابق تفضيلات العرض الحالية."}</div></div>
        ) : (
          <div className="space-y-2">
            {visibleItems.map((n: any) => {
              const isRead = q.data?.readIds.has(n.id);
              return <div key={n.id} className={`rounded-md border p-3 ${isRead ? "opacity-75" : "border-primary/40 bg-primary/[0.03]"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                    {!isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                    <Badge variant={n.urgency === "critical" ? "destructive" : "outline"}>{n.urgency}</Badge><span>{n.title}</span>
                  </div>
                  <div className="flex items-center gap-1">{!isRead && !showArchived && <Button size="sm" variant="ghost" onClick={() => markRead.mutate([n.id])}>تمت القراءة</Button>}<Button size="sm" variant="ghost" disabled={archiveNotification.isPending} onClick={() => archiveNotification.mutate({ id: n.id, archived: !showArchived })}>{showArchived ? <RotateCcw className="ml-1 h-3.5 w-3.5" /> : <Archive className="ml-1 h-3.5 w-3.5" />}{showArchived ? "استعادة" : "أرشفة"}</Button></div>
                </div>
                {n.body && <p className="mt-2 text-sm text-muted-foreground">{n.body}</p>}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[10px] text-muted-foreground">{formatUserDateTime(n.created_at, preferences)} — {n.audience_type}</div>
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
