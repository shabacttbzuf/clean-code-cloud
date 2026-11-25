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
      const { data, error } = await supabase.rpc("get_super_owner_status");
      if (error) throw error;
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("Invalid super owner status");
      }
      // Supabase JSON RPC payloads are typed as Json; narrow each field before use.
      const payload = data as Record<string, unknown>;
      const totalCount = payload.totalCount;
      const isSuperOwner = payload.isSuperOwner;
      if (typeof totalCount !== "number" || !Number.isSafeInteger(totalCount) || totalCount < 0 ||
          typeof isSuperOwner !== "boolean") {
        throw new Error("Invalid super owner status payload");
      }
      if (isSuperOwner && totalCount === 0) {
        throw new Error("Inconsistent super owner status payload");
      }
      return { totalCount, isSuperOwner };
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  return {
    isSuperOwner: !query.isError && query.data?.isSuperOwner === true,
    totalCount: query.isError ? 0 : query.data?.totalCount ?? 0,
    loading: query.isLoading,
    statusKnown: !query.isLoading && !query.isError && query.data !== undefined,
    statusError: query.error,
    refetch: query.refetch,
  };
}
