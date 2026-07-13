import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2, Loader2, Gift, MinusCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { formatMoney, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/hr/compensation")({
  component: CompensationPage,
});

type Row = { id: string; employee_id: string; amount: number; reason: string | null; applied_date: string; payroll_item_id: string | null; bonus_type?: string; deduction_type?: string };
type Employee = { id: string; full_name: string };

function CompensationPage() {
  const { tenantId, tenant, isAdmin } = useActiveTenant();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"bonuses" | "deductions">("bonuses");
  const [open, setOpen] = useState(false);

  const employees = useQuery({
    queryKey: ["employees-min", tenantId],
    queryFn: async (): Promise<Employee[]> => {
      const { data, error } = await supabase.from("employees").select("id, full_name").eq("tenant_id", tenantId!).eq("status", "active");
      if (error) throw error;
      return (data ?? []) as Employee[];
    },
    enabled: !!tenantId,
  });

  const bonuses = useQuery({
    queryKey: ["bonuses", tenantId],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.from("bonuses").select("*").eq("tenant_id", tenantId!).order("applied_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    enabled: !!tenantId,
  });
  const deductions = useQuery({
    queryKey: ["deductions", tenantId],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.from("deductions").select("*").eq("tenant_id", tenantId!).order("applied_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    enabled: !!tenantId,
  });

  const empName = (id: string) => employees.data?.find((e) => e.id === id)?.full_name ?? "—";
  const table = tab === "bonuses" ? "bonuses" : "deductions";
  const list = (tab === "bonuses" ? bonuses.data : deductions.data) ?? [];

  const create = useMutation({
    mutationFn: async (v: { employee_id: string; amount: number; reason: string; type: string; date: string }) => {
      const payload: any = {
        tenant_id: tenantId!, employee_id: v.employee_id, amount: v.amount,
        reason: v.reason || null, applied_date: v.date,
        [tab === "bonuses" ? "bonus_type" : "deduction_type"]: v.type,
      };
      const { error } = await supabase.from(table).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [table, tenantId] }); toast.success("تم"); setOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [table, tenantId] }); toast.success("تم الحذف"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل"),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="المكافآت والحسميات" subtitle="تُطبَّق تلقائياً على دورة الرواتب"
        action={isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="ml-2 h-4 w-4" />إضافة</Button></DialogTrigger>
            <CompDialog kind={tab} employees={employees.data ?? []} onSubmit={(v) => create.mutate(v)} pending={create.isPending} />
          </Dialog>
        )}
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="bonuses"><Gift className="ml-2 h-4 w-4" />مكافآت</TabsTrigger>
          <TabsTrigger value="deductions"><MinusCircle className="ml-2 h-4 w-4" />حسميات</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          {list.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">لا يوجد سجلات</CardContent></Card>
          ) : (
            <Card><CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-right">
                  <tr>
                    <th className="p-3 font-medium">الموظف</th>
                    <th className="p-3 font-medium">المبلغ</th>
                    <th className="p-3 font-medium">النوع</th>
                    <th className="p-3 font-medium">السبب</th>
                    <th className="p-3 font-medium">التاريخ</th>
                    <th className="p-3 font-medium">الحالة</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-3">{empName(r.employee_id)}</td>
                      <td className={`p-3 num font-semibold ${tab === "bonuses" ? "text-success" : "text-destructive"}`}>
                        {tab === "bonuses" ? "+" : "-"}{formatMoney(r.amount)} {tenant?.currency}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{(r as any)[tab === "bonuses" ? "bonus_type" : "deduction_type"]}</td>
                      <td className="p-3 text-xs text-muted-foreground">{r.reason ?? "—"}</td>
                      <td className="p-3 text-xs">{formatDate(r.applied_date)}</td>
                      <td className="p-3">
                        {r.payroll_item_id
                          ? <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] text-success">في راتب</span>
                          : <span className="rounded-full bg-chart-4/15 px-2 py-0.5 text-[10px] text-chart-4">معلّق</span>}
                      </td>
                      <td className="p-3">
                        {isAdmin && !r.payroll_item_id && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => { if (confirm("حذف؟")) del.mutate(r.id); }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CompDialog({ kind, employees, onSubmit, pending }: {
  kind: "bonuses" | "deductions"; employees: Employee[];
  onSubmit: (v: { employee_id: string; amount: number; reason: string; type: string; date: string }) => void;
  pending: boolean;
}) {
  const [emp, setEmp] = useState("");
  const [amount, setAmount] = useState("0");
  const [reason, setReason] = useState("");
  const [type, setType] = useState(kind === "bonuses" ? "performance" : "absence");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const bonusTypes = [["performance", "أداء"], ["eid", "عيد"], ["annual", "سنوية"], ["overtime", "إضافي"], ["other", "أخرى"]];
  const dedTypes = [["absence", "غياب"], ["late", "تأخير"], ["advance", "سلفة"], ["insurance", "تأمين"], ["loan", "قرض"], ["other", "أخرى"]];
  const opts = kind === "bonuses" ? bonusTypes : dedTypes;
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{kind === "bonuses" ? "مكافأة" : "حسم"} جديد</DialogTitle></DialogHeader>
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        if (!emp) { toast.error("اختر موظف"); return; }
        const a = Number(amount); if (!a || a <= 0) { toast.error("مبلغ غير صحيح"); return; }
        onSubmit({ employee_id: emp, amount: a, reason, type, date });
      }}>
        <div className="space-y-2"><Label>الموظف *</Label>
          <Select value={emp} onValueChange={setEmp}>
            <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
            <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label>المبلغ</Label><Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="space-y-2"><Label>النوع</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{opts.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2"><Label>السبب</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <div className="space-y-2"><Label>التاريخ</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <DialogFooter>
          <Button type="submit" disabled={pending}>{pending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}