import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "./use-auth-session";
import { OFFLINE_AUTH_CACHE_MAX_AGE_MS, withOfflineFallback } from "@/lib/offline-reference-cache";

const ACTIVE_TENANT_KEY = "ras-active-tenant";

export type Membership = {
  tenant_id: string;
  role: "owner" | "manager" | "accountant" | "cashier" | "warehouse" | "waiter";
  branch_id: string | null;
  company_id: string | null;
  custom_role_id: string | null;
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
 * Super-owner status is resolved independently from tenant membership because
 * the platform owner must not need a cashier/owner role to manage platform data.
 */
export function useActiveTenant() {
  const { user, loading: sessionLoading } = useAuthSession();
  const queryClient = useQueryClient();

  const memQuery = useQuery({
    queryKey: ["memberships", user?.id],
    queryFn: async (): Promise<Membership[]> => {
      return withOfflineFallback(
        `auth-memberships:v1:${user!.id}`,
        async () => {
          const { data, error } = await supabase
            .from("user_roles")
            .select("tenant_id, role, branch_id, company_id, custom_role_id")
            .eq("user_id", user!.id);
          if (error) throw error;
          return (data ?? []) as Membership[];
        },
        OFFLINE_AUTH_CACHE_MAX_AGE_MS,
      );
    },
    enabled: !!user?.id,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const superOwnerQuery = useQuery({
    queryKey: ["is-super-owner", user?.id],
    // Privileged status must never be inferred from an offline/stale cache.
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_super_owner", {
        _user_id: user!.id,
      });
      if (error) throw error;
      return data === true;
    },
    enabled: !!user?.id,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
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
      return withOfflineFallback(
        `auth-tenant:v1:${user?.id ?? "unknown"}:${activeId!}`,
        async () => {
          const { data, error } = await supabase.from("tenants").select("*").eq("id", activeId!).maybeSingle();
          if (error) throw error;
          return data as Tenant | null;
        },
        OFFLINE_AUTH_CACHE_MAX_AGE_MS,
      );
    },
    enabled: !!activeId,
  });

  const tenantMemberships = useMemo(() => (memQuery.data ?? []).filter((item) => item.tenant_id === activeId), [memQuery.data, activeId]);
  const hasTenantWideMembership = tenantMemberships.some((item) => item.company_id === null);
  const companyMembershipIds = useMemo(() => [...new Set(tenantMemberships.map((item) => item.company_id).filter((id): id is string => !!id))], [tenantMemberships]);
  const companyScopeStorageKey = user?.id && activeId ? "ras-active-company:" + user.id + ":" + activeId : null;
  const [companySelection, setCompanySelection] = useState<{ scope: string | null; companyId: string | null; ready: boolean }>({ scope: null, companyId: null, ready: false });
  const companyOptionsQuery = useQuery({
    queryKey: ["authorized-companies", user?.id, activeId, hasTenantWideMembership ? "tenant-wide" : companyMembershipIds.slice().sort().join(":")],
    queryFn: async () => {
      if (!activeId) return [];
      let query = supabase.from("companies").select("id,name").eq("tenant_id", activeId).eq("is_active", true).order("name");
      if (!hasTenantWideMembership && companyMembershipIds.length) query = query.in("id", companyMembershipIds);
      else if (!hasTenantWideMembership) return [];
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id && !!activeId && (hasTenantWideMembership || companyMembershipIds.length > 0),
    staleTime: 30_000,
  });
  const companyOptions = useMemo(() => companyOptionsQuery.data ?? [], [companyOptionsQuery.data]);
  useEffect(() => {
    if (!companyScopeStorageKey || !tenantMemberships.length || companyOptionsQuery.isLoading || companyOptionsQuery.isError) return;
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(companyScopeStorageKey) : null;
    const allowedIds = new Set(companyOptions.map((item) => item.id));
    const nextCompanyId = stored === "__all__" && hasTenantWideMembership ? null : stored && allowedIds.has(stored) ? stored : hasTenantWideMembership ? null : companyMembershipIds.find((id) => allowedIds.has(id)) ?? null;
    setCompanySelection({ scope: companyScopeStorageKey, companyId: nextCompanyId, ready: true });
    if (typeof window !== "undefined") {
      if (nextCompanyId) window.localStorage.setItem(companyScopeStorageKey, nextCompanyId);
      else if (hasTenantWideMembership) window.localStorage.setItem(companyScopeStorageKey, "__all__");
      else window.localStorage.removeItem(companyScopeStorageKey);
    }
  }, [companyScopeStorageKey, tenantMemberships, companyMembershipIds, companyOptions, companyOptionsQuery.isLoading, companyOptionsQuery.isError, hasTenantWideMembership]);
  const activeCompanyId = companySelection.scope === companyScopeStorageKey && companySelection.ready ? companySelection.companyId : hasTenantWideMembership ? null : tenantMemberships[0]?.company_id ?? null;
  const membership = useMemo(() => tenantMemberships.find((item) => item.company_id === activeCompanyId) ?? tenantMemberships.find((item) => item.company_id === null) ?? tenantMemberships[0] ?? null, [tenantMemberships, activeCompanyId]);

  const role = membership?.role ?? null;
  const isAdmin = role === "owner" || role === "manager";
  const isSuperOwner = !superOwnerQuery.isError && superOwnerQuery.data === true;

  const permissionsQuery = useQuery({
    queryKey: ["effective-permissions", user?.id, activeId, membership?.role, membership?.company_id, membership?.branch_id, membership?.custom_role_id],
    // Authorization decisions fail closed; cached offline permissions are not grants.
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc("get_my_permissions", { _tenant_id: activeId! });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id && !!activeId,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (!user?.id || !activeId) return;
    const invalidateAuthorizationState = () => {
      queryClient.removeQueries({
        predicate: (query) => query.queryKey.includes(activeId) && query.queryKey[0] !== "tenant",
      });
      void queryClient.invalidateQueries({ queryKey: ["memberships", user.id] });
      void queryClient.invalidateQueries({ queryKey: ["effective-permissions", user.id, activeId] });
      void queryClient.invalidateQueries({ queryKey: ["route-effective-permissions", activeId, user.id] });
      void queryClient.invalidateQueries({ queryKey: ["topbar-search-permissions", activeId, user.id] });
    };
    const channel = supabase
      .channel(`authorization-state:${user.id}:${activeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${user.id}` }, invalidateAuthorizationState)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_permission_overrides", filter: `user_id=eq.${user.id}` }, invalidateAuthorizationState)
      .on("postgres_changes", { event: "*", schema: "public", table: "role_permissions", filter: `tenant_id=eq.${activeId}` }, invalidateAuthorizationState)
      .on("postgres_changes", { event: "*", schema: "public", table: "custom_roles", filter: `tenant_id=eq.${activeId}` }, invalidateAuthorizationState)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user?.id, activeId, queryClient]);

  const permissions = useMemo(
    () => new Set(permissionsQuery.isError ? [] : permissionsQuery.data ?? []),
    [permissionsQuery.data, permissionsQuery.isError],
  );
  const hasPermission = (permission: string) => isSuperOwner || permissions.has(permission);
  const branchOptionsQuery = useQuery({
    queryKey: ["authorized-branches", user?.id, activeId, activeCompanyId, membership?.branch_id],
    queryFn: async () => {
      if (!activeId) return [];
      let query = supabase.from("branches").select("id,name,company_id").eq("tenant_id", activeId).eq("is_active", true);
      if (activeCompanyId) query = query.eq("company_id", activeCompanyId);
      const { data, error } = await query.order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id && !!activeId && !!membership && (!!membership.branch_id || ["owner", "manager", "accountant"].includes(membership.role) || hasPermission("branches.view") || isSuperOwner),
    staleTime: 30_000,
  });
  const branchOptions = useMemo(() => branchOptionsQuery.data ?? [], [branchOptionsQuery.data]);
  const branchScopeKey = user?.id && activeId ? user.id + ":" + activeId + ":" + (activeCompanyId ?? "all-companies") : null;
  const [branchSelection, setBranchSelection] = useState<{ scope: string | null; branchId: string | null; ready: boolean }>({ scope: null, branchId: null, ready: false });
  useEffect(() => {
    if (!branchScopeKey || !membership || branchOptionsQuery.isLoading || branchOptionsQuery.isError) return;
    const canSelectAll = isSuperOwner || ["owner", "manager", "accountant"].includes(membership.role);
    const storageKey = "ras-active-branch:" + branchScopeKey;
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
    const allowedIds = new Set(branchOptions.map((item) => item.id));
    const nextBranchId = stored === "__all__" && canSelectAll ? null : stored && allowedIds.has(stored) ? stored : membership.branch_id && allowedIds.has(membership.branch_id) ? membership.branch_id : canSelectAll ? null : branchOptions[0]?.id ?? membership.branch_id ?? null;
    setBranchSelection({ scope: branchScopeKey, branchId: nextBranchId, ready: true });
    if (typeof window !== "undefined") {
      if (nextBranchId) window.localStorage.setItem(storageKey, nextBranchId);
      else if (canSelectAll) window.localStorage.setItem(storageKey, "__all__");
      else window.localStorage.removeItem(storageKey);
    }
  }, [branchScopeKey, membership, branchOptions, branchOptionsQuery.isLoading, branchOptionsQuery.isError, isSuperOwner]);
  const activeBranchId = branchSelection.scope === branchScopeKey && branchSelection.ready ? branchSelection.branchId : membership?.branch_id ?? null;
  const effectiveMembership = useMemo(() => membership ? { ...membership, company_id: activeCompanyId, branch_id: activeBranchId } : null, [membership, activeCompanyId, activeBranchId]);
  function switchCompany(companyId: string | null) {
    if (companyId === null && !hasTenantWideMembership) return;
    if (companyId !== null && !companyOptions.some((item) => item.id === companyId)) return;
    if (!companyScopeStorageKey) return;
    setCompanySelection({ scope: companyScopeStorageKey, companyId, ready: true });
    if (typeof window !== "undefined") window.localStorage.setItem(companyScopeStorageKey, companyId ?? "__all__");
    setBranchSelection({ scope: null, branchId: null, ready: false });
    queryClient.clear();
  }
  function switchBranch(id: string | null) {
    const canSelectAll = isSuperOwner || ["owner", "manager", "accountant"].includes(membership?.role ?? "");
    if (id === null && !canSelectAll) return;
    if (id !== null && !branchOptions.some((item) => item.id === id)) return;
    if (!branchScopeKey) return;
    const storageKey = "ras-active-branch:" + branchScopeKey;
    setBranchSelection({ scope: branchScopeKey, branchId: id, ready: true });
    if (typeof window !== "undefined") window.localStorage.setItem(storageKey, id ?? "__all__");
    queryClient.clear();
  }
  function switchTenant(id: string) {
    if (!memQuery.data?.some((item) => item.tenant_id === id) || id === activeId) return;
    setActiveId(id);
    setCompanySelection({ scope: null, companyId: null, ready: false });
    setBranchSelection({ scope: null, branchId: null, ready: false });
    if (typeof window !== "undefined") window.localStorage.setItem(ACTIVE_TENANT_KEY, id);
    queryClient.clear();
  }

  return {
    user,
    userId: user?.id ?? null,
    loading: sessionLoading || memQuery.isLoading || tenantQuery.isLoading || superOwnerQuery.isLoading || permissionsQuery.isLoading,
    tenantId: activeId,
    tenant: tenantQuery.data ?? null,
    memberships: memQuery.data ?? [],
    membership: effectiveMembership,
    companyOptions,
    companyLoading: companyOptionsQuery.isLoading,
    companyError: companyOptionsQuery.error,
    activeCompanyId,
    switchCompany,
    branchOptions,
    branchLoading: branchOptionsQuery.isLoading,
    branchError: branchOptionsQuery.error,
    activeBranchId,
    switchBranch,
    role,
    isAdmin,
    isSuperOwner,
    permissions,
    hasPermission,
    permissionsLoading: permissionsQuery.isLoading,
    permissionsError: permissionsQuery.error,
    switchTenant,
  };
}
