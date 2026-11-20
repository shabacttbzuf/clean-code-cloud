import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Check, X, Trash2, Loader2, CalendarDays, Printer } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/hr/leaves")({
  component: LeavesPage,
});

type LeaveRow = {
  id: string; tenant_id: string; employee_id: string; leave_type_id: string | null;
  start_date: string; end_date: string; days_count: number; reason: string | null;
  status: string; approved_at: string | null; approved_by?: string | null; rejection_reason: string | null; rejected_at?: string | null; rejected_by?: string | null;
};
type Employee = { id: string; full_name: string; status?: string };
type LeaveType = { id: string; name: string; color: string | null };

const statusLabels: Record<string, string> = { pending: "معلّق", approved: "معتمد", rejected: "مرفوض", cancelled: "ملغى" };
const statusColors: Record<string, string> = {
  pending: "bg-chart-4/15 text-chart-4",
  approved: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

function LeavesPage() {
  const { tenantId, isAdmin, userId } = useActiveTenant();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");

  const leaves = useQuery({
    queryKey: ["leave-requests", tenantId],
    queryFn: async (): Promise<LeaveRow[]> => {
      const { data, error } = await supabase.from("leave_requests").select("*").eq("tenant_id", tenantId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LeaveRow[];
    },
    enabled: !!tenantId,
  });

  const employees = useQuery({
    queryKey: ["employees-min", tenantId],
    queryFn: async (): Promise<Employee[]> => {
      const { data, error } = await supabase.from("employees").select("id, full_name, status").eq("tenant_id", tenantId!);
      if (error) throw error;
      return (data ?? []) as Employee[];
    },
    enabled: !!tenantId,
  });

  const types = useQuery({
    queryKey: ["leave-types", tenantId],
    queryFn: async (): Promise<LeaveType[]> => {
      const { data, error } = await supabase.from("leave_types").select("id, name, color").eq("tenant_id", tenantId!).eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as LeaveType[];
    },
    enabled: !!tenantId,
  });

  const empName = (id: string) => employees.data?.find((e) => e.id === id)?.full_name ?? "—";
  const typeName = (id: string | null) => types.data?.find((t) => t.id === id)?.name ?? "—";

  const filtered = (leaves.data ?? []).filter((l) => filter === "all" || l.status === filter);

  const setStatus = useMutation({
    mutationFn: async (v: { id: string; status: "approved" | "rejected"; reason?: string }) => {
      if (!tenantId || !userId) throw new Error("تعذر تحديد المؤسسة أو المستخدم الحالي");
      const now = new Date().toISOString();
      const payload = v.status === "approved"
        ? { status: "approved", approved_by: userId, approved_at: now, rejected_by: null, rejected_at: null, rejection_reason: null }
        : { status: "rejected", approved_by: null, approved_at: null, rejected_by: userId, rejected_at: now, rejection_reason: v.reason?.trim() ?? "" };
      const { data, error } = await supabase.from("leave_requests").update(payload)
        .eq("id", v.id).eq("tenant_id", tenantId).eq("status", "pending").select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("تمت معالجة الطلب مسبقاً أو لا تملك صلاحية اتخاذ القرار");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-requests", tenantId] }); toast.success("تم"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (!tenantId) throw new Error("المؤسسة غير محددة");
      const { data, error } = await supabase.from("leave_requests").delete()
        .eq("id", id).eq("tenant_id", tenantId).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("تعذر حذف الطلب؛ تحقق من الصلاحية أو ارتباطه بمسير رواتب معتمد");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-requests", tenantId] }); toast.success("تم حذف طلب الإجازة"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل حذف الطلب"),
  });

  const create = useMutation({
    mutationFn: async (v: { employee_id: string; leave_type_id: string | null; start_date: string; end_date: string; reason: string }) => {
      const days = Math.max(1, Math.round((new Date(v.end_date).getTime() - new Date(v.start_date).getTime()) / 86400000) + 1);
      const { error } = await supabase.from("leave_requests").insert({
        tenant_id: tenantId!, employee_id: v.employee_id, leave_type_id: v.leave_type_id,
        start_date: v.start_date, end_date: v.end_date, days_count: days, reason: v.reason || null,
        created_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave-requests", tenantId] }); toast.success("تم إرسال الطلب"); setOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل"),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="الإجازات" subtitle={`${filtered.length} طلب`}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="ml-2 h-4 w-4" />طلب إجازة</Button></DialogTrigger>
            <LeaveDialog employees={(employees.data ?? []).filter((e) => e.status === "active")} types={types.data ?? []} onSubmit={(v) => create.mutate(v)} pending={create.isPending} />
          </Dialog>
        }
      />

      <div className="flex justify-end print:hidden"><Button variant="outline" onClick={() => window.print()}><Printer className="ml-2 h-4 w-4" />طباعة كشف الإجازات</Button></div>
      <Select value={filter} onValueChange={setFilter}>
        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">كل الحالات</SelectItem>
          <SelectItem value="pending">معلّق</SelectItem>
          <SelectItem value="approved">معتمد</SelectItem>
          <SelectItem value="rejected">مرفوض</SelectItem>
        </SelectContent>
      </Select>

      {leaves.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <CalendarDays className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">لا توجد طلبات</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((l) => (
            <Card key={l.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{empName(l.employee_id)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusColors[l.status]}`}>{statusLabels[l.status]}</span>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {typeName(l.leave_type_id)} • {formatDate(l.start_date)} → {formatDate(l.end_date)} • {l.days_count} يوم
                  </div>
                  {l.reason && <div className="mt-1 text-xs text-muted-foreground">📝 {l.reason}</div>}
                  {l.rejection_reason && <div className="mt-1 text-xs text-destructive">سبب الرفض: {l.rejection_reason}</div>}
                </div>
                {isAdmin && l.status === "pending" && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: l.id, status: "approved" })}>
                      <Check className="ml-1 h-3 w-3" />اعتماد
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive" disabled={setStatus.isPending} onClick={() => {
                      const r = prompt("سبب الرفض (إلزامي):");
                      if (r === null) return;
                      if (!r.trim()) { toast.error("يجب كتابة سبب الرفض"); return; }
                      setStatus.mutate({ id: l.id, status: "rejected", reason: r.trim() });
                    }}>
                      <X className="ml-1 h-3 w-3" />رفض
                    </Button>
                  </div>
                )}
                {isAdmin && (
                  <Button size="sm" variant="ghost" className="text-destructive" disabled={remove.isPending} onClick={() => {
                    if (window.confirm("هل تريد حذف طلب الإجازة؟ سيتم منع الحذف إذا احتُسب ضمن مسير رواتب معتمد أو مدفوع.")) remove.mutate(l.id);
                  }}>
                    <Trash2 className="ml-1 h-3 w-3" />حذف
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function LeaveDialog({ employees, types, onSubmit, pending }: {
  employees: Employee[]; types: LeaveType[];
  onSubmit: (v: { employee_id: string; leave_type_id: string | null; start_date: string; end_date: string; reason: string }) => void;
  pending: boolean;
}) {
  const [emp, setEmp] = useState("");
  const [type, setType] = useState<string>("");
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>طلب إجازة جديد</DialogTitle></DialogHeader>
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        if (!emp) { toast.error("اختر موظف"); return; }
        if (!start || !end || end < start) { toast.error("تاريخ النهاية يجب ألا يسبق تاريخ البداية"); return; }
        onSubmit({ employee_id: emp, leave_type_id: type || null, start_date: start, end_date: end, reason });
      }}>
        <div className="space-y-2"><Label>الموظف *</Label>
          <Select value={emp} onValueChange={setEmp}>
            <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
            <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label>نوع الإجازة</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue placeholder="عام" /></SelectTrigger>
            <SelectContent>{types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label>من</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="space-y-2"><Label>إلى</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        </div>
        <div className="space-y-2"><Label>السبب</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></div>
        <DialogFooter>
          <Button type="submit" disabled={pending}>{pending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}إرسال</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}