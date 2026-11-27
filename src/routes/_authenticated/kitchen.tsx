import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChefHat, RefreshCw, Clock3, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { enqueueOfflineOperation } from "@/lib/offline-sync";
import "@/lib/offline-handlers";

export const Route = createFileRoute("/_authenticated/kitchen")({ component: KitchenPage });

type KitchenOrder = {
  id: string;
  tenant_id: string;
  branch_id: string;
  sale_id: string;
  status: "new" | "preparing" | "ready" | "delivered" | "cancelled";
  notes: string | null;
  created_at: string;
};
type Sale = { id: string; invoice_no: number; created_at: string; notes: string | null; order_type: "dine_in" | "takeaway" | "delivery"; table_id: string | null; table_name?: string | null; delivery_customer_name: string | null; delivery_customer_phone: string | null; delivery_address: string | null; delivery_fee: number };
type SaleItem = { sale_id: string; product_name: string; quantity: number };

const statusLabel: Record<KitchenOrder["status"], string> = {
  new: "جديد",
  preparing: "قيد التحضير",
  ready: "جاهز",
  delivered: "تم التسليم",
  cancelled: "ملغي",
};

function KitchenPage() {
  const { tenantId, userId, membership, isSuperOwner, hasPermission } = useActiveTenant();
  const canManage = hasPermission("kitchen.manage");
  const qc = useQueryClient();
  const [branchId, setBranchId] = useState<string>(membership?.branch_id ?? "");

  const branches = useQuery({
    queryKey: ["kitchen-branches", tenantId, membership?.company_id, membership?.branch_id, isSuperOwner],
    queryFn: async () => {
      let query = supabase.from("branches").select("id,name").eq("tenant_id", tenantId!).eq("is_active", true).order("name");
      if (!isSuperOwner && membership?.branch_id) query = query.eq("id", membership.branch_id);
      else if (!isSuperOwner && membership?.company_id) query = query.eq("company_id", membership.company_id);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (branchId && branches.data && !branches.data.some((branch) => branch.id === branchId)) {
      setBranchId(branches.data[0]?.id ?? "");
      return;
    }
    if (!branchId && branches.data?.length) setBranchId(branches.data[0].id);
  }, [branchId, branches.data]);

  const queue = useQuery({
    queryKey: ["kitchen-queue", tenantId, branchId],
    queryFn: async () => {
      if (!tenantId || !branchId) return [] as Array<KitchenOrder & { sale: Sale | null; items: SaleItem[] }>;
      const { data: orderRows, error } = await (supabase.from("kitchen_orders" as any) as any)
        .select("id,tenant_id,branch_id,sale_id,status,notes,created_at")
        .eq("tenant_id", tenantId).eq("branch_id", branchId)
        .in("status", ["new", "preparing", "ready"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      const orders = (orderRows ?? []) as KitchenOrder[];
      const saleIds = orders.map((order) => order.sale_id);
      if (!saleIds.length) return [];
      const [salesResult, itemsResult] = await Promise.all([
        (supabase.from("sales" as any) as any).select("id,invoice_no,created_at,notes,order_type,table_id,delivery_customer_name,delivery_customer_phone,delivery_address,delivery_fee").in("id", saleIds),
        supabase.from("sale_items").select("sale_id,product_name,quantity").in("sale_id", saleIds),
      ]);
      if (salesResult.error) throw salesResult.error;
      if (itemsResult.error) throw itemsResult.error;
      const sales = (salesResult.data ?? []) as Sale[];
      const tableIds = [...new Set(sales.map((sale) => sale.table_id).filter((id): id is string => !!id))];
      const tableNames = new Map<string, string>();
      if (tableIds.length) {
        const { data: tableRows, error: tableError } = await (supabase.from("restaurant_tables" as any) as any)
          .select("id,name").in("id", tableIds);
        if (tableError) throw tableError;
        for (const table of tableRows ?? []) tableNames.set(table.id, table.name);
      }
      const salesMap = new Map(sales.map((sale) => [sale.id, { ...sale, table_name: sale.table_id ? tableNames.get(sale.table_id) ?? null : null }]));
      const itemsMap = new Map<string, SaleItem[]>();
      for (const item of (itemsResult.data ?? []) as SaleItem[]) {
        itemsMap.set(item.sale_id, [...(itemsMap.get(item.sale_id) ?? []), item]);
      }
      return orders.map((order) => ({
        ...order,
        sale: salesMap.get(order.sale_id) ?? null,
        items: itemsMap.get(order.sale_id) ?? [],
      }));
    },
    enabled: !!tenantId && !!branchId,
    refetchInterval: 30_000,
  });

  const kitchenDailyMetrics = useQuery({
    queryKey: ["kitchen-daily-metrics", tenantId, userId, branchId],
    queryFn: async () => {
      if (!tenantId || !branchId) return { new: 0, preparing: 0, ready: 0, delivered: 0 };
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const statuses = ["new", "preparing", "ready", "delivered"] as const;
      const entries = await Promise.all(statuses.map(async (status) => {
        const { count, error } = await (supabase.from("kitchen_orders" as any) as any)
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("branch_id", branchId)
          .eq("status", status)
          .gte("created_at", startOfDay.toISOString());
        if (error) throw error;
        return [status, count ?? 0] as const;
      }));
      return Object.fromEntries(entries) as Record<typeof statuses[number], number>;
    },
    enabled: !!tenantId && !!branchId,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase.channel(`kitchen-orders-${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_orders", filter: `tenant_id=eq.${tenantId}` }, () => {
        void qc.invalidateQueries({ queryKey: ["kitchen-queue", tenantId] });
        void qc.invalidateQueries({ queryKey: ["kitchen-daily-metrics", tenantId] });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [tenantId, qc]);

  useEffect(() => {
    const refreshAfterSync = () => {
      void qc.invalidateQueries({ queryKey: ["kitchen-queue", tenantId, branchId] });
      void qc.invalidateQueries({ queryKey: ["kitchen-daily-metrics", tenantId, userId, branchId] });
    };
    window.addEventListener("offline-sync:changed", refreshAfterSync);
    return () => window.removeEventListener("offline-sync:changed", refreshAfterSync);
  }, [qc, tenantId, branchId]);

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "preparing" | "ready" | "delivered" }) => {
      if (!tenantId || !userId || !branchId) throw new Error("تعذر تحديد المستخدم أو المؤسسة أو الفرع.");
      if (!canManage) throw new Error("لا تملك صلاحية إدارة طلبات المطبخ.");
      const idempotencyKey = crypto.randomUUID();
      if (!navigator.onLine) {
        await enqueueOfflineOperation("kitchen_status",
          { orderId: id, status, notes: null, tenantId, branchId },
          { userId, tenantId, branchId, companyId: membership?.company_id ?? null },
          [], idempotencyKey);
        return { queued: true };
      }
      try {
        const { error } = await (supabase.rpc as any)("set_kitchen_order_status_idempotent", {
          _expected_actor_id: userId, _expected_tenant_id: tenantId, _expected_branch_id: branchId, _order_id: id, _new_status: status, _notes: null, _idempotency_key: idempotencyKey,
        });
        if (error) throw error;
        return { queued: false };
      } catch (error) {
        const networkFailure = error instanceof TypeError ||
          /failed to fetch|network|connection|offline|fetcherror/i.test(
            error instanceof Error ? error.message : String(error),
          );
        if (!navigator.onLine || networkFailure) {
          await enqueueOfflineOperation("kitchen_status",
            { orderId: id, status, notes: null, tenantId, branchId },
            { userId, tenantId, branchId, companyId: membership?.company_id ?? null },
            [], idempotencyKey);
          return { queued: true };
        }
        throw error;
      }
    },
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["kitchen-queue", tenantId, branchId] });
      toast.success(result.queued
        ? "حُفظ تحديث الطلب محلياً وسيُزامن تلقائياً عند عودة الإنترنت"
        : "تم تحديث حالة الطلب");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر تحديث الطلب"),
  });

  const kitchenMetrics = useMemo(() => {
    const orders = queue.data ?? [];
    const newCount = orders.filter((order) => order.status === "new").length;
    const preparingCount = orders.filter((order) => order.status === "preparing").length;
    const readyCount = orders.filter((order) => order.status === "ready").length;
    const lateOrders = orders.filter((order) =>
      (order.status === "new" || order.status === "preparing") &&
      Date.now() - new Date(order.created_at).getTime() >= 20 * 60 * 1000
    );
    const daily = kitchenDailyMetrics.data ?? { new: 0, preparing: 0, ready: 0, delivered: 0 };
    const dailyTotal = daily.new + daily.preparing + daily.ready + daily.delivered;
    const completionRate = dailyTotal ? Math.round((daily.delivered / dailyTotal) * 100) : 0;
    return { newCount, preparingCount, readyCount, lateOrders, completionRate, deliveredToday: daily.delivered, dailyTotal };
  }, [queue.data, kitchenDailyMetrics.data]);

  const columns = useMemo(() => ([
    { status: "new" as const, title: "طلبات جديدة", next: "preparing" as const, action: "بدء التحضير" },
    { status: "preparing" as const, title: "قيد التحضير", next: "ready" as const, action: "تحديد كجاهز" },
    { status: "ready" as const, title: "جاهزة للتسليم", next: "delivered" as const, action: "تأكيد التسليم" },
  ]), []);

  if (branches.isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader title="شاشة المطبخ" subtitle="طلبات الفروع لحظياً مع سجل مستقل لحالة التحضير دون تعديل الفواتير أو المدفوعات أو المخزون." action={
        <div className="flex items-center gap-2">
          <Select value={branchId} onValueChange={setBranchId} disabled={!!membership?.branch_id}>
            <SelectTrigger className="w-44"><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
            <SelectContent>{(branches.data ?? []).map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button type="button" size="icon" variant="outline" aria-label="تحديث الطلبات" onClick={() => queue.refetch()}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      } />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="ملخص أداء المطبخ اليوم">
        {[
          { label: "طلبات جديدة", value: kitchenMetrics.newCount, tone: "border-sky-200 bg-sky-50 text-sky-800" },
          { label: "قيد التحضير", value: kitchenMetrics.preparingCount, tone: "border-amber-200 bg-amber-50 text-amber-800" },
          { label: "جاهزة للتسليم", value: kitchenMetrics.readyCount, tone: "border-emerald-200 bg-emerald-50 text-emerald-800" },
          { label: "نسبة الإنجاز اليوم", value: `${kitchenMetrics.completionRate}%`, tone: "border-primary/20 bg-primary/5 text-primary" },
        ].map((metric) => <Card key={metric.label} className={metric.tone}><CardContent className="p-4"><div className="text-xs font-semibold">{metric.label}</div><div className="mt-1 text-2xl font-extrabold num">{metric.value}</div>{metric.label === "نسبة الإنجاز اليوم" && <div className="mt-1 text-[11px] opacity-75">{kitchenMetrics.deliveredToday} من {kitchenMetrics.dailyTotal} طلب</div>}</CardContent></Card>)}
      </section>
      {kitchenDailyMetrics.isError && <div role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">تعذر تحميل إحصائيات المطبخ اليومية. <Button variant="link" onClick={() => kitchenDailyMetrics.refetch()}>إعادة المحاولة</Button></div>}
      {kitchenMetrics.lateOrders.length > 0 && <div role="status" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><strong>تنبيه تأخير:</strong> يوجد {kitchenMetrics.lateOrders.length} طلباً جديداً أو قيد التحضير تجاوز 20 دقيقة.</div>}
      {branches.isError && <div role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">تعذر تحميل الفروع. أعد تحميل الصفحة أو تحقق من صلاحياتك.</div>}
      {queue.isError && <div role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">تعذر تحميل طلبات المطبخ. <Button variant="link" onClick={() => queue.refetch()}>إعادة المحاولة</Button></div>}
      {queue.isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
        <div className="grid gap-4 xl:grid-cols-3">
          {columns.map((column) => {
            const orders = (queue.data ?? []).filter((order) => order.status === column.status);
            return (
              <section key={column.status} className="min-w-0 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 font-bold"><ChefHat className="h-4 w-4 text-primary" />{column.title}</h2>
                  <Badge variant="secondary">{orders.length}</Badge>
                </div>
                {orders.length === 0 ? <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد طلبات في هذه المرحلة.</div> : orders.map((order) => (
                  <Card key={order.id} className="overflow-hidden">
                    <CardHeader className="space-y-1 p-3 pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">فاتورة #{order.sale?.invoice_no ?? "—"}</CardTitle>
                        <Badge variant={column.status === "ready" ? "default" : "outline"}>{statusLabel[order.status]}</Badge>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3 w-3" />{new Intl.DateTimeFormat("ar-YE", { hour: "2-digit", minute: "2-digit" }).format(new Date(order.created_at))}</div>
                      <div className="text-xs text-muted-foreground">نوع الطلب: {order.sale?.order_type === "dine_in" ? "محلي" : order.sale?.order_type === "delivery" ? "توصيل" : "سفري"}{order.sale?.table_name ? " · الطاولة: " + order.sale.table_name : ""}</div>
                    </CardHeader>
                    <CardContent className="space-y-3 p-3 pt-0">
                      <div className="space-y-2">
                        {order.items.map((item, index) => <div key={`${order.id}-${index}`} className="flex items-center justify-between gap-3 border-b pb-1 text-sm last:border-0"><span>{item.product_name}</span><span className="shrink-0 rounded bg-muted px-2 py-0.5 font-bold">× {item.quantity}</span></div>)}
                        {order.items.length === 0 && <p className="text-xs text-muted-foreground">تعذر العثور على تفاصيل الأصناف.</p>}
                      </div>
                      {order.sale?.order_type === "delivery" && <div className="rounded-md bg-muted p-2 text-xs"><strong>التوصيل:</strong> {order.sale.delivery_customer_name} · {order.sale.delivery_customer_phone}<br />{order.sale.delivery_address}</div>}
                      {(order.notes || order.sale?.notes) && <div className="rounded-md bg-amber-500/10 p-2 text-xs"><strong>ملاحظات:</strong> {order.notes || order.sale?.notes}</div>}
                      {canManage && <Button className="w-full" size="sm" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ id: order.id, status: column.next })}><CheckCircle2 className="ml-2 h-4 w-4" />{column.action}</Button>}
                    </CardContent>
                  </Card>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
