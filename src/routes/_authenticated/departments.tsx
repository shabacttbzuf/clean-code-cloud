import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { upsertDepartment, deleteDepartment } from "@/lib/enterprise.functions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/departments")({ component: DepartmentsPage });

function DepartmentsPage() {
  const { tenantId, role, loading } = useActiveTenant();
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertDepartment);
  const delFn = useServerFn(deleteDepartment);
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);

  const canAccess = role === "owner" || role === "manager";

  const q = useQuery({
    queryKey: ["departments-list", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("departments")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("name");
      return data ?? [];
    },
    enabled: !!tenantId && canAccess,
  });

  const branchesQ = useQuery({
    queryKey: ["branches", tenantId],
    queryFn: async () => (await supabase.from("branches").select("id, name").eq("tenant_id", tenantId!)).data ?? [],
    enabled: !!tenantId && canAccess,
  });

  const companiesQ = useQuery({
    queryKey: ["companies", tenantId],
    queryFn: async () =>
      (await supabase.from("companies").select("id, name").eq("tenant_id", tenantId!).order("name")).data ?? [],
    enabled: !!tenantId && canAccess,
  });

  const save = useMutation({
    mutationFn: (v: any) => upsertFn({ data: { ...v, tenant_id: tenantId! } }),
    onSuccess: () => {
      toast.success("تم الحفظ");
      qc.invalidateQueries({ queryKey: ["departments-list", tenantId] });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id, tenant_id: tenantId! } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments-list", tenantId] });
      toast.success("تم الحذف");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return <Loader2 className="mx-auto my-12 h-6 w-6 animate-spin text-primary" />;
  if (!canAccess)
    return (
      <div className="space-y-6">
        <PageHeader title="الأقسام الإدارية" />
        <Card>
          <CardContent className="flex items-center gap-3 p-8 text-muted-foreground">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            هذه الصفحة متاحة للمالك أو المدير فقط.
          </CardContent>
        </Card>
      </div>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="الأقسام الإدارية"
        subtitle="أقسام غير محدودة يمكن ربطها بالفروع والشركات."
        actions={
          <Button
            onClick={() => {
              setEditing({});
              setOpen(true);
            }}
          >
            <Plus className="ml-2 h-4 w-4" /> قسم جديد
          </Button>
        }
      />
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {(q.data ?? []).map((d: any) => (
          <Card key={d.id}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-start justify-between">
                <div className="font-semibold">{d.name}</div>
                <Badge variant={d.is_active ? "default" : "secondary"}>{d.is_active ? "نشط" : "متوقف"}</Badge>
              </div>
              {d.description && <div className="text-xs text-muted-foreground line-clamp-2">{d.description}</div>}
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => { setEditing(d); setOpen(true); }}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => confirm("حذف؟") && del.mutate(d.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "تعديل قسم" : "قسم جديد"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>الاسم</Label>
                <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div>
                <Label>الفرع</Label>
                <Select
                  value={editing.branch_id ?? "__none__"}
                  onValueChange={(v) => setEditing({ ...editing, branch_id: v === "__none__" ? null : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {(branchesQ.data ?? []).map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>الشركة</Label>
                <Select
                  value={editing.company_id ?? "__none__"}
                  onValueChange={(v) => setEditing({ ...editing, company_id: v === "__none__" ? null : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {(companiesQ.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>الوصف</Label>
                <Textarea value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button
              disabled={save.isPending}
              onClick={() =>
                save.mutate({
                  id: editing?.id,
                  name: editing?.name,
                  branch_id: editing?.branch_id || null,
                  company_id: editing?.company_id || null,
                  description: editing?.description || null,
                })
              }
            >
              {save.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
