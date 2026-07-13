import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { useSuperOwner } from "@/hooks/use-super-owner";
import { Card, CardContent } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { Loader2, TrendingUp, TrendingDown, Receipt, Wallet, Package, Crown, Building2, Users as UsersIcon } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

function Dashboard() {
  const { tenantId, tenant, user } = useActiveTenant();
  const { isSuperOwner } = useSuperOwner();

  const superStats = useQuery({
    queryKey: ["super-owner-stats"],
    queryFn: async () => {
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const [tenants, branches, users, sales, expenses] = await Promise.all([
        supabase.from("tenants").select("id", { count: "exact", head: true }),
        supabase.from("branches").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("sales").select("total").gte("created_at", startOfMonth),
        supabase.from("expenses").select("amount").gte("paid_at", startOfMonth.slice(0, 10)),
      ]);
      const salesTotal = (sales.data ?? []).reduce((s, r) => s + Number((r as { total: number }).total), 0);
      const expTotal = (expenses.data ?? []).reduce((s, r) => s + Number((r as { amount: number }).amount), 0);
      return {
        tenantsCount: tenants.count ?? 0,
        branchesCount: branches.count ?? 0,
        usersCount: users.count ?? 0,
        salesTotal,
        expTotal,
      };
    },
    enabled: isSuperOwner,
  });

  const stats = useQuery({
    queryKey: ["dashboard-stats", tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const last30 = new Date(now.getTime() - 29 * 86400000);
      const last30ISO = new Date(last30.getFullYear(), last30.getMonth(), last30.getDate()).toISOString();

      const [salesToday, salesMonth, salesTrend, expensesMonth, expByCat, lowStock, sessions] = await Promise.all([
        supabase.from("sales").select("total").eq("tenant_id", tenantId).gte("created_at", startOfDay),
        supabase.from("sales").select("total").eq("tenant_id", tenantId).gte("created_at", startOfMonth),
        supabase.from("sales").select("total, created_at").eq("tenant_id", tenantId).gte("created_at", last30ISO),
        supabase.from("expenses").select("amount").eq("tenant_id", tenantId).gte("paid_at", startOfMonth.slice(0, 10)),
        supabase.from("expenses").select("amount, category_id").eq("tenant_id", tenantId).gte("paid_at", startOfMonth.slice(0, 10)),
        supabase.from("inventory").select("quantity, product_id").eq("tenant_id", tenantId),
        supabase.from("cash_sessions").select("id").eq("tenant_id", tenantId).eq("status", "open"),
      ]);

      const catsRes = await supabase.from("expense_categories").select("id, name, color").eq("tenant_id", tenantId);
      const catMap = new Map((catsRes.data ?? []).map((c) => [(c as { id: string }).id, c as { name: string; color: string | null }]));

      const totalToday = (salesToday.data ?? []).reduce((s, r) => s + Number((r as { total: number }).total), 0);
      const totalMonth = (salesMonth.data ?? []).reduce((s, r) => s + Number((r as { total: number }).total), 0);
      const totalExpMonth = (expensesMonth.data ?? []).reduce((s, r) => s + Number((r as { amount: number }).amount), 0);

      // Trend: group by day
      const dayMap = new Map<string, number>();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000);
        const key = d.toISOString().slice(0, 10);
        dayMap.set(key, 0);
      }
      for (const s of salesTrend.data ?? []) {
        const key = new Date((s as { created_at: string }).created_at).toISOString().slice(0, 10);
        if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) + Number((s as { total: number }).total));
      }
      const trend = Array.from(dayMap.entries()).map(([day, total]) => ({ day: day.slice(5), total: +total.toFixed(2) }));

      // Expenses by category
      const byCatMap = new Map<string, number>();
      for (const e of expByCat.data ?? []) {
        const cid = (e as { category_id: string | null }).category_id ?? "other";
        byCatMap.set(cid, (byCatMap.get(cid) ?? 0) + Number((e as { amount: number }).amount));
      }
      const colors = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];
      const byCat = Array.from(byCatMap.entries()).map(([cid, value], i) => ({
        name: cid === "other" ? "أخرى" : (catMap.get(cid)?.name ?? "—"),
        value: +value.toFixed(2),
        color: catMap.get(cid)?.color ?? colors[i % colors.length],
      }));

      const lowStockCount = (lowStock.data ?? []).filter((r) => Number((r as { quantity: number }).quantity) <= 0).length;

      return {
        totalToday, totalMonth, totalExpMonth,
        profit: totalMonth - totalExpMonth,
        salesTodayCount: (salesToday.data ?? []).length,
        openSessions: (sessions.data ?? []).length,
        lowStockCount,
        trend, byCat,
      };
    },
    enabled: !!tenantId,
  });

  const currency = tenant?.currency ?? "";

  return (
    <div className="space-y-6">
      <PageHeader title={`أهلاً، ${user?.email ?? ""}`} subtitle={tenant?.name} />

      {isSuperOwner && superStats.data && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
              <Crown className="h-4 w-4" /> نظرة عامة على المنظومة (Super Owner)
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <MiniStat label="مطاعم" value={superStats.data.tenantsCount} icon={<Building2 className="h-4 w-4" />} />
              <MiniStat label="فروع" value={superStats.data.branchesCount} icon={<Building2 className="h-4 w-4" />} />
              <MiniStat label="مستخدمون" value={superStats.data.usersCount} icon={<UsersIcon className="h-4 w-4" />} />
              <MiniStat label="مبيعات الشهر" value={Math.round(superStats.data.salesTotal)} icon={<TrendingUp className="h-4 w-4" />} />
              <MiniStat label="مصروفات الشهر" value={Math.round(superStats.data.expTotal)} icon={<TrendingDown className="h-4 w-4" />} />
            </div>
          </CardContent>
        </Card>
      )}

      {stats.isLoading || !stats.data ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="مبيعات اليوم" value={`${formatMoney(stats.data.totalToday)} ${currency}`} sub={`${stats.data.salesTodayCount} فاتورة`} icon={<Receipt className="h-5 w-5" />} tone="primary" />
            <Kpi label="مبيعات الشهر" value={`${formatMoney(stats.data.totalMonth)} ${currency}`} icon={<TrendingUp className="h-5 w-5" />} tone="success" />
            <Kpi label="مصروفات الشهر" value={`${formatMoney(stats.data.totalExpMonth)} ${currency}`} icon={<TrendingDown className="h-5 w-5" />} tone="destructive" />
            <Kpi label="صافي الربح" value={`${formatMoney(stats.data.profit)} ${currency}`} icon={<Wallet className="h-5 w-5" />} tone={stats.data.profit >= 0 ? "success" : "destructive"} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardContent className="p-4">
                <div className="mb-3 text-sm font-semibold">مبيعات آخر 30 يوم</div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.data.trend}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="mb-3 text-sm font-semibold">توزيع المصروفات</div>
                {stats.data.byCat.length === 0 ? (
                  <div className="grid h-64 place-items-center text-sm text-muted-foreground">لا توجد مصروفات</div>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={stats.data.byCat} dataKey="value" nameKey="name" outerRadius={80} label>
                          {stats.data.byCat.map((e, i) => <Cell key={i} fill={e.color ?? "hsl(var(--primary))"} />)}
                        </Pie>
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <MiniStat label="ورديات مفتوحة" value={stats.data.openSessions} icon={<Wallet className="h-4 w-4" />} />
            <MiniStat label="نفاد مخزون" value={stats.data.lowStockCount} icon={<Package className="h-4 w-4" />} />
            <MiniStat label="فواتير اليوم" value={stats.data.salesTodayCount} icon={<Receipt className="h-4 w-4" />} />
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, icon, tone }: { label: string; value: string; sub?: string; icon: React.ReactNode; tone: "primary" | "success" | "destructive" }) {
  const bg = tone === "success" ? "bg-success/15 text-success" : tone === "destructive" ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary";
  return (
    <Card><CardContent className="flex items-center justify-between p-4">
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-bold num">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      <div className={`grid h-11 w-11 place-items-center rounded-xl ${bg}`}>{icon}</div>
    </CardContent></Card>
  );
}
function MiniStat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card><CardContent className="flex items-center gap-3 p-4">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-muted-foreground">{icon}</div>
      <div><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-bold num">{value}</div></div>
    </CardContent></Card>
  );
}
