import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Pencil, Trash2, RefreshCw, Armchair, LockOpen } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tables")({ component: TablesPage });

type Branch = { id: string; name: string };
type RestaurantTable = {
  id: string; tenant_id: string; branch_id: string; name: string;
  capacity: number; section_name: string | null; status: "active" | "reserved" | "disabled";
  current_sale_id: string | null;
};

function TablesPage() {
  const { tenantId, membership, isSuperOwner, hasPermission } = useActiveTenant();
  const canManage = hasPermission("tables.manage") || isSuperOwner;
  const qc = useQueryClient();
  const [branchId, setBranchId] = useState(membership?.branch_id ?? "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RestaurantTable | null>(null);
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("2");
  const [section, setSection] = useState("");
  const [status, setStatus] = useState<RestaurantTable["status"]>("active");

  const branches = useQuery({
    queryKey: ["restaurant-table-branches", tenantId, membership?.branch_id],
    queryFn: async (): Promise<Branch[]> => {
      let query = supabase.from("branches").select("id,name").eq("tenant_id", tenantId!).eq("is_active", true).order("name");
      if (membership?.branch_id && !isSuperOwner) query = query.eq("id", membership.branch_id);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Branch[];
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (!branchId && branches.data?.length) setBranchId(branches.data[0].id);
  }, [branchId, branches.data]);

  const tables = useQuery({
    queryKey: ["restaurant-tables", tenantId, branchId],
    queryFn: async (): Promise<RestaurantTable[]> => {
      const { data, error } = await (supabase.from("restaurant_tables" as any) as any)
        .select("id,tenant_id,branch_id,name,capacity,section_name,status,current_sale_id")
        .eq("tenant_id", tenantId!).eq("branch_id", branchId).order("name");
      if (error) throw error;
      return (data ?? []) as RestaurantTable[];
    },
    enabled: !!tenantId && !!branchId,
  });

  const resetForm = () => {
    setEditing(null); setName(""); setCapacity("2"); setSection(""); setStatus("active");
  };
  const save = useMutation({
    mutationFn: async () => {
      if (!tenantId || !branchId) throw new Error("اختر الفرع أولاً");
      const parsedCapacity = Number(capacity);
      if (!name.trim() || name.trim().length > 80) throw new Error("أدخل اسماً صحيحاً للطاولة");
      if (!Number.isInteger(parsedCapacity) || parsedCapacity < 1 || parsedCapacity > 100) throw new Error("السعة يجب أن تكون بين 1 و100");
      const payload = { tenant_id: tenantId, branch_id: branchId, name: name.trim(), capacity: parsedCapacity, section_name: section.trim() || null, status };
      if (editing) {
        if (editing.current_sale_id) throw new Error("لا يمكن تعديل طاولة مرتبطة بطلب مفتوح");
        const { error } = await (supabase.from("restaurant_tables" as any) as any).update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("restaurant_tables" as any) as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["restaurant-tables", tenantId, branchId] });
      setDialogOpen(false); resetForm(); toast.success("تم حفظ الطاولة");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر حفظ الطاولة"),
  });

  const release = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.rpc as any)("close_restaurant_table", { _table_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["restaurant-tables", tenantId, branchId] });
      toast.success("تم إخلاء الطاولة");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر إخلاء الطاولة"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("restaurant_tables" as any) as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["restaurant-tables", tenantId, branchId] });
      toast.success("تم حذف الطاولة");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "لا يمكن حذف طاولة مشغولة"),
  });

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader title="إدارة الطاولات" subtitle="إدارة طاولات كل فرع ومنع إسناد الطلب نفسه لأكثر من طاولة أو إسناد طاولة مشغولة." action={
        <div className="flex flex-wrap items-center gap-2">
          <Select value={branchId} onValueChange={setBranchId} disabled={!!membership?.branch_id && !isSuperOwner}>
            <SelectTrigger className="w-44"><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
            <SelectContent>{(branches.data ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
          {canManage && <Button onClick={() => { resetForm(); setDialogOpen(true); }} disabled={!branchId}><Plus className="ml-2 h-4 w-4" />إضافة طاولة</Button>}
        </div>
      } />
      {branches.isError && <p role="alert" className="text-sm text-destructive">تعذر تحميل الفروع.</p>}
      {tables.isError && <div role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">تعذر تحميل الطاولات. <Button variant="link" onClick={() => tables.refetch()}>إعادة المحاولة</Button></div>}
      {tables.isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div> :
        (tables.data ?? []).length === 0 ? <Card><CardContent className="py-14 text-center text-muted-foreground"><Armchair className="mx-auto mb-3 h-8 w-8" />لا توجد طاولات في هذا الفرع بعد.</CardContent></Card> :
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(tables.data ?? []).map((table) => {
            const occupied = !!table.current_sale_id;
            return <Card key={table.id} className="overflow-hidden">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2"><Armchair className="h-5 w-5 text-primary" /><div><div className="font-bold">{table.name}</div><div className="text-xs text-muted-foreground">{table.section_name || "بدون قسم"} · {table.capacity} مقاعد</div></div></div>
                  <Badge variant={occupied ? "destructive" : table.status === "active" ? "default" : "secondary"}>{occupied ? "مشغولة" : table.status === "active" ? "متاحة" : table.status === "reserved" ? "محجوزة" : "متوقفة"}</Badge>
                </div>
                {occupied && <div className="rounded-md bg-muted p-2 text-xs text-muted-foreground">مرتبطة بطلب مفتوح. لا يمكن حذفها أو تعديلها حتى إخلائها.</div>}
                {canManage && <div className="flex gap-2 border-t pt-2">
                  {occupied ? <Button size="sm" variant="outline" className="flex-1" disabled={release.isPending} onClick={() => release.mutate(table.id)}><LockOpen className="ml-1 h-3 w-3" />إخلاء الطاولة</Button> :
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEditing(table); setName(table.name); setCapacity(String(table.capacity)); setSection(table.section_name ?? ""); setStatus(table.status); setDialogOpen(true); }}><Pencil className="ml-1 h-3 w-3" />تعديل</Button>}
                  <Button size="sm" variant="ghost" className="text-destructive" disabled={occupied || remove.isPending} onClick={() => { if (confirm("هل تريد حذف هذه الطاولة؟")) remove.mutate(table.id); }}><Trash2 className="h-4 w-4" /></Button>
                </div>}
              </CardContent>
            </Card>;
          })}
        </div>
      }
      <Button type="button" variant="ghost" size="sm" onClick={() => tables.refetch()}><RefreshCw className="ml-2 h-4 w-4" />تحديث القائمة</Button>
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>{editing ? "تعديل الطاولة" : "إضافة طاولة"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>اسم أو رقم الطاولة</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="مثال: طاولة 01" /></div>
            <div className="space-y-1"><Label>عدد المقاعد</Label><Input type="number" min="1" max="100" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></div>
            <div className="space-y-1"><Label>القسم / الصالة</Label><Input value={section} onChange={(e) => setSection(e.target.value)} maxLength={80} placeholder="الصالة الداخلية" /></div>
            <div className="space-y-1"><Label>الحالة</Label><Select value={status} onValueChange={(v) => setStatus(v as RestaurantTable["status"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">متاحة</SelectItem><SelectItem value="reserved">محجوزة</SelectItem><SelectItem value="disabled">متوقفة</SelectItem></SelectContent></Select></div>
          </div>
          <DialogFooter><Button onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}>{save.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
