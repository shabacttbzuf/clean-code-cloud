import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileText, Download, Calendar, TrendingUp, Wallet, Package, Users } from "lucide-react";
import { formatMoney, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const { tenantId, tenant } = useActiveTenant();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [groupBy, setGroupBy] = useState<"day" | "month" | "year">("day");

  const report = useQuery({
    queryKey: ["reports", tenantId, from, to],
    queryFn: async () => {
      if (!tenantId) return null;
      const fromDate = `${from}T00:00:00.000Z`;
      const toDate = `${to}T23:59:59.999Z`;

      const [salesRes, expensesRes, itemsRes, sessionsRes, inventoryRes] = await Promise.all([
        supabase
          .from("sales")
          .select("id, created_at, total, subtotal, discount, tax_amount, payment_method, cashier_id, branch_id, status")
          .eq("tenant_id", tenantId)
          .gte("created_at", fromDate)
          .lte("created_at", toDate)
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase
          .from("expenses")
          .select("id, paid_at, amount, category_id, description")
          .eq("tenant_id", tenantId)
          .gte("paid_at", from)
          .lte("paid_at", to)
          .order("paid_at", { ascending: false })
          .limit(5000),
        supabase
          .from("sale_items")
          .select("product_name, quantity, line_total, sale_id, created_at")
          .eq("tenant_id", tenantId)
          .gte("created_at", fromDate)
          .lte("created_at", toDate)
          .limit(20000),
        supabase
          .from("cash_sessions")
          .select("cashier_id, opening_balance, closing_balance, expected_cash, cash_difference, opened_at, closed_at, status")
          .eq("tenant_id", tenantId)
          .gte("opened_at", fromDate)
          .lte("opened_at", toDate)
          .limit(5000),
        supabase
          .from("inventory")
          .select("quantity, product_id, branch_id")
          .eq("tenant_id", tenantId)
          .limit(10000),
      ]);

      if (salesRes.error) throw salesRes.error;
      if (expensesRes.error) throw expensesRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (sessionsRes.error) throw sessionsRes.error;
      if (inventoryRes.error) throw inventoryRes.error;

      const sales = (salesRes.data ?? []) as Array<{
        id: string; created_at: string; total: number; subtotal: number; discount: number; tax_amount: number;
        payment_method: string; cashier_id: string; branch_id: string; status: string;
      }>;
      const expenses = (expensesRes.data ?? []) as Array<{ id: string; paid_at: string; amount: number; category_id: string | null; description: string | null }>;
      const items = (itemsRes.data ?? []) as Array<{ product_name: string; quantity: number; line_total: number; sale_id: string; created_at: string }>;
      const sessions = (sessionsRes.data ?? []) as Array<{
        cashier_id: string; opening_balance: number; closing_balance: number | null;
        expected_cash: number | null; cash_difference: number | null; opened_at: string; closed_at: string | null; status: string;
      }>;
      const inventory = (inventoryRes.data ?? []) as Array<{ quantity: number; product_id: string; branch_id: string }>;

      return { sales, expenses, items, sessions, inventory };
    },
    enabled: !!tenantId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const data = report.data;
  const safe = useMemo(
    () => data ?? { sales: [] as any[], expenses: [] as any[], items: [] as any[], sessions: [] as any[], inventory: [] as any[] },
    [data],
  );

  const totals = useMemo(() => {
    const salesTotal = safe.sales.reduce((s: number, r: any) => s + Number(r.total), 0);
    const expensesTotal = safe.expenses.reduce((s: number, e: any) => s + Number(e.amount), 0);
    const discountTotal = safe.sales.reduce((s: number, r: any) => s + Number(r.discount), 0);
    const taxTotal = safe.sales.reduce((s: number, r: any) => s + Number(r.tax_amount), 0);
    const net = salesTotal - expensesTotal;
    return { salesTotal, expensesTotal, discountTotal, taxTotal, net };
  }, [safe]);

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
    for (const e of safe.expenses) {
      const d = new Date(e.paid_at);
      const key = fmt(d);
      const cur = map.get(key);
      if (cur) cur.expenses += Number(e.amount);
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
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [safe.items]);

  const cashierStats = useMemo(() => {
    const map = new Map<string, { id: string; sales: number; count: number; cash: number }>();
    for (const s of safe.sales) {
      const cur = map.get(s.cashier_id) ?? { id: s.cashier_id, sales: 0, count: 0, cash: 0 };
      cur.sales += Number(s.total);
      cur.count += 1;
      if (s.payment_method === "cash") cur.cash += Number(s.total);
      map.set(s.cashier_id, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.sales - a.sales);
  }, [safe.sales]);

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader title="التقارير" subtitle="تقارير مبيعات، مصروفات، مخزون وموظفين" />
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      </div>
    );
  }

  const exportCsv = (rows: Array<Record<string, string | number>>, filename: string) => {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const escapeCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escapeCell(r[h])).join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="التقارير"
        subtitle="تقارير مبيعات، مصروفات، مخزون وموظفين"
      />

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="grid grid-cols-2 gap-3 sm:flex-1">
              <div className="space-y-2">
                <Label className="text-xs">من</Label>
                <div className="relative">
                  <Calendar className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="pr-9" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">إلى</Label>
                <div className="relative">
                  <Calendar className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="pr-9" />
                </div>
              </div>
            </div>
            <div className="space-y-2 sm:w-40">
              <Label className="text-xs">تجميع المبيعات</Label>
              <Select value={groupBy} onValueChange={(v) => setGroupBy(v as typeof groupBy)}>
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<TrendingUp className="h-5 w-5" />} label="إجمالي المبيعات" value={`${formatMoney(totals.salesTotal)} ${tenant?.currency ?? ""}`} tone="primary" />
        <Kpi icon={<Wallet className="h-5 w-5" />} label="إجمالي المصروفات" value={`${formatMoney(totals.expensesTotal)} ${tenant?.currency ?? ""}`} tone="destructive" />
        <Kpi icon={<FileText className="h-5 w-5" />} label="صافي الربح" value={`${formatMoney(totals.net)} ${tenant?.currency ?? ""}`} tone={totals.net >= 0 ? "success" : "destructive"} />
        <Kpi icon={<Package className="h-5 w-5" />} label="عدد الفواتير" value={String(safe.sales.length)} tone="primary" />
      </div>

      <Tabs defaultValue="sales">
        <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-grid">
          <TabsTrigger value="sales">المبيعات</TabsTrigger>
          <TabsTrigger value="products">المنتجات</TabsTrigger>
          <TabsTrigger value="staff">الموظفون</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">ملخص المبيعات والمصروفات</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportCsv(
                  groupedSales.map(([_, g]) => ({
                    الفترة: g.label,
                    المبيعات: g.sales,
                    "عدد الفواتير": g.count,
                    المصروفات: g.expenses,
                    الصافي: g.sales - g.expenses,
                  })),
                  `sales-report-${from}-${to}.csv`,
                )
              }
            >
              <Download className="ml-2 h-4 w-4" />تصدير CSV
            </Button>
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
            <Button
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
            </Button>
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
            <Button
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
            </Button>
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
