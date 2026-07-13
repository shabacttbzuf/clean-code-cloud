import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/hr/attendance")({
  component: AttendancePage,
});

type Row = { id: string; employee_id: string; date: string; check_in: string | null; check_out: string | null; hours_worked: number; is_late: boolean; status: string; notes: string | null };
type Employee = { id: string; full_name: string };

const statusLabels: Record<string, string> = {
  present: "حاضر",
  late: "متأخر",
  early_leave: "انصراف مبكر",
  absent: "غائب",
  absent_excused: "غياب بعذر",
  absent_unexcused: "غياب بدون عذر",
  weekly_holiday: "عطلة أسبوعية",
  annual_leave: "إجازة سنوية",
  sick_leave: "إجازة مرضية",
  official_holiday: "عطلة رسمية",
  mission: "مأمورية",
  training: "تدريب",
  suspended: "موقوف",
  overtime: "ساعات إضافية",
  leave: "إجازة",
  holiday: "عطلة",
  half_day: "نصف يوم",
};
const statusColors: Record<string, string> = {
  present: "bg-success/15 text-success",
  late: "bg-chart-4/15 text-chart-4",
  early_leave: "bg-chart-4/15 text-chart-4",
  absent: "bg-destructive/15 text-destructive",
  absent_excused: "bg-chart-3/15 text-chart-3",
  absent_unexcused: "bg-destructive/15 text-destructive",
  weekly_holiday: "bg-chart-2/15 text-chart-2",
  annual_leave: "bg-chart-3/15 text-chart-3",
  sick_leave: "bg-chart-3/15 text-chart-3",
  official_holiday: "bg-chart-2/15 text-chart-2",
  mission: "bg-primary/15 text-primary",
  training: "bg-primary/15 text-primary",
  suspended: "bg-muted text-muted-foreground",
  overtime: "bg-success/15 text-success",
  leave: "bg-chart-3/15 text-chart-3",
  holiday: "bg-chart-2/15 text-chart-2",
  half_day: "bg-chart-4/15 text-chart-4",
};

function AttendancePage() {
  const { tenantId, isAdmin } = useActiveTenant();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const rows = useQuery({
    queryKey: ["attendance", tenantId, date],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.from("attendance").select("*").eq("tenant_id", tenantId!).eq("date", date).order("employee_id");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    enabled: !!tenantId,
  });

  const employees = useQuery({
    queryKey: ["employees-min", tenantId],
    queryFn: async (): Promise<Employee[]> => {
      const { data, error } = await supabase.from("employees").select("id, full_name").eq("tenant_id", tenantId!).eq("status", "active");
      if (error) throw error;
      return (data ?? []) as Employee[];
    },
    enabled: !!tenantId,
  });

  const empName = (id: string) => employees.data?.find((e) => e.id === id)?.full_name ?? "—";

  const create = useMutation({
    mutationFn: async (v: { employee_id: string; date: string; status: string; check_in: string; check_out: string; notes: string }) => {
      let hours = 0;
      if (v.check_in && v.check_out) {
        const [h1, m1] = v.check_in.split(":").map(Number);
        const [h2, m2] = v.check_out.split(":").map(Number);
        hours = Math.max(0, (h2 * 60 + m2 - h1 * 60 - m1) / 60);
      }
      const payload: any = {
        tenant_id: tenantId!, employee_id: v.employee_id, date: v.date, status: v.status,
        check_in: v.check_in ? `${v.date}T${v.check_in}:00` : null,
        check_out: v.check_out ? `${v.date}T${v.check_out}:00` : null,
        hours_worked: hours, notes: v.notes || null,
      };
      const { error } = await supabase.from("attendance").upsert(payload, { onConflict: "employee_id,date" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["attendance", tenantId, date] }); toast.success("تم"); setOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل"),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="سجل الحضور" subtitle={formatDate(date)}
        action={isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="ml-2 h-4 w-4" />تسجيل حضور</Button></DialogTrigger>
            <AttendanceDialog defaultDate={date} employees={employees.data ?? []} onSubmit={(v) => create.mutate(v)} pending={create.isPending} />
          </Dialog>
        )}
      />

      <div className="flex items-center gap-2">
        <Label>التاريخ</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
      </div>

      {rows.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (rows.data ?? []).length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Clock className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">لا يوجد سجل حضور لهذا اليوم</p>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-right">
              <tr>
                <th className="p-3 font-medium">الموظف</th>
                <th className="p-3 font-medium">الحالة</th>
                <th className="p-3 font-medium">دخول</th>
                <th className="p-3 font-medium">خروج</th>
                <th className="p-3 font-medium">ساعات</th>
              </tr>
            </thead>
            <tbody>
              {(rows.data ?? []).map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3">{empName(r.employee_id)}</td>
                  <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-[10px] ${statusColors[r.status]}`}>{statusLabels[r.status]}</span></td>
                  <td className="p-3 text-muted-foreground num">{r.check_in ? new Date(r.check_in).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  <td className="p-3 text-muted-foreground num">{r.check_out ? new Date(r.check_out).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  <td className="p-3 num font-medium">{Number(r.hours_worked).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}
    </div>
  );
}

function AttendanceDialog({ defaultDate, employees, onSubmit, pending }: {
  defaultDate: string; employees: Employee[];
  onSubmit: (v: { employee_id: string; date: string; status: string; check_in: string; check_out: string; notes: string }) => void;
  pending: boolean;
}) {
  const [emp, setEmp] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [status, setStatus] = useState("present");
  const [ci, setCi] = useState("09:00");
  const [co, setCo] = useState("17:00");
  const [notes, setNotes] = useState("");
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>تسجيل حضور</DialogTitle></DialogHeader>
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        if (!emp) { toast.error("اختر موظف"); return; }
        onSubmit({ employee_id: emp, date, status, check_in: ci, check_out: co, notes });
      }}>
        <div className="space-y-2"><Label>الموظف *</Label>
          <Select value={emp} onValueChange={setEmp}>
            <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
            <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label>التاريخ</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-2"><Label>الحالة</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="present">حاضر</SelectItem>
                <SelectItem value="late">متأخر</SelectItem>
                <SelectItem value="early_leave">انصراف مبكر</SelectItem>
                <SelectItem value="overtime">ساعات إضافية</SelectItem>
                <SelectItem value="absent">غائب</SelectItem>
                <SelectItem value="absent_excused">غياب بعذر</SelectItem>
                <SelectItem value="absent_unexcused">غياب بدون عذر</SelectItem>
                <SelectItem value="weekly_holiday">عطلة أسبوعية</SelectItem>
                <SelectItem value="official_holiday">عطلة رسمية</SelectItem>
                <SelectItem value="annual_leave">إجازة سنوية</SelectItem>
                <SelectItem value="sick_leave">إجازة مرضية</SelectItem>
                <SelectItem value="mission">مأمورية</SelectItem>
                <SelectItem value="training">تدريب</SelectItem>
                <SelectItem value="suspended">موقوف</SelectItem>
                <SelectItem value="half_day">نصف يوم</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>الدخول</Label><Input type="time" value={ci} onChange={(e) => setCi(e.target.value)} /></div>
          <div className="space-y-2"><Label>الخروج</Label><Input type="time" value={co} onChange={(e) => setCo(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={pending}>{pending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}