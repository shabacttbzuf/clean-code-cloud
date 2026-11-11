import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { createCustomRole, deleteCustomRole, setCustomRolePermission } from "@/lib/enterprise.functions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, ShieldAlert, Copy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/roles")({ component: RolesPage });

const BUILTIN = ["owner", "manager", "accountant", "cashier", "warehouse", "waiter", "kitchen"];

function RolesPage() {
  const { tenantId, role, loading } = useActiveTenant();
  const qc = useQueryClient();
  const createFn = useServerFn(createCustomRole);
  const delFn = useServerFn(deleteCustomRole);
  const setPermFn = useServerFn(setCustomRolePermission);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", copy_from_builtin: "" as string, copy_from_custom: "" });
  const [selected, setSelected] = useState<string | null>(null);
  const canAccess = role === "owner" || role === "manager";
  const canManage = role === "owner";

  const customRolesQ = useQuery({
    queryKey: ["custom-roles", tenantId],
    queryFn: async () =>
      (await supabase.from("custom_roles").select("*").eq("tenant_id", tenantId!).order("created_at")).data ?? [],
    enabled: !!tenantId && canAccess,
  });

  const permsQ = useQuery({
    queryKey: ["perm-catalog"],
    queryFn: async () =>
      (await supabase.from("permissions").select("key, label_ar, category").order("category").order("key")).data ?? [],
    enabled: canAccess,
  });

  const rolePermsQ = useQuery({
    queryKey: ["role-perms", selected],
    queryFn: async () => {
      if (!selected) return [] as string[];
      const { data } = await supabase
        .from("role_permissions")
        .select("permission_key")
        .eq("custom_role_id", selected)
        .eq("role_kind", "custom");
      return (data ?? []).map((r) => r.permission_key);
    },
    enabled: !!selected,
  });

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          tenant_id: tenantId!,
          name: form.name.trim(),
          description: form.description || null,
          copy_from_builtin: (form.copy_from_builtin || null) as any,
          copy_from_custom: form.copy_from_custom || null,
        },
      }),
    onSuccess: () => {
      setOpen(false);
      setForm({ name: "", description: "", copy_from_builtin: "", copy_from_custom: "" });
      qc.invalidateQueries({ queryKey: ["custom-roles", tenantId] });
      toast.success("تم إنشاء الدور");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id, tenant_id: tenantId! } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-roles", tenantId] });
      if (selected) setSelected(null);
      toast.success("تم الحذف");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePerm = useMutation({
    mutationFn: (v: { key: string; granted: boolean }) =>
      setPermFn({
        data: {
          tenant_id: tenantId!,
          custom_role_id: selected!,
          permission_key: v.key,
          granted: v.granted,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["role-perms", selected] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return <Loader2 className="mx-auto my-12 h-6 w-6 animate-spin text-primary" />;
  if (!canAccess)
    return (
      <div className="space-y-6">
        <PageHeader title="إدارة الأدوار" />
        <Card>
          <CardContent className="flex items-center gap-3 p-8 text-muted-foreground">
            <ShieldAlert className="h-5 w-5 text-destructive" /> هذه الصفحة للمالك فقط.
          </CardContent>
        </Card>
      </div>
    );

  const permsSet = new Set(rolePermsQ.data ?? []);
  const grouped = new Map<string, { key: string; label_ar: string }[]>();
  for (const p of permsQ.data ?? []) {
    const arr = grouped.get(p.category) ?? [];
    arr.push(p);
    grouped.set(p.category, arr);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="إدارة الأدوار"
        subtitle="أدوار مبنية مسبقًا + أدوار مخصصة غير محدودة. يمكنك نسخ الصلاحيات من دور آخر."
        action={
          canManage ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="ml-2 h-4 w-4" /> دور مخصص جديد
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          <Card>
            <CardContent className="p-3">
              <div className="mb-2 text-xs font-semibold text-muted-foreground">الأدوار الأساسية</div>
              <div className="flex flex-wrap gap-1">
                {BUILTIN.map((r) => (
                  <Badge key={r} variant="outline">{r}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="mb-2 text-xs font-semibold text-muted-foreground">الأدوار المخصصة</div>
              <div className="space-y-1">
                {(customRolesQ.data ?? []).map((r: any) => (
                  <div
                    key={r.id}
                    className={`flex cursor-pointer items-center justify-between rounded-md border p-2 text-sm ${
                      selected === r.id ? "border-primary bg-primary/5" : ""
                    }`}
                    onClick={() => setSelected(r.id)}
                  >
                    <div>
                      <div>{r.name}</div>
                      {r.copied_from_builtin && (
                        <div className="text-[10px] text-muted-foreground">
                          <Copy className="mr-1 inline h-3 w-3" />
                          من: {r.copied_from_builtin}
                        </div>
                      )}
                    </div>
                    {canManage && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("حذف الدور؟")) del.mutate(r.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
                {(customRolesQ.data ?? []).length === 0 && (
                  <div className="text-xs text-muted-foreground">لا توجد أدوار مخصصة بعد.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-4">
            {!selected ? (
              <div className="grid h-40 place-items-center text-sm text-muted-foreground">
                {canManage ? "اختر دورًا مخصصًا لتعديل صلاحياته." : "اختر دورًا مخصصًا لمراجعة صلاحياته."}
              </div>
            ) : permsQ.isLoading || rolePermsQ.isLoading ? (
              <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin" />
            ) : (
              <div className="space-y-4">
                {Array.from(grouped.entries()).map(([cat, perms]) => (
                  <div key={cat}>
                    <div className="mb-2 text-xs font-semibold text-muted-foreground">{cat}</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {perms.map((p) => {
                        const on = permsSet.has(p.key);
                        return (
                          <label key={p.key} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                            <div className="flex-1">
                              <div>{p.label_ar}</div>
                              <div dir="ltr" className="text-[10px] text-muted-foreground">{p.key}</div>
                            </div>
                            <Checkbox
                              checked={on}
                              disabled={!canManage || togglePerm.isPending}
                              onCheckedChange={(v) => togglePerm.mutate({ key: p.key, granted: !!v })}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {canManage && <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>دور مخصص جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>الاسم</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>الوصف</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label>نسخ الصلاحيات من دور أساسي (اختياري)</Label>
              <Select
                value={form.copy_from_builtin || "__none__"}
                onValueChange={(v) => setForm({ ...form, copy_from_builtin: v === "__none__" ? "" : v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {BUILTIN.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button disabled={!form.name.trim() || create.isPending} onClick={() => create.mutate()}>
              {create.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              إنشاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>}
    </div>
  );
}
