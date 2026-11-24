import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Keeps the existing notification queries fresh without introducing a second
 * notification store. Realtime payloads are never rendered directly: the UI
 * refetches through Postgres/RLS so audience and tenant policies remain the
 * source of truth.
 */
export function useNotificationSync(tenantId?: string | null, userId?: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!tenantId || !userId) return;

    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["topbar-notifications", tenantId, userId] });
      void queryClient.invalidateQueries({ queryKey: ["notifications-list", tenantId, userId] });
    };

    const channel = supabase
      .channel(`notification-sync:${tenantId}:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `tenant_id=eq.${tenantId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notification_reads", filter: `user_id=eq.${userId}` },
        refresh,
      )
      .subscribe();

    const onOnline = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.removeChannel(channel);
    };
  }, [tenantId, userId, queryClient]);
}
