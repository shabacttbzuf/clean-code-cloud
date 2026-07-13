import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("super_owners")
        .select("user_id", { count: "exact" });
      if (error) throw error;
      const list = data ?? [];
      return {
        totalCount: count ?? list.length,
        isSuperOwner: !!user?.id && list.some((r) => r.user_id === user.id),
        allOwners: list.map((r) => r.user_id),
      };
    },
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
