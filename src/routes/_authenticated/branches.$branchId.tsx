import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2, Users, Receipt, Wallet, Package, Printer, ArrowRight, CalendarDays, Clock } from "lucide-react";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/branches/$branchId")({ component: BranchDetailsPage });

function esc(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function BranchDetailsPage() {
  const { branchId } = useParams({ from: "/_authenticated/branches/$branchId" });
  const { tenantId } = useActiveTenant();
  const query = useQuery({
    queryKey: ["branch-drilldown", tenantId, branchId],
    queryFn: async () => {
      const { data: branch, error } = await supabase.from("branches").select("id,name,company_id,image_url,logo_url,address,phone,tax_number,currency,is_active,working_hours,description").eq("id", branchId).eq("tenant_id", tenantId!).single();
      if (error) throw error;
      const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const [company, sales, expenses, inventory, employees, attendance, sessions] = await Promise.all([
        branch.company_id ? supabase.from("companies").select("id,name,logo_url").eq("id", branch.company_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
        supabase.from("sales").select("id,total,status,created_at").eq("tenant_id", tenantId!).eq("branch_id", branchId).gte("created_at", start).neq("status", "void"),
        supabase.from("expenses").select("amount,paid_at").eq("tenant_id", tenantId!).eq("branch_id", branchId).gte("paid_at", start.slice(0, 10)),
        supabase.from("inventory").select("quantity").eq("tenant_id", tenantId!).eq("branch_id", branchId),
        supabase.from("employees").select("id,status").eq("tenant_id", tenantId!).eq("branch_id", branchId),
        supabase.from("attendance").select("id,employee_id,date,status").eq("tenant_id", tenantId!).gte("date", start.slice(0, 10)),
        supabase.from("cash_sessions").select("id,status,opened_at,closed_at,cash_difference").eq("tenant_id", tenantId!).eq("branch_id", branchId).gte("opened_at", start),
      ]);
      for (const result of [company, sales, expenses, inventory, employees, attendance, sessions]) if (result.error) throw result.error;
      const saleRows = sales.data ?? [];
      return {
        branch, company: company.data,
        salesTotal: saleRows.reduce((sum, row) => sum + Number(row.total ?? 0), 0),
        salesCount: saleRows.length,
        expensesTotal: (expenses.data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
        stockUnits: (inventory.data ?? []).reduce((sum, row) => sum + Number(row.quantity ?? 0), 0),
        employeesCount: (employees.data ?? []).filter((row) => row.status === "active").length,
        attendanceCount: (attendance.data ?? []).filter((row) => (employees.data ?? []).some((employee) => employee.id === row.employee_id)).length,
        sessionsCount: (sessions.data ?? []).length,
        openSessions: (sessions.data ?? []).filter((row) => row.status === "open").length,
      };
    },
    enabled: !!tenantId && !!branchId,
  });
  const platform = useQuery({
    queryKey: ["platform-branding"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("platform_branding" as any) as any).select("brand_name,phone,promotional_text,website_url,enabled").eq("id", true).maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
  const print = () => {
    if (!query.data) return;
    const d = query.data;
    const footer = platform.data?.enabled ? "<footer><b>" + esc(platform.data.brand_name) + "</b><br>" + esc(platform.data.promotional_text) + "<br>" + esc(platform.data.phone) + " " + esc(platform.data.website_url) + "</footer>" : "";
    const w = window.open("", "_blank", "width=900,height=750");
    if (!w) return;
    w.document.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>' + esc(d.branch.name) + '</title><style>body{font-family:Arial;padding:28px;color:#172033}header{display:flex;gap:16px;align-items:center;border-bottom:2px solid #222;padding-bottom:14px}header img{width:80px;height:80px;object-fit:contain}h1{margin:0 0 6px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:22px}.box{border:1px solid #bbb;padding:12px;border-radius:8px}.label{font-size:12px;color:#555}.value{font-size:20px;font-weight:bold;margin-top:6px}footer{margin-top:30px;padding-top:12px;border-top:1px solid #bbb;text-align:center;color:#666;font-size:12px}</style></head><body><header>' + (d.branch.logo_url || d.branch.image_url ? '<img src="' + esc(d.branch.logo_url || d.branch.image_url) + '">' : '') + '<div><h1>' + esc(d.branch.name) + '</h1><div>' + esc(d.company?.name ?? '') + '</div><div>' + esc(d.branch.address) + ' — ' + esc(d.branch.phone) + '</div><small>كشف أداء الفرع للشهر الحالي</small></div></header><div class="grid">' + [
      ["المبيعات", formatMoney(d.salesTotal)], ["عدد الفواتير", d.salesCount], ["المصروفات", formatMoney(d.expensesTotal)],
      ["الموظفون النشطون", d.employeesCount], ["وحدات المخزون", d.stockUnits], ["سجلات الحضور", d.attendanceCount],
      ["الورديات", d.sessionsCount], ["الورديات المفتوحة", d.openSessions],
    ].map((item) => '<div class="box"><div class="label">' + esc(item[0]) + '</div><div class="value">' + esc(item[1]) + '</div></div>').join("") + '</div>' + footer + '<script>window.onload=()=>window.print()</script></body></html>');
    w.document.close();
  };
  if (query.isLoading) return <Loader2 className="mx-auto my-12 h-6 w-6 animate-spin" />;
  if (query.isError || !query.data) return <Card><CardContent className="p-6 text-destructive">تعذر تحميل تفاصيل الفرع أو لا تملك صلاحية الوصول إليه.</CardContent></Card>;
  const d = query.data;
  return <div className="space-y-6">
    <PageHeader title={d.branch.name} subtitle="لوحة تفاصيل الفرع وأداؤه التشغيلي والمالي" action={<div className="flex gap-2"><Button variant="outline" onClick={print}><Printer className="ml-2 h-4 w-4" />طباعة كشف الفرع</Button>{d.company && <Button variant="ghost" asChild><a href={"/companies/" + d.company.id}><ArrowRight className="ml-2 h-4 w-4" />الشركة</a></Button>}</div>} />
    <Card><CardContent className="flex flex-wrap items-center gap-4 p-4">
      {(d.branch.logo_url || d.branch.image_url) && <img src={d.branch.logo_url || d.branch.image_url || ""} alt={d.branch.name} className="h-16 w-16 rounded-lg object-contain" />}
      <div className="min-w-0 flex-1"><div className="text-lg font-bold">{d.branch.name}</div><div className="text-sm text-muted-foreground">{d.company?.name ?? "شركة غير محددة"}</div><div className="text-xs text-muted-foreground">{d.branch.address ?? "—"} · {d.branch.phone ?? "—"}</div></div>
      <Badge variant={d.branch.is_active ? "default" : "secondary"}>{d.branch.is_active ? "نشط" : "متوقف"}</Badge>
    </CardContent></Card>
    <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
      <Metric icon={<Receipt />} label="مبيعات الشهر" value={formatMoney(d.salesTotal)} />
      <Metric icon={<Wallet />} label="مصروفات الشهر" value={formatMoney(d.expensesTotal)} />
      <Metric icon={<Users />} label="الموظفون النشطون" value={String(d.employeesCount)} />
      <Metric icon={<Package />} label="وحدات المخزون" value={String(d.stockUnits)} />
      <Metric icon={<CalendarDays />} label="سجلات الحضور" value={String(d.attendanceCount)} />
      <Metric icon={<Receipt />} label="عدد الفواتير" value={String(d.salesCount)} />
      <Metric icon={<Clock />} label="الورديات" value={String(d.sessionsCount)} />
      <Metric icon={<Clock />} label="الورديات المفتوحة" value={String(d.openSessions)} />
    </div>
    <div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link to="/hr/employees">الموظفون</Link></Button><Button variant="outline" asChild><Link to="/hr/attendance">الحضور والانصراف</Link></Button><Button variant="outline" asChild><Link to="/reports">التقارير</Link></Button><Button variant="outline" asChild><Link to="/inventory">المخزون</Link></Button></div>
  </div>;
}
function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div><div className="min-w-0"><div className="text-xs text-muted-foreground">{label}</div><div className="truncate text-lg font-bold">{value}</div></div></CardContent></Card>;
}
