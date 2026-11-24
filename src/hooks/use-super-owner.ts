import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { OFFLINE_AUTH_CACHE_MAX_AGE_MS, withOfflineFallback } from "@/lib/offline-reference-cache";
import { useAuthSession } from "./use-auth-session";

/**
 * Returns whether the current user is a super owner (global system admin).
 * Also returns the current count of super owners so the UI can offer
 * bootstrap when the table is empty.
 */
export function useSuperOwner() {
  const { user } = useAuthSession();

  const query = useQuery({
    queryKey: ["super-owner-status", user?.id],
    queryFn: async () =>
      withOfflineFallback(`auth-super-owner-status:v1:${user!.id}`, async () => {
        const { data, error } = await supabase.rpc("get_super_owner_status");
        if (error) throw error;
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          throw new Error("Invalid super owner status");
        }
        return {
          totalCount: typeof data.totalCount === "number" ? data.totalCount : 0,
          isSuperOwner: data.isSuperOwner === true,
        };
      }, OFFLINE_AUTH_CACHE_MAX_AGE_MS),
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  return {
    isSuperOwner: query.data?.isSuperOwner ?? false,
    totalCount: query.data?.totalCount ?? 0,
    loading: query.isLoading,
    refetch: query.refetch,
  };
}
