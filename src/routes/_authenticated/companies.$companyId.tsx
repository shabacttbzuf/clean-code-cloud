import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2, Users, Receipt, Wallet, Package, Printer, ArrowRight, CalendarDays } from "lucide-react";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/companies/$companyId")({ component: CompanyDetailsPage });

type BranchSummary = {
  id: string; name: string; image_url: string | null; logo_url: string | null;
  address: string | null; phone: string | null; is_active: boolean; currency: string;
  sales: number; salesCount: number; expenses: number; employees: number;
  attendance: number; stockUnits: number;
};

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function CompanyDetailsPage() {
  const { companyId } = useParams({ from: "/_authenticated/companies/$companyId" });
  const { tenantId, tenant, isSuperOwner, hasPermission } = useActiveTenant();
  const canPrintCompany = isSuperOwner || hasPermission("companies.print");
  const query = useQuery({
    queryKey: ["company-drilldown", tenantId, companyId],
    queryFn: async () => {
      const { data: company, error: companyError } = await supabase.from("companies").select("id,name,legal_name,logo_url,tax_number,description").eq("id", companyId).eq("tenant_id", tenantId!).single();
      if (companyError) throw companyError;
      const { data: branches, error: branchError } = await supabase.from("branches").select("id,name,image_url,logo_url,address,phone,is_active,currency").eq("tenant_id", tenantId!).eq("company_id", companyId).order("name");
      if (branchError) throw branchError;
      const branchIds = (branches ?? []).map((b) => b.id);
      if (!branchIds.length) return { company, branches: [] as BranchSummary[] };
      const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const [sales, expenses, employees, attendance, inventory] = await Promise.all([
        supabase.from("sales").select("id,total,branch_id,status,created_at").eq("tenant_id", tenantId!).in("branch_id", branchIds).gte("created_at", start).neq("status", "void"),
        supabase.from("expenses").select("amount,branch_id,paid_at").eq("tenant_id", tenantId!).in("branch_id", branchIds).gte("paid_at", start.slice(0, 10)),
        supabase.from("employees").select("id,branch_id,status").eq("tenant_id", tenantId!).in("branch_id", branchIds),
        supabase.from("attendance").select("id,employee_id,date").eq("tenant_id", tenantId!).in("branch_id", branchIds).gte("date", start.slice(0, 10)),
        supabase.from("inventory").select("quantity,branch_id").eq("tenant_id", tenantId!).in("branch_id", branchIds),
      ]);
      for (const result of [sales, expenses, employees, attendance, inventory]) if (result.error) throw result.error;
      const summaries: BranchSummary[] = (branches ?? []).map((b) => {
        const branchSales = (sales.data ?? []).filter((r) => r.branch_id === b.id);
        return {
          ...b,
          sales: branchSales.reduce((sum, row) => sum + Number(row.total ?? 0), 0),
          salesCount: branchSales.length,
          expenses: (expenses.data ?? []).filter((r) => r.branch_id === b.id).reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
          employees: (employees.data ?? []).filter((r) => r.branch_id === b.id && r.status === "active").length,
          attendance: (attendance.data ?? []).filter((r) => (employees.data ?? []).some((employee) => employee.branch_id === b.id && employee.id === r.employee_id)).length,
          stockUnits: (inventory.data ?? []).filter((r) => r.branch_id === b.id).reduce((sum, row) => sum + Number(row.quantity ?? 0), 0),
        };
      });
      return { company, branches: summaries };
    },
    enabled: !!tenantId && !!companyId,
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

  const printReport = () => {
    if (!canPrintCompany) return;
    if (!query.data) return;
    const company = query.data.company;
    const rows = query.data.branches.map((b) => `<tr><td>${escapeHtml(b.name)}</td><td>${b.is_active ? "نشط" : "متوقف"}</td><td>${b.employees}</td><td>${b.salesCount}</td><td>${escapeHtml(formatMoney(b.sales))}</td><td>${escapeHtml(formatMoney(b.expenses))}</td><td>${b.attendance}</td><td>${b.stockUnits}</td></tr>`).join("");
    const brand = platform.data?.enabled ? `<footer><b>${escapeHtml(platform.data.brand_name)}</b><br>${escapeHtml(platform.data.promotional_text)}<br>${escapeHtml(platform.data.phone)} ${escapeHtml(platform.data.website_url)}</footer>` : "";
    const w = window.open("", "_blank", "width=1000,height=800");
    if (!w) return;
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>كشف الشركة - ${escapeHtml(company.name)}</title><style>body{font-family:Arial,sans-serif;padding:28px;color:#172033}header{display:flex;align-items:center;gap:16px;border-bottom:2px solid #222;padding-bottom:16px}header img{width:76px;height:76px;object-fit:contain}h1{margin:0 0 6px;font-size:23px}small{color:#555}.meta{margin:18px 0;display:flex;justify-content:space-between}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #bbb;padding:9px;text-align:right}th{background:#eee}footer{margin-top:30px;border-top:1px solid #bbb;padding-top:12px;text-align:center;font-size:12px;color:#555}@media print{button{display:none}}</style></head><body><header>${company.logo_url ? `<img src="${escapeHtml(company.logo_url)}">` : ""}<div><h1>${escapeHtml(company.name)}</h1><div>${escapeHtml(company.legal_name || "")}</div><small>كشف إداري ومالي لفروع الشركة</small></div></header><div class="meta"><span>الفترة: من بداية الشهر حتى اليوم</span><span>تاريخ الطباعة: ${new Date().toLocaleString("ar-YE")}</span></div><table><thead><tr><th>الفرع</th><th>الحالة</th><th>الموظفون</th><th>الفواتير</th><th>المبيعات</th><th>المصروفات</th><th>سجلات الحضور</th><th>وحدات المخزون</th></tr></thead><tbody>${rows || '<tr><td colspan="8">لا توجد فروع مسجلة</td></tr>'}</tbody></table>${brand}<script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  if (query.isLoading) return <Loader2 className="mx-auto my-12 h-6 w-6 animate-spin" />;
  if (query.isError || !query.data) return <div className="space-y-4"><PageHeader title="تفاصيل الشركة" /><Card><CardContent className="p-6 text-destructive">تعذر تحميل بيانات الشركة أو لا تملك صلاحية الوصول إليها.</CardContent></Card></div>;
  const { company, branches } = query.data;
  const totals = branches.reduce((acc, b) => ({ sales: acc.sales + b.sales, expenses: acc.expenses + b.expenses, employees: acc.employees + b.employees, invoices: acc.invoices + b.salesCount }), { sales: 0, expenses: 0, employees: 0, invoices: 0 });
  return <div className="space-y-6">
    <PageHeader title={company.name} subtitle="تفاصيل الشركة وأداء كل فرع على حدة" action={<div className="flex gap-2">{canPrintCompany && <Button variant="outline" onClick={printReport}><Printer className="ml-2 h-4 w-4" />طباعة كشف الشركة</Button>}<Button variant="ghost" asChild><Link to="/companies"><ArrowRight className="ml-2 h-4 w-4" />الشركات</Link></Button></div>} />
    <Card><CardContent className="flex flex-wrap items-center gap-4 p-4">
      {company.logo_url && <img src={company.logo_url} alt={company.name} className="h-16 w-16 rounded-lg object-contain" />}
      <div className="min-w-0 flex-1"><div className="text-lg font-bold">{company.name}</div>{company.legal_name && <div className="text-sm text-muted-foreground">{company.legal_name}</div>}{company.tax_number && <div className="text-xs text-muted-foreground" dir="ltr">{company.tax_number}</div>}</div>
      <Badge>{branches.length} فرع</Badge>
    </CardContent></Card>
    <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
      <Metric icon={<Receipt />} label="مبيعات الشهر" value={formatMoney(totals.sales)} />
      <Metric icon={<Wallet />} label="مصروفات الشهر" value={formatMoney(totals.expenses)} />
      <Metric icon={<Users />} label="الموظفون النشطون" value={String(totals.employees)} />
      <Metric icon={<CalendarDays />} label="فواتير الشهر" value={String(totals.invoices)} />
    </div>
    <div className="flex items-center justify-between"><h2 className="text-lg font-bold">الفروع التابعة للشركة</h2><span className="text-xs text-muted-foreground">تظهر فقط الفروع التي تملك صلاحية رؤيتها</span></div>
    <div className="grid gap-4 md:grid-cols-2">
      {branches.map((b) => <Card key={b.id} className="overflow-hidden">
        {b.image_url && <img src={b.image_url} alt={b.name} className="h-36 w-full object-cover" />}
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-2"><div className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /><div><div className="font-semibold">{b.name}</div><div className="text-xs text-muted-foreground">{b.address || "—"} {b.phone || ""}</div></div></div><Badge variant={b.is_active ? "default" : "secondary"}>{b.is_active ? "نشط" : "متوقف"}</Badge></div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Mini icon={<Receipt />} label="المبيعات" value={formatMoney(b.sales)} />
            <Mini icon={<Wallet />} label="المصروفات" value={formatMoney(b.expenses)} />
            <Mini icon={<Users />} label="الموظفون" value={String(b.employees)} />
            <Mini icon={<Package />} label="وحدات المخزون" value={String(b.stockUnits)} />
            <Mini icon={<CalendarDays />} label="سجلات الحضور" value={String(b.attendance)} />
            <Mini icon={<Receipt />} label="الفواتير" value={String(b.salesCount)} />
          </div>
        </CardContent>
      </Card>)}
      {!branches.length && <Card><CardContent className="p-8 text-center text-muted-foreground">لا توجد فروع مرتبطة بهذه الشركة حتى الآن.</CardContent></Card>}
    </div>
  </div>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div><div className="min-w-0"><div className="text-xs text-muted-foreground">{label}</div><div className="truncate text-lg font-bold">{value}</div></div></CardContent></Card>;
}
function Mini({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex items-center justify-between rounded-md bg-muted/40 p-2"><span className="flex items-center gap-1 text-xs text-muted-foreground">{icon}{label}</span><b className="text-sm">{value}</b></div>;
}
