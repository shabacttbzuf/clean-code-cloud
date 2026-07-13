import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { useSuperOwner } from "@/hooks/use-super-owner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/audit-logs")({ component: AuditLogsPage });

const ENTITIES = [
  "products", "branches", "categories", "suppliers", "customers",
  "expenses", "purchases", "sales", "user_roles", "tenants",
] as const;

const ACTION_LABEL: Record<string, string> = {
  INSERT: "إضافة",
  UPDATE: "تعديل",
  DELETE: "حذف",
};

function AuditLogsPage() {
  const { tenantId, isAdmin, loading: tLoading } = useActiveTenant();
  const { isSuperOwner } = useSuperOwner();

  const [entity, setEntity] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const canView = isSuperOwner || isAdmin;

  const logs = useQuery({
    queryKey: ["audit-logs", tenantId, entity, action, isSuperOwner],
    queryFn: async () => {
      let q = supabase
        .from("audit_logs")
        .select("id, tenant_id, user_id, action, entity_type, entity_id, changes, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (!isSuperOwner && tenantId) q = q.eq("tenant_id", tenantId);
      if (entity !== "all") q = q.eq("entity_type", entity);
      if (action !== "all") q = q.eq("action", action);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: canView && !tLoading,
  });

  const userIds = useMemo(
    () => Array.from(new Set((logs.data ?? []).map((l) => l.user_id).filter(Boolean) as string[])),
    [logs.data],
  );

  const profiles = useQuery({
    queryKey: ["audit-profiles", userIds.join(",")],
    queryFn: async () => {
      if (userIds.length === 0) return {} as Record<string, string>;
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
      const m: Record<string, string> = {};
      for (const p of data ?? []) m[(p as { id: string }).id] = (p as { full_name: string }).full_name ?? "";
      return m;
    },
    enabled: userIds.length > 0,
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const list = logs.data ?? [];
    if (!s) return list;
    return list.filter((l) =>
      (l.entity_type ?? "").toLowerCase().includes(s) ||
      (l.entity_id ?? "").toLowerCase().includes(s) ||
      JSON.stringify(l.changes ?? {}).toLowerCase().includes(s),
    );
  }, [logs.data, search]);

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader title="سجل التدقيق" />
        <Card><CardContent className="flex items-center gap-3 p-8 text-muted-foreground">
          <ShieldAlert className="h-5 w-5 text-destructive" />
          هذه الصفحة متاحة للمالك أو المدير فقط.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="سجل التدقيق"
        subtitle={isSuperOwner ? "كل عمليات النظام عبر جميع المطاعم" : "عمليات مطعمك خلال الفترة الأخيرة"}
      />

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          <Input placeholder="بحث..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={entity} onValueChange={setEntity}>
            <SelectTrigger><SelectValue placeholder="النوع" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأنواع</SelectItem>
              {ENTITIES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger><SelectValue placeholder="الإجراء" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الإجراءات</SelectItem>
              <SelectItem value="INSERT">إضافة</SelectItem>
              <SelectItem value="UPDATE">تعديل</SelectItem>
              <SelectItem value="DELETE">حذف</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {logs.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">لا توجد سجلات مطابقة</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((l) => {
            const isOpen = expanded === l.id;
            const tone =
              l.action === "INSERT" ? "bg-success/15 text-success" :
              l.action === "DELETE" ? "bg-destructive/15 text-destructive" :
              "bg-primary/15 text-primary";
            return (
              <Card key={l.id}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={tone} variant="outline">{ACTION_LABEL[l.action] ?? l.action}</Badge>
                      <span className="text-sm font-semibold">{l.entity_type}</span>
                      <span className="text-xs text-muted-foreground">
                        {l.user_id ? (profiles.data?.[l.user_id] || l.user_id.slice(0, 8)) : "نظام"}
                      </span>
                      <span className="text-xs text-muted-foreground num">
                        {new Date(l.created_at).toLocaleString("ar-EG")}
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setExpanded(isOpen ? null : l.id)}>
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                  {isOpen && (
                    <pre className="mt-3 overflow-auto rounded-md bg-muted/50 p-3 text-[10px] leading-relaxed" dir="ltr">
                      {JSON.stringify(l.changes, null, 2)}
                    </pre>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}