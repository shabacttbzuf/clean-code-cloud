import { Fragment, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { useSuperOwner } from "@/hooks/use-super-owner";
import { setUserPermission } from "@/lib/demo-data.functions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ShieldAlert, Eye, Lock } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/team-permissions")({ component: TeamPermissionsPage });

const CATEGORY_LABELS: Record<string, string> = {
  branches: "الفروع", users: "المستخدمون", catalog: "الكتالوج",
  sales: "المبيعات", inventory: "المخزون", crm: "العملاء",
  finance: "المالية", reports: "التقارير", system: "النظام", operations: "العمليات",
};

function TeamPermissionsPage() {
  const { tenantId, userId, role, loading: tLoading } = useActiveTenant();
  const { isSuperOwner } = useSuperOwner();
  const qc = useQueryClient();
  const setPerm = useServerFn(setUserPermission);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  const isOwner = role === "owner";
  const isManager = role === "manager";
  const canAccess = isOwner || isManager || isSuperOwner;

  const team = useQuery({
    queryKey: ["team-list", tenantId, userId, role, isSuperOwner],
    queryFn: async () => {
      if (!tenantId || !userId) return [] as Array<{
        user_id: string; role: string; branch_id: string | null;
        hired_by: string | null; full_name: string | null;
      }>;
      const { data: rolesRows, error } = await supabase
        .from("user_roles")
        .select("user_id, role, branch_id, hired_by")
        .eq("tenant_id", tenantId);
      if (error) throw error;
      const ids = Array.from(new Set((rolesRows ?? []).map((r) => r.user_id)));
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, full_name").in("id", ids)
        : { data: [] as { id: string; full_name: string | null }[] };
      const pmap = new Map((profiles ?? []).map((p) => [p.id, p.full_name] as const));
      return (rolesRows ?? []).map((r) => ({ ...r, full_name: pmap.get(r.user_id) ?? null }));
    },
    enabled: !!tenantId && !!userId && canAccess,
  });

  const permissions = useQuery({
    queryKey: ["perm-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("permissions").select("key, label_ar, category").order("category").order("key");
      if (error) throw error;
      return data ?? [];
    },
    enabled: canAccess,
  });

  const overrides = useQuery({
    queryKey: ["upo", tenantId, selectedUser],
    queryFn: async () => {
      if (!tenantId || !selectedUser) return [] as { permission_key: string; granted: boolean }[];
      const { data, error } = await supabase
        .from("user_permission_overrides")
        .select("permission_key, granted")
        .eq("tenant_id", tenantId)
        .eq("user_id", selectedUser);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedUser && !!tenantId,
  });

  const defaultPerms = useQuery({
    queryKey: ["default-role-perms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_permissions").select("builtin_role, permission_key")
        .is("tenant_id", null).eq("role_kind", "builtin");
      if (error) throw error;
      return data ?? [];
    },
    enabled: canAccess,
  });

  const filteredTeam = useMemo(() => {
    const list = team.data ?? [];
    if (isSuperOwner || isOwner) return list.filter((r) => r.user_id !== userId);
    if (isManager) return list.filter((r) => r.hired_by === userId);
    return [];
  }, [team.data, isOwner, isManager, isSuperOwner, userId]);

  const grouped = useMemo(() => {
    const g = new Map<string, typeof permissions.data extends undefined ? never : NonNullable<typeof permissions.data>>();
    for (const p of permissions.data ?? []) {
      const arr = g.get(p.category) ?? [];
      arr.push(p);
      g.set(p.category, arr as never);
    }
    return Array.from(g.entries());
  }, [permissions.data]);

  const selectedTeamMember = filteredTeam.find((r) => r.user_id === selectedUser) ?? null;

  // Owner may only VIEW (not edit) permissions of users the OTHER MANAGERS hired.
  const canEditSelected = useMemo(() => {
    if (!selectedTeamMember) return false;
    if (isSuperOwner) return true;
    if (isManager) return selectedTeamMember.hired_by === userId;
    if (isOwner) {
      // owner can edit managers and users they hired themselves; view-only otherwise
      if (selectedTeamMember.role === "manager") return true;
      if (selectedTeamMember.hired_by === userId) return true;
      return false;
    }
    return false;
  }, [selectedTeamMember, isOwner, isManager, isSuperOwner, userId]);

  const overrideMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const o of overrides.data ?? []) m.set(o.permission_key, o.granted);
    return m;
  }, [overrides.data]);

  const defaultsFor = (role: string) =>
    new Set((defaultPerms.data ?? []).filter((d) => d.builtin_role === role).map((d) => d.permission_key));

  const setMut = useMutation({
    mutationFn: (v: { permission_key: string; granted: boolean | null }) =>
      setPerm({ data: {
        tenant_id: tenantId!, user_id: selectedUser!,
        permission_key: v.permission_key, granted: v.granted,
      } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["upo", tenantId, selectedUser] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (tLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  if (!canAccess) {
    return (
      <div className="space-y-6">
        <PageHeader title="صلاحيات الفريق" />
        <Card><CardContent className="flex items-center gap-3 p-8 text-muted-foreground">
          <ShieldAlert className="h-5 w-5 text-destructive" />
          هذه الصفحة متاحة للمالك أو المدير فقط.
        </CardContent></Card>
      </div>
    );
  }

  const subtitle = isSuperOwner ? "كل الأدوار عبر كل المطاعم"
    : isOwner ? "تحكّم بصلاحيات المديرين ومن وظّفتهم بنفسك، وشاهد صلاحيات فريق المديرين"
    : "تحكّم بصلاحيات الموظفين الذين وظّفتهم أنت في فرعك";

  const roleDefaults = selectedTeamMember ? defaultsFor(selectedTeamMember.role) : new Set<string>();

  return (
    <div className="space-y-6">
      <PageHeader title="صلاحيات الفريق" subtitle={subtitle} />

      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-[280px_1fr]">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">اختر موظفاً</div>
            <Select value={selectedUser ?? ""} onValueChange={(v) => setSelectedUser(v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {filteredTeam.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    <span className="flex items-center gap-2">
                      <span>{m.full_name ?? m.user_id.slice(0, 8)}</span>
                      <Badge variant="outline" className="text-[10px]">{m.role}</Badge>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filteredTeam.length === 0 && (
              <p className="text-xs text-muted-foreground">لا يوجد موظفون تحت إدارتك بعد.</p>
            )}
            {selectedTeamMember && (
              <div className="rounded-md border p-3 text-xs">
                <div><span className="text-muted-foreground">الدور: </span>{selectedTeamMember.role}</div>
                <div><span className="text-muted-foreground">وظّفه: </span>
                  {selectedTeamMember.hired_by === userId ? "أنت" : (team.data?.find((t) => t.user_id === selectedTeamMember.hired_by)?.full_name ?? "—")}
                </div>
                <div className="mt-2 flex items-center gap-1 text-[10px]">
                  {canEditSelected ? (
                    <><span className="text-success">تحرير مسموح</span></>
                  ) : (
                    <><Eye className="h-3 w-3 text-muted-foreground" /> <span className="text-muted-foreground">عرض فقط</span></>
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            {!selectedUser ? (
              <div className="grid h-40 place-items-center text-sm text-muted-foreground">اختر موظفاً لعرض صلاحياته</div>
            ) : permissions.isLoading || overrides.isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : (
              <div className="space-y-4">
                {grouped.map(([cat, perms]) => (
                  <div key={cat}>
                    <div className="mb-2 text-xs font-semibold text-muted-foreground">{CATEGORY_LABELS[cat] ?? cat}</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(perms as Array<{ key: string; label_ar: string }>).map((p) => {
                        const isOverride = overrideMap.has(p.key);
                        const defaultOn = roleDefaults.has(p.key);
                        const effective = isOverride ? overrideMap.get(p.key)! : defaultOn;
                        return (
                          <label key={p.key} className={`flex items-center justify-between gap-2 rounded-md border p-2 text-sm ${!canEditSelected ? "opacity-70" : ""}`}>
                            <div className="flex-1">
                              <div>{p.label_ar}</div>
                              <div className="text-[10px] text-muted-foreground" dir="ltr">{p.key}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              {isOverride && <Badge variant="secondary" className="text-[9px]">مخصّص</Badge>}
                              {!canEditSelected && <Lock className="h-3 w-3 text-muted-foreground" />}
                              <Checkbox
                                checked={effective}
                                disabled={!canEditSelected || setMut.isPending}
                                onCheckedChange={(v) => {
                                  const next = !!v;
                                  // if flipping to default, clear override; otherwise set explicit
                                  if (next === defaultOn) {
                                    setMut.mutate({ permission_key: p.key, granted: null });
                                  } else {
                                    setMut.mutate({ permission_key: p.key, granted: next });
                                  }
                                }}
                              />
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
// prevent unused-var warning if imports go unused in some branches
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _keep = Fragment;