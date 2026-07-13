import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "./use-auth-session";

const ACTIVE_TENANT_KEY = "ras-active-tenant";

export type Membership = {
  tenant_id: string;
  role: "owner" | "manager" | "accountant" | "cashier" | "warehouse" | "waiter";
  branch_id: string | null;
};

export type Tenant = {
  id: string;
  name: string;
  logo_url: string | null;
  currency: string;
  tax_rate: number;
  owner_id: string;
};

/**
 * Central hook: resolves current user, their memberships, and the active tenant.
 * Used by every protected page.
 */
export function useActiveTenant() {
  const { user, loading: sessionLoading } = useAuthSession();

  const memQuery = useQuery({
    queryKey: ["memberships", user?.id],
    queryFn: async (): Promise<Membership[]> => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("tenant_id, role, branch_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []) as Membership[];
    },
    enabled: !!user?.id,
  });

  const [activeId, setActiveId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(ACTIVE_TENANT_KEY);
  });

  // When memberships load, ensure activeId is valid
  useEffect(() => {
    if (!memQuery.data) return;
    const ids = memQuery.data.map((m) => m.tenant_id);
    if (ids.length === 0) return;
    if (!activeId || !ids.includes(activeId)) {
      const next = ids[0];
      setActiveId(next);
      if (typeof window !== "undefined") window.localStorage.setItem(ACTIVE_TENANT_KEY, next);
    }
  }, [memQuery.data, activeId]);

  const tenantQuery = useQuery({
    queryKey: ["tenant", activeId],
    queryFn: async (): Promise<Tenant | null> => {
      const { data, error } = await supabase.from("tenants").select("*").eq("id", activeId!).maybeSingle();
      if (error) throw error;
      return data as Tenant | null;
    },
    enabled: !!activeId,
  });

  const membership = useMemo(
    () => memQuery.data?.find((m) => m.tenant_id === activeId) ?? null,
    [memQuery.data, activeId],
  );

  const role = membership?.role ?? null;
  const isAdmin = role === "owner" || role === "manager";

  return {
    user,
    userId: user?.id ?? null,
    loading: sessionLoading || memQuery.isLoading || tenantQuery.isLoading,
    tenantId: activeId,
    tenant: tenantQuery.data ?? null,
    memberships: memQuery.data ?? [],
    membership,
    role,
    isAdmin,
    switchTenant: (id: string) => {
      setActiveId(id);
      if (typeof window !== "undefined") window.localStorage.setItem(ACTIVE_TENANT_KEY, id);
    },
  };
}
