import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Play, Check, DollarSign, Loader2, ChevronDown, ChevronUp, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { formatMoney, formatDate } from "@/lib/format";
import { runMonthlyPayroll, approvePayroll, markPayrollPaid, rejectPayroll } from "@/lib/hr.functions";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/hr/payroll")({
  component: PayrollPage,
});

type Run = { id: string; period_month: number; period_year: number; status: string; total_gross: number; total_net: number; total_bonuses: number; total_deductions: number; approved_at: string | null; paid_at: string | null; created_at: string; rejection_reason?: string | null };
type Item = { id: string; employee_id: string; base_salary: number; bonuses_total: number; deductions_total: number; gross: number; net: number };

const statusLabels: Record<string, string> = { draft: "مسودة", approved: "معتمد", paid: "مدفوع", cancelled: "ملغى", rejected: "مرفوض" };
const statusColors: Record<string, string> = {
  draft: "bg-chart-4/15 text-chart-4", approved: "bg-chart-2/15 text-chart-2",
  paid: "bg-success/15 text-success", cancelled: "bg-muted", rejected: "bg-destructive/15 text-destructive",
};

function PayrollPage() {
  const { tenantId, tenant } = useActiveTenant();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const runsQ = useQuery({
    queryKey: ["payroll-runs", tenantId],
    queryFn: async (): Promise<Run[]> => {
      const { data, error } = await supabase.from("payroll_runs").select("*").eq("tenant_id", tenantId!).order("period_year", { ascending: false }).order("period_month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Run[];
    },
    enabled: !!tenantId,
  });

  const items = useQuery({
    queryKey: ["payroll-items", expanded],
    queryFn: async (): Promise<Item[]> => {
      if (!expanded) return [];
      const { data, error } = await supabase.from("payroll_items").select("*").eq("payroll_run_id", expanded);
      if (error) throw error;
      return (data ?? []) as Item[];
    },
    enabled: !!expanded,
  });

  const employees = useQuery({
    queryKey: ["employees-min", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id, full_name").eq("tenant_id", tenantId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });
  const empName = (id: string) => employees.data?.find((e: any) => e.id === id)?.full_name ?? "—";

  const runFn = useServerFn(runMonthlyPayroll);
  const approveFn = useServerFn(approvePayroll);
  const payFn = useServerFn(markPayrollPaid);
  const rejectFn = useServerFn(rejectPayroll);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const run = useMutation({
    mutationFn: () => runFn({ data: { tenant_id: tenantId!, branch_id: null, month, year } }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["payroll-runs", tenantId] }); toast.success(`تم إنشاء الدورة لـ ${r.employees_count} موظف`); setOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل"),
  });

  const approve = useMutation({
    mutationFn: (id: string) => approveFn({ data: { id, tenant_id: tenantId! } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payroll-runs", tenantId] }); toast.success("تم الاعتماد"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل"),
  });

  const pay = useMutation({
    mutationFn: (id: string) => payFn({ data: { id, tenant_id: tenantId! } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payroll-runs", tenantId] }); toast.success("تم تسجيل الدفع"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل"),
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectFn({ data: { id, tenant_id: tenantId!, reason } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-runs", tenantId] });
      toast.success("تم رفض الدورة — يمكن إعادة تشغيلها");
      setRejecting(null); setRejectReason("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل"),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="الرواتب الشهرية"
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Play className="ml-2 h-4 w-4" />تشغيل دورة</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>تشغيل دورة رواتب جديدة</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>الشهر</Label>
                    <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Array.from({ length: 12 }).map((_, i) => <SelectItem key={i} value={String(i + 1)}>{i + 1}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>السنة</Label>
                    <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">ستُحسب الرواتب لكل الموظفين النشطين وتُطبَّق المكافآت/الحسميات المعلّقة تلقائياً.</p>
              </div>
              <DialogFooter>
                <Button onClick={() => run.mutate()} disabled={run.isPending}>
                  {run.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}تشغيل
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {runsQ.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (runsQ.data ?? []).length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <DollarSign className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">لا توجد دورات رواتب بعد</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {(runsQ.data ?? []).map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <div className="text-lg font-bold">{r.period_month}/{r.period_year}</div>
                    <div className="text-xs text-muted-foreground">أُنشئت {formatDate(r.created_at)}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusColors[r.status]}`}>{statusLabels[r.status]}</span>
                  <div className="mr-auto grid grid-cols-2 gap-x-6 text-sm sm:grid-cols-4">
                    <div><div className="text-xs text-muted-foreground">إجمالي</div><div className="num font-semibold">{formatMoney(r.total_gross)}</div></div>
                    <div><div className="text-xs text-muted-foreground">مكافآت</div><div className="num text-success">+{formatMoney(r.total_bonuses)}</div></div>
                    <div><div className="text-xs text-muted-foreground">حسميات</div><div className="num text-destructive">-{formatMoney(r.total_deductions)}</div></div>
                    <div><div className="text-xs text-muted-foreground">صافي</div><div className="num font-bold text-primary">{formatMoney(r.total_net)} {tenant?.currency}</div></div>
                  </div>
                  <div className="flex gap-2">
                    {r.status === "draft" && (
                      <>
                        <Button size="sm" onClick={() => approve.mutate(r.id)}><Check className="ml-1 h-3 w-3" />اعتماد</Button>
                        <Button size="sm" variant="outline" className="text-destructive" onClick={() => { setRejecting(r.id); setRejectReason(""); }}>
                          <X className="ml-1 h-3 w-3" />رفض
                        </Button>
                      </>
                    )}
                    {r.status === "approved" && <Button size="sm" onClick={() => pay.mutate(r.id)}><DollarSign className="ml-1 h-3 w-3" />تسجيل الدفع</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                      {expanded === r.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                {r.status === "rejected" && r.rejection_reason && (
                  <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                    سبب الرفض: {r.rejection_reason}
                  </div>
                )}
                {expanded === r.id && (
                  <div className="mt-4 border-t pt-3">
                    {items.isLoading ? (
                      <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="text-right text-xs text-muted-foreground">
                          <tr>
                            <th className="p-2 font-medium">الموظف</th>
                            <th className="p-2 font-medium">أساسي</th>
                            <th className="p-2 font-medium">مكافآت</th>
                            <th className="p-2 font-medium">حسميات</th>
                            <th className="p-2 font-medium">إجمالي</th>
                            <th className="p-2 font-medium">صافي</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(items.data ?? []).map((it) => (
                            <tr key={it.id} className="border-t">
                              <td className="p-2">{empName(it.employee_id)}</td>
                              <td className="p-2 num">{formatMoney(it.base_salary)}</td>
                              <td className="p-2 num text-success">+{formatMoney(it.bonuses_total)}</td>
                              <td className="p-2 num text-destructive">-{formatMoney(it.deductions_total)}</td>
                              <td className="p-2 num">{formatMoney(it.gross)}</td>
                              <td className="p-2 num font-bold text-primary">{formatMoney(it.net)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!rejecting} onOpenChange={(v) => { if (!v) { setRejecting(null); setRejectReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>رفض دورة الرواتب</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>سبب الرفض *</Label>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder="اذكر سبب الرفض ليتمكن الفريق من التعديل وإعادة الاحتساب" />
            <p className="text-xs text-muted-foreground">سيتم حذف بنود الدورة وإتاحة المكافآت/الحسميات لإعادة التشغيل.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>إلغاء</Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={reject.isPending || rejectReason.trim().length < 3}
              onClick={() => rejecting && reject.mutate({ id: rejecting, reason: rejectReason.trim() })}
            >
              {reject.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}تأكيد الرفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}