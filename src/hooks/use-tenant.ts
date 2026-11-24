import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { OFFLINE_AUTH_CACHE_MAX_AGE_MS, withOfflineFallback } from "@/lib/offline-reference-cache";

export type Membership = {
  tenant_id: string;
  role: "owner" | "manager" | "accountant" | "cashier" | "warehouse" | "waiter";
  branch_id: string | null;
  company_id?: string | null;
  custom_role_id?: string | null;
};

export type Tenant = {
  id: string;
  name: string;
  logo_url: string | null;
  currency: string;
  tax_rate: number;
  owner_id: string;
};

async function fetchMemberships(userId: string): Promise<Membership[]> {
  return withOfflineFallback(`auth-memberships:v1:${userId}`, async () => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("tenant_id, role, branch_id, company_id, custom_role_id")
      .eq("user_id", userId);
    if (error) throw error;
    return (data ?? []) as Membership[];
  }, OFFLINE_AUTH_CACHE_MAX_AGE_MS);
}

async function fetchTenant(id: string, userId = "unknown"): Promise<Tenant | null> {
  return withOfflineFallback(`auth-shell-tenant:v1:${userId}:${id}`, async () => {
    const { data, error } = await supabase.from("tenants").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data as Tenant | null;
  }, OFFLINE_AUTH_CACHE_MAX_AGE_MS);
}

export function useMemberships(userId: string | undefined) {
  return useQuery({
    queryKey: ["memberships", userId],
    queryFn: () => fetchMemberships(userId!),
    enabled: !!userId,
  });
}

export function useTenant(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["tenant", tenantId],
    queryFn: () => fetchTenant(tenantId!),
    enabled: !!tenantId,
  });
}

const ACTIVE_TENANT_KEY = "ras-active-tenant";
export function getActiveTenantId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_TENANT_KEY);
}
export function setActiveTenantId(id: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_TENANT_KEY, id);
}
