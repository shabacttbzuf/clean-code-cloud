import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileText, Download, Calendar, TrendingUp, Wallet, Package, Users, Printer } from "lucide-react";
import { formatMoney, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { buildCsv, calculatePercentChange, calculateProfitMetrics, fetchAllRows } from "@/lib/report-analytics";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

function localDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function ReportsPage() {
  const { tenantId, tenant, userId, membership, isSuperOwner } = useActiveTenant();
  const permissionsQuery = useQuery({
    queryKey: ["reports-permissions", tenantId, userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_permissions", { _tenant_id: tenantId! });
      if (error) throw error;
      return new Set<string>((data ?? []) as string[]);
    },
    enabled: !!tenantId && !!userId,
    staleTime: 15_000,
  });
  const canExportReports = permissionsQuery.data?.has("reports.export") === true;
  const canPrintReports = permissionsQuery.data?.has("reports.print") === true;
  const canFilterReports = permissionsQuery.data?.has("reports.filter") === true;
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return localDateKey(d);
  });
  const [to, setTo] = useState(() => localDateKey(new Date()));
  const [groupBy, setGroupBy] = useState<"day" | "month" | "year">("day");
  const [branchId, setBranchId] = useState("all");
  const branchesQuery = useQuery({ queryKey: ["report-branches", tenantId, membership?.company_id, membership?.branch_id, isSuperOwner],
    queryFn: async () => {
      let query = supabase.from("branches").select("id,name").eq("tenant_id", tenantId!).order("name");
      if (!isSuperOwner && membership?.branch_id) query = query.eq("id", membership.branch_id);
      else if (!isSuperOwner && membership?.company_id) query = query.eq("company_id", membership.company_id);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    }, enabled: !!tenantId });

  useEffect(() => {
    if (branchId !== "all" && branchesQuery.data && !branchesQuery.data.some((branch) => branch.id === branchId)) {
      setBranchId("all");
    }
  }, [branchId, branchesQuery.data]);

  const report = useQuery({
    queryKey: ["reports", tenantId, membership?.company_id, membership?.branch_id, isSuperOwner, from, to, branchId],
    queryFn: async () => {
      if (!tenantId) return null;
      if (!from || !to) throw new Error("حدد تاريخ البداية والنهاية للتقرير.");
      if (from > to) throw new Error("تاريخ البداية يجب أن يسبق تاريخ النهاية أو يساويه.");
      // Interpret date inputs as local calendar days, then convert boundaries for timestamptz queries.
      const localStart = new Date(`${from}T00:00:00`);
      const localEnd = new Date(`${to}T23:59:59.999`);
      if (Number.isNaN(localStart.getTime()) || Number.isNaN(localEnd.getTime())) {
        throw new Error("صيغة التاريخ المحدد غير صحيحة.");
      }
      const fromDate = localStart.toISOString();
      const toDate = localEnd.toISOString();

      const [sales, expenses, items, sessions, inventory, refunds] = await Promise.all([
        fetchAllRows((pageFrom, pageTo) => {
          let query = supabase.from("sales")
            .select("id, created_at, total, subtotal, discount, tax_amount, payment_method, cashier_id, branch_id, status")
            .eq("tenant_id", tenantId).neq("status", "void")
            .gte("created_at", fromDate).lte("created_at", toDate);
          if (branchId !== "all") query = query.eq("branch_id", branchId);
          return query.order("created_at", { ascending: false }).range(pageFrom, pageTo);
        }),
        fetchAllRows((pageFrom, pageTo) => {
          let query = supabase.from("expenses")
            .select("id, paid_at, amount, category_id, description, branch_id")
            .eq("tenant_id", tenantId).gte("paid_at", from).lte("paid_at", to);
          if (branchId !== "all") query = query.eq("branch_id", branchId);
          return query.order("paid_at", { ascending: false }).range(pageFrom, pageTo);
        }),
        fetchAllRows((pageFrom, pageTo) => supabase.from("sale_items")
          .select("product_name, quantity, line_total, sale_id, created_at, cost_price_snapshot")
          .eq("tenant_id", tenantId).gte("created_at", fromDate).lte("created_at", toDate)
          .range(pageFrom, pageTo)),
        fetchAllRows((pageFrom, pageTo) => {
          let query = supabase.from("cash_sessions")
            .select("cashier_id, opening_balance, closing_balance, expected_cash, cash_difference, opened_at, closed_at, status, branch_id")
            .eq("tenant_id", tenantId).gte("opened_at", fromDate).lte("opened_at", toDate);
          if (branchId !== "all") query = query.eq("branch_id", branchId);
          return query.range(pageFrom, pageTo);
        }),
        fetchAllRows((pageFrom, pageTo) => {
          let query = supabase.from("inventory")
            .select("quantity, product_id, branch_id").eq("tenant_id", tenantId);
          if (branchId !== "all") query = query.eq("branch_id", branchId);
          return query.range(pageFrom, pageTo);
        }),
        fetchAllRows((pageFrom, pageTo) => {
          let query = supabase.from("sale_refunds")
            .select("id, sale_id, subtotal, discount, tax_amount, total, refund_method, created_at, branch_id")
            .eq("tenant_id", tenantId).gte("created_at", fromDate).lte("created_at", toDate);
          if (branchId !== "all") query = query.eq("branch_id", branchId);
          return query.range(pageFrom, pageTo);
        }),
      ]);

      const validSales = sales.filter((row) => row.status !== "void");
      const saleIds = new Set(validSales.map((sale) => sale.id));
      const validItems = items.filter((item) => saleIds.has(item.sale_id));
      const refundIds = refunds.map((refund) => refund.id);
      const refundItemGroups = await Promise.all(
        Array.from({ length: Math.ceil(refundIds.length / 100) }, (_, index) => refundIds.slice(index * 100, (index + 1) * 100))
          .map((ids) => fetchAllRows((pageFrom, pageTo) => supabase.from("sale_refund_items")
            .select("refund_id, product_name, quantity, subtotal_amount, discount_amount, tax_amount, restocked, cost_price_snapshot")
            .in("refund_id", ids).range(pageFrom, pageTo))),
      );
      const refundItems = refundItemGroups.flat();

      const inventoryProductIds = [...new Set(inventory.map((row) => row.product_id))];
      const productGroups = await Promise.all(
        Array.from({ length: Math.ceil(inventoryProductIds.length / 100) }, (_, index) => inventoryProductIds.slice(index * 100, (index + 1) * 100))
          .map((ids) => fetchAllRows((pageFrom, pageTo) => supabase.from("products")
            .select("id, name, sku, cost_price, min_stock").eq("tenant_id", tenantId)
            .in("id", ids).range(pageFrom, pageTo))),
      );
      const inventoryProducts = productGroups.flat();

      const periodStart = localStart.getTime();
      const periodEnd = localEnd.getTime();
      const periodLength = periodEnd - periodStart + 1;
      const previousFromDate = new Date(periodStart - periodLength);
      const previousToDate = new Date(periodStart - 1);
      const previousFrom = previousFromDate.toISOString();
      const previousTo = previousToDate.toISOString();
      const asLocalDate = (date: Date) => [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-");
      const previousFromDay = asLocalDate(previousFromDate);
      const previousToDay = asLocalDate(previousToDate);
      const [previousSales, previousExpenses, previousRefunds] = await Promise.all([
        fetchAllRows((pageFrom, pageTo) => {
          let query = supabase.from("sales").select("id,total")
            .eq("tenant_id", tenantId).neq("status", "void")
            .gte("created_at", previousFrom).lte("created_at", previousTo);
          if (branchId !== "all") query = query.eq("branch_id", branchId);
          return query.range(pageFrom, pageTo);
        }),
        fetchAllRows((pageFrom, pageTo) => {
          let query = supabase.from("expenses").select("amount")
            .eq("tenant_id", tenantId)
            .gte("paid_at", previousFromDay).lte("paid_at", previousToDay);
          if (branchId !== "all") query = query.eq("branch_id", branchId);
          return query.range(pageFrom, pageTo);
        }),
        fetchAllRows((pageFrom, pageTo) => {
          let query = supabase.from("sale_refunds").select("total")
            .eq("tenant_id", tenantId)
            .gte("created_at", previousFrom).lte("created_at", previousTo);
          if (branchId !== "all") query = query.eq("branch_id", branchId);
          return query.range(pageFrom, pageTo);
        }),
      ]);
      const previousPeriod = {
        salesTotal: previousSales.reduce((sum, row) => sum + Number(row.total), 0)
          - previousRefunds.reduce((sum, row) => sum + Number(row.total), 0),
        expensesTotal: previousExpenses.reduce((sum, row) => sum + Number(row.amount), 0),
        invoiceCount: previousSales.length,
      };

      return {
        sales: validSales,
        expenses,
        items: validItems,
        sessions,
        inventory,
        inventoryProducts,
        refunds,
        refundItems,
        previousPeriod,
      };
    },
    enabled: !!tenantId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const data = report.data;
  const safe = useMemo(() => {
    const raw = data ?? { sales: [] as any[], expenses: [] as any[], items: [] as any[], sessions: [] as any[], inventory: [] as any[], inventoryProducts: [] as any[], refunds: [] as any[], refundItems: [] as any[] };
    if (branchId === "all") return raw;
    const sales = raw.sales.filter((row: any) => row.branch_id === branchId);
    const refunds = raw.refunds.filter((row: any) => row.branch_id === branchId);
    const saleIds = new Set(sales.map((row: any) => row.id));
    const refundIds = new Set(refunds.map((row: any) => row.id));
    return {
      ...raw,
      sales,
      refunds,
      expenses: raw.expenses.filter((row: any) => row.branch_id === branchId),
      sessions: raw.sessions.filter((row: any) => row.branch_id === branchId),
      inventory: raw.inventory.filter((row: any) => row.branch_id === branchId),
      items: raw.items.filter((row: any) => saleIds.has(row.sale_id)),
      refundItems: raw.refundItems.filter((row: any) => refundIds.has(row.refund_id)),
    };
  }, [data, branchId]);

  const profitMetrics = useMemo(() => calculateProfitMetrics({
    sales: safe.sales,
    refunds: safe.refunds,
    saleItems: safe.items,
    refundItems: safe.refundItems,
    expenses: safe.expenses,
  }), [safe]);

  const inventoryRows = useMemo(() => {
    const products = new Map((safe.inventoryProducts ?? []).map((product: any) => [product.id, product]));
    const branches = new Map((branchesQuery.data ?? []).map((branch) => [branch.id, branch.name]));
    return safe.inventory.map((row: any) => {
      const product = products.get(row.product_id);
      return product ? {
        productId: row.product_id,
        productName: product.name,
        sku: product.sku,
        branchId: row.branch_id,
        branchName: branches.get(row.branch_id) ?? "—",
        quantity: Number(row.quantity),
        minimum: Number(product.min_stock ?? 0),
        costPrice: Number(product.cost_price ?? 0),
        estimatedValue: Number(row.quantity) * Number(product.cost_price ?? 0),
      } : null;
    }).filter((row: any): row is NonNullable<typeof row> => row !== null)
      .sort((a: any, b: any) => (a.quantity - a.minimum) - (b.quantity - b.minimum));
  }, [safe.inventory, safe.inventoryProducts, branchesQuery.data]);

  const lowStockRows = useMemo(
    () => inventoryRows.filter((row: any) => row.quantity <= row.minimum),
    [inventoryRows],
  );
  const inventoryValue = useMemo(
    () => inventoryRows.reduce((sum: number, row: any) => sum + row.estimatedValue, 0),
    [inventoryRows],
  );

  const totals = useMemo(() => {
    const grossSalesTotal = safe.sales.reduce((s: number, r: any) => s + Number(r.total), 0);
    const refundsTotal = safe.refunds.reduce((s: number, r: any) => s + Number(r.total), 0);
    const salesTotal = grossSalesTotal - refundsTotal;
    const expensesTotal = safe.expenses.reduce((s: number, e: any) => s + Number(e.amount), 0);
    const discountTotal = safe.sales.reduce((s: number, r: any) => s + Number(r.discount), 0)
      - safe.refunds.reduce((s: number, r: any) => s + Number(r.discount), 0);
    const taxTotal = safe.sales.reduce((s: number, r: any) => s + Number(r.tax_amount), 0)
      - safe.refunds.reduce((s: number, r: any) => s + Number(r.tax_amount), 0);
    const net = salesTotal - expensesTotal;
    return { salesTotal, grossSalesTotal, refundsTotal, expensesTotal, discountTotal, taxTotal, net };
  }, [safe]);

  const comparison = {
    sales: calculatePercentChange(totals.salesTotal, data?.previousPeriod.salesTotal ?? 0),
    expenses: calculatePercentChange(totals.expensesTotal, data?.previousPeriod.expensesTotal ?? 0),
    invoices: calculatePercentChange(safe.sales.length, data?.previousPeriod.invoiceCount ?? 0),
  };

  const groupedSales = useMemo(() => {
    const map = new Map<string, { label: string; sales: number; count: number; expenses: number }>();
    const fmt = (d: Date) => {
      if (groupBy === "year") return String(d.getFullYear());
      if (groupBy === "month") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const label = (d: Date) => {
      if (groupBy === "year") return String(d.getFullYear());
      if (groupBy === "month") return d.toLocaleDateString("ar-EG", { year: "numeric", month: "short" });
      return d.toLocaleDateString("ar-EG", { month: "short", day: "numeric" });
    };
    for (const s of safe.sales) {
      const d = new Date(s.created_at);
      const key = fmt(d);
      const cur = map.get(key) ?? { label: label(d), sales: 0, count: 0, expenses: 0 };
      cur.sales += Number(s.total);
      cur.count += 1;
      map.set(key, cur);
    }
    for (const refund of safe.refunds) {
      const d = new Date(refund.created_at);
      const key = fmt(d);
      const cur = map.get(key) ?? { label: label(d), sales: 0, count: 0, expenses: 0 };
      cur.sales -= Number(refund.total);
      map.set(key, cur);
    }
    for (const e of safe.expenses) {
      const d = new Date(e.paid_at);
      const key = fmt(d);
      const cur = map.get(key) ?? { label: label(d), sales: 0, count: 0, expenses: 0 };
      cur.expenses += Number(e.amount);
      map.set(key, cur);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [safe, groupBy]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const i of safe.items) {
      const cur = map.get(i.product_name) ?? { name: i.product_name, qty: 0, revenue: 0 };
      cur.qty += Number(i.quantity);
      cur.revenue += Number(i.line_total);
      map.set(i.product_name, cur);
    }
    for (const returned of safe.refundItems) {
      const cur = map.get(returned.product_name) ?? { name: returned.product_name, qty: 0, revenue: 0 };
      cur.qty -= Number(returned.quantity);
      cur.revenue -= Number(returned.subtotal_amount);
      map.set(returned.product_name, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [safe.items, safe.refundItems]);

  const cashierStats = useMemo(() => {
    const refundsBySale = new Map<string, { total: number; cash: number }>();
    for (const refund of safe.refunds) {
      const current = refundsBySale.get(refund.sale_id) ?? { total: 0, cash: 0 };
      current.total += Number(refund.total);
      if (refund.refund_method === "cash") current.cash += Number(refund.total);
      refundsBySale.set(refund.sale_id, current);
    }
    const map = new Map<string, { id: string; sales: number; count: number; cash: number }>();
    for (const s of safe.sales) {
      const refunded = refundsBySale.get(s.id) ?? { total: 0, cash: 0 };
      const cur = map.get(s.cashier_id) ?? { id: s.cashier_id, sales: 0, count: 0, cash: 0 };
      cur.sales += Number(s.total) - refunded.total;
      cur.count += 1;
      if (s.payment_method === "cash") cur.cash += Number(s.total) - refunded.cash;
      map.set(s.cashier_id, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.sales - a.sales);
  }, [safe.sales, safe.refunds]);

  if (report.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="التقارير" subtitle="تعذر تحميل بيانات التقرير." />
        <Card><CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <p role="alert" className="text-sm text-destructive">{report.error instanceof Error ? report.error.message : "حدث خطأ أثناء تحميل التقارير."}</p>
          <Button variant="outline" onClick={() => void report.refetch()}>إعادة المحاولة</Button>
        </CardContent></Card>
      </div>
    );
  }

  if (report.isLoading || !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="التقارير" subtitle="تقارير مبيعات، مصروفات، مخزون وموظفين" />
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      </div>
    );
  }

  const exportCsv = (rows: Array<Record<string, string | number>>, filename: string) => {
    const csv = buildCsv(rows);
    if (!csv) return;
    const blob = new Blob(["\\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="التقارير"
        subtitle="تقارير مبيعات، مصروفات، مخزون وموظفين"
        action={canPrintReports ? <Button variant="outline" className="print:hidden" onClick={() => window.print()}><Printer className="ml-2 h-4 w-4" />طباعة التقرير</Button> : undefined}
      />

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="grid grid-cols-2 gap-3 sm:flex-1">
              <div className="space-y-2">
                <Label className="text-xs">من</Label>
                <div className="relative">
                  <Calendar className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="pr-9" disabled={!canFilterReports} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">إلى</Label>
                <div className="relative">
                  <Calendar className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="pr-9" disabled={!canFilterReports} />
                </div>
              </div>
            </div>
            <div className="space-y-2 sm:w-48">
              <Label className="text-xs">تصفية حسب الفرع</Label>
              <Select value={branchId} onValueChange={setBranchId} disabled={!canFilterReports}>
                <SelectTrigger><SelectValue placeholder="كل الفروع" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفروع</SelectItem>
                  {(branchesQuery.data ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:w-40">
              <Label className="text-xs">تجميع المبيعات</Label>
              <Select value={groupBy} onValueChange={(v) => setGroupBy(v as typeof groupBy)} disabled={!canFilterReports}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">يومي</SelectItem>
                  <SelectItem value="month">شهري</SelectItem>
                  <SelectItem value="year">سنوي</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi icon={<TrendingUp className="h-5 w-5" />} label="المبيعات بعد المرتجعات" value={`${formatMoney(totals.salesTotal)} ${tenant?.currency ?? ""}`} tone="primary" />
        <Kpi icon={<Wallet className="h-5 w-5" />} label="المصروفات" value={`${formatMoney(totals.expensesTotal)} ${tenant?.currency ?? ""}`} tone="destructive" />
        <Kpi icon={<Package className="h-5 w-5" />} label="تكلفة البضاعة" value={profitMetrics.costOfGoods === null ? "غير مكتملة" : `${formatMoney(profitMetrics.costOfGoods)} ${tenant?.currency ?? ""}`} tone="primary" />
        <Kpi icon={<FileText className="h-5 w-5" />} label="مجمل الربح" value={profitMetrics.grossProfit === null ? "غير متاح" : `${formatMoney(profitMetrics.grossProfit)} ${tenant?.currency ?? ""}`} tone={profitMetrics.grossProfit !== null && profitMetrics.grossProfit >= 0 ? "success" : "destructive"} />
        <Kpi icon={<Wallet className="h-5 w-5" />} label="صافي الربح التشغيلي" value={profitMetrics.netProfit === null ? "غير متاح" : `${formatMoney(profitMetrics.netProfit)} ${tenant?.currency ?? ""}`} tone={profitMetrics.netProfit !== null && profitMetrics.netProfit >= 0 ? "success" : "destructive"} />
        <Kpi icon={<Users className="h-5 w-5" />} label="عدد الفواتير" value={String(safe.sales.length)} tone="primary" />
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-card px-4 py-3 text-xs">
        <span className="font-semibold text-foreground">مقارنة بالفترة السابقة المماثلة:</span>
        {([
          ["المبيعات", comparison.sales],
          ["المصروفات", comparison.expenses],
          ["الفواتير", comparison.invoices],
        ] as Array<[string, number | null]>).map(([label, change]) => (
          <span key={label} className="text-muted-foreground">
            {label}: <strong className={change === null ? "text-muted-foreground" : change >= 0 ? "text-success" : "text-destructive"}>
              {change === null ? "لا توجد قاعدة مقارنة" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`}
            </strong>
          </span>
        ))}
      </div>
      {profitMetrics.unknownCostItems > 0 && (
        <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-300">
          لا يمكن اعتماد الربحية بدقة: توجد {profitMetrics.unknownCostItems} بنود بيع أو مرتجعات مستردة بلا تكلفة محفوظة وقت البيع. لم يتم تقديرها من سعر المنتج الحالي.
        </div>
      )}

      <Tabs defaultValue="sales">
        <TabsList className="grid w-full grid-cols-4 sm:w-auto sm:inline-grid">
          <TabsTrigger value="sales">المبيعات</TabsTrigger>
          <TabsTrigger value="products">المنتجات</TabsTrigger>
          <TabsTrigger value="staff">الموظفون</TabsTrigger>
          <TabsTrigger value="inventory">المخزون</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">ملخص المبيعات والمصروفات</h3>
            {canExportReports && <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportCsv(
                  groupedSales.map(([_, g]) => ({
                    الفترة: g.label,
                    المبيعات: g.sales,
                    "عدد الفواتير": g.count,
                    المصروفات: g.expenses,
                    "الفائض قبل تكلفة البضاعة": g.sales - g.expenses,
                  })),
                  `sales-report-${from}-${to}.csv`,
                )
              }
            >
              <Download className="ml-2 h-4 w-4" />تصدير CSV
            </Button>}
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-right">
                    <tr>
                      <th className="p-3 font-medium">الفترة</th>
                      <th className="p-3 font-medium">المبيعات</th>
                      <th className="p-3 font-medium">المصروفات</th>
                      <th className="p-3 font-medium">الصافي</th>
                      <th className="p-3 font-medium">عدد الفواتير</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedSales.map(([key, g]) => (
                      <tr key={key} className="border-t hover:bg-muted/30">
                        <td className="p-3">{g.label}</td>
                        <td className="p-3 num font-bold text-primary">{formatMoney(g.sales)}</td>
                        <td className="p-3 num text-destructive">{formatMoney(g.expenses)}</td>
                        <td className={`p-3 num font-medium ${g.sales - g.expenses >= 0 ? "text-success" : "text-destructive"}`}>{formatMoney(g.sales - g.expenses)}</td>
                        <td className="p-3 num">{g.count}</td>
                      </tr>
                    ))}
                    {groupedSales.length === 0 && (
                      <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">لا توجد بيانات في الفترة المحددة</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">أكثر 10 منتجات مبيعاً</h3>
            {canExportReports && <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportCsv(
                  topProducts.map((p, i) => ({
                    الترتيب: i + 1,
                    المنتج: p.name,
                    الكمية: p.qty,
                    الإيراد: p.revenue,
                  })),
                  `top-products-${from}-${to}.csv`,
                )
              }
            >
              <Download className="ml-2 h-4 w-4" />تصدير CSV
            </Button>}
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-right">
                    <tr>
                      <th className="p-3 font-medium">#</th>
                      <th className="p-3 font-medium">المنتج</th>
                      <th className="p-3 font-medium">الكمية المباعة</th>
                      <th className="p-3 font-medium">الإيراد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((p, i) => (
                      <tr key={p.name} className="border-t hover:bg-muted/30">
                        <td className="p-3 num text-muted-foreground">{i + 1}</td>
                        <td className="p-3 font-medium">{p.name}</td>
                        <td className="p-3 num">{formatMoney(p.qty, 3)}</td>
                        <td className="p-3 num font-bold text-primary">{formatMoney(p.revenue)}</td>
                      </tr>
                    ))}
                    {topProducts.length === 0 && (
                      <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">لا توجد مبيعات في الفترة المحددة</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staff" className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">أداء الكاشيرين</h3>
            {canExportReports && <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportCsv(
                  cashierStats.map((c) => ({
                    "معرف الكاشير": c.id,
                    المبيعات: c.sales,
                    "عدد الفواتير": c.count,
                    النقدي: c.cash,
                  })),
                  `cashier-report-${from}-${to}.csv`,
                )
              }
            >
              <Download className="ml-2 h-4 w-4" />تصدير CSV
            </Button>}
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-right">
                    <tr>
                      <th className="p-3 font-medium">الكاشير</th>
                      <th className="p-3 font-medium">المبيعات</th>
                      <th className="p-3 font-medium">النقدي</th>
                      <th className="p-3 font-medium">عدد الفواتير</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashierStats.map((c) => (
                      <tr key={c.id} className="border-t hover:bg-muted/30">
                        <td className="p-3 font-medium flex items-center gap-2">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          <span dir="ltr" className="font-mono text-xs">{c.id.slice(0, 8)}</span>
                        </td>
                        <td className="p-3 num font-bold text-primary">{formatMoney(c.sales)}</td>
                        <td className="p-3 num">{formatMoney(c.cash)}</td>
                        <td className="p-3 num">{c.count}</td>
                      </tr>
                    ))}
                    {cashierStats.length === 0 && (
                      <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">لا يوجد كاشيرون في الفترة المحددة</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-4 pt-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Kpi icon={<Package className="h-5 w-5" />} label="قيمة المخزون الحالية بالتكلفة" value={`${formatMoney(inventoryValue)} ${tenant?.currency ?? ""}`} tone="primary" />
            <Kpi icon={<Package className="h-5 w-5" />} label="أصناف عند حد إعادة الطلب أو أقل" value={String(lowStockRows.length)} tone={lowStockRows.length ? "destructive" : "success"} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold">تفاصيل أرصدة المخزون</h3>
              <p className="text-xs text-muted-foreground">القيمة تقديرية وفق تكلفة المنتج الحالية، وليست تكلفة تاريخية للمبيعات.</p>
            </div>
            {canExportReports && <Button variant="outline" size="sm" onClick={() => exportCsv(
              inventoryRows.map((row: any) => ({
                المنتج: row.productName, الرمز: row.sku ?? "", الفرع: row.branchName,
                الكمية: row.quantity, "حد إعادة الطلب": row.minimum,
                "تكلفة الوحدة الحالية": row.costPrice, "القيمة التقديرية": row.estimatedValue,
              })),
              `inventory-report-${from}-${to}.csv`,
            )}><Download className="ml-2 h-4 w-4" />تصدير CSV</Button>}
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-right">
                    <tr>
                      <th className="p-3 font-medium">المنتج</th>
                      <th className="p-3 font-medium">الفرع</th>
                      <th className="p-3 font-medium">الرصيد</th>
                      <th className="p-3 font-medium">حد إعادة الطلب</th>
                      <th className="p-3 font-medium">قيمة المخزون</th>
                      <th className="p-3 font-medium">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryRows.slice(0, 100).map((row: any) => (
                      <tr key={`${row.productId}-${row.branchId}`} className="border-t hover:bg-muted/30">
                        <td className="p-3 font-medium">{row.productName}{row.sku && <span className="mr-2 text-xs text-muted-foreground">{row.sku}</span>}</td>
                        <td className="p-3">{row.branchName}</td>
                        <td className="p-3 num">{formatMoney(row.quantity, 3)}</td>
                        <td className="p-3 num">{formatMoney(row.minimum, 3)}</td>
                        <td className="p-3 num">{formatMoney(row.estimatedValue)}</td>
                        <td className="p-3">{row.quantity <= row.minimum
                          ? <span className="font-semibold text-destructive">يحتاج إعادة طلب</span>
                          : <span className="text-success">متوفر</span>}</td>
                      </tr>
                    ))}
                    {inventoryRows.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">لا توجد أرصدة مخزون ضمن نطاق الصلاحيات الحالي.</td></tr>}
                  </tbody>
                </table>
              </div>
              {inventoryRows.length > 100 && <p className="border-t p-3 text-center text-xs text-muted-foreground">يتم عرض أول 100 صنف حسب أولوية النقص؛ التصدير يتضمن جميع الأصناف.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "primary" | "success" | "destructive";
}) {
  const bg = tone === "success" ? "bg-success/15 text-success" : tone === "destructive" ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary";
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 text-xl font-bold num">{value}</div>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${bg}`}>{icon}</div>
      </CardContent>
    </Card>
  );
}
