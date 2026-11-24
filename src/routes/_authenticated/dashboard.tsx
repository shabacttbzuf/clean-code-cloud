import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { useSuperOwner } from "@/hooks/use-super-owner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { Loader2, TrendingUp, TrendingDown, Receipt, Wallet, Package, Crown, Building2, Users as UsersIcon, Bell, Wifi, WifiOff, CircleHelp, ClipboardList, ChefHat } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { calculatePercentChange, fetchAllRows } from "@/lib/report-analytics";
import { offlineCacheKey, readOfflineCache, writeOfflineCache } from "@/lib/offline-reference-cache";
import { Link } from "@tanstack/react-router";
import { Sparkles, ShoppingBag, ArrowLeft, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "لوحة التحكم — نظام إدارة الأعمال" },
      { name: "description", content: "تابع أداء الشركات والفروع والمبيعات والمصروفات والمخزون والموارد البشرية من لوحة التحكم." },
      { property: "og:title", content: "لوحة التحكم — نظام إدارة الأعمال" },
      { property: "og:description", content: "تابع أداء الشركات والفروع والمبيعات والمصروفات والمخزون والموارد البشرية من لوحة التحكم." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function localDayKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function safeCampaignTarget(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function Dashboard() {
  const [activeCampaignIndex, setActiveCampaignIndex] = useState(0);
  const [campaignRotationPaused, setCampaignRotationPaused] = useState(false);
  const { tenantId, tenant, user, membership, role, hasPermission } = useActiveTenant();
  const { isSuperOwner } = useSuperOwner();
  const profileQuery = useQuery({
    queryKey: ["dashboard-profile-name", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, username")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });
  const displayName =
    profileQuery.data?.full_name?.trim() ||
    user?.user_metadata?.full_name?.trim() ||
    profileQuery.data?.username?.trim() ||
    user?.email?.split("@")[0]?.trim() ||
    "مستخدم";

  const campaignsQuery = useQuery({
    queryKey: ["dashboard-marketing-campaigns", tenantId, membership?.company_id ?? "tenant"],
    queryFn: async () => {
      const now = new Date().toISOString();
      let query = supabase.from("marketing_campaigns")
        .select("id,title,description,image_url,target_url,starts_at,ends_at,sort_order")
        .eq("tenant_id", tenantId!)
        .eq("status", "active")
        .in("placement", ["dashboard_banner", "dashboard_card"])
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gt.${now}`)
        .order("sort_order")
        .limit(6);
      if (membership?.company_id) {
        query = query.or(`company_id.is.null,company_id.eq.${membership.company_id}`);
      } else if (!isSuperOwner && !(role === "owner" && !membership?.company_id)) {
        // Branch-only and regular tenant members must never receive another company's campaigns.
        query = query.is("company_id", null);
      }
      const { data, error } = await query;
      if (error) throw error;
      const nowMs = Date.now();
      return (data ?? []).filter((campaign) =>
        (!campaign.starts_at || new Date(campaign.starts_at).getTime() <= nowMs) &&
        (!campaign.ends_at || new Date(campaign.ends_at).getTime() > nowMs)
      );
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  });

  useEffect(() => {
    setActiveCampaignIndex(0);
  }, [tenantId, membership?.company_id]);

  useEffect(() => {
    const campaignCount = campaignsQuery.data?.length ?? 0;
    if (campaignRotationPaused || campaignCount < 2 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setActiveCampaignIndex((current) => (current + 1) % campaignCount);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [campaignRotationPaused, campaignsQuery.data?.length]);

  const activeCampaign = campaignsQuery.data?.[activeCampaignIndex] ?? campaignsQuery.data?.[0] ?? null;

  useEffect(() => {
    if (!activeCampaign?.id) return;
    // Supabase RPC builders are thenable, but they do not expose Promise.catch().
    // Await the RPC inside an async task so analytics failures never crash the dashboard.
    void (async () => {
      try {
        const { error } = await (supabase.rpc as any)("record_marketing_campaign_event", {
          _campaign_id: activeCampaign.id,
          _event_type: "impression",
        });
        if (error) console.warn("Campaign impression tracking failed", error);
      } catch (error) {
        console.warn("Campaign impression tracking failed", error);
      }
    })();
  }, [activeCampaign?.id]);

  const systemStatusQuery = useQuery({
    queryKey: ["dashboard-system-status", tenantId, user?.id],
    queryFn: async () => {
      if (!tenantId || !user?.id) throw new Error("لا يوجد نطاق شركة أو مستخدم نشط.");
      const checkedAt = new Date().toISOString();
      const [authResult, tenantResult, branchesResult, profileResult, permissionsResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("tenants").select("id").eq("id", tenantId).maybeSingle(),
        supabase.from("branches").select("id").eq("tenant_id", tenantId).limit(1),
        supabase.from("profiles").select("id").eq("id", user.id).maybeSingle(),
        supabase.rpc("get_my_permissions", { _tenant_id: tenantId }),
      ]);
      const checks = [
        {
          key: "authentication",
          label: "خدمة المصادقة وتحقق الجلسة",
          status: authResult.error || authResult.data.user?.id !== user.id ? "failed" : "ok",
          detail: authResult.error?.message ?? (authResult.data.user?.id === user.id
            ? "تم التحقق من جلسة المستخدم عبر خدمة المصادقة."
            : "جلسة المصادقة لا تطابق المستخدم النشط."),
        },
        {
          key: "database",
          label: "اتصال قاعدة البيانات",
          status: tenantResult.error || !tenantResult.data ? "failed" : "ok",
          detail: tenantResult.error?.message ?? (tenantResult.data ? "تم الوصول إلى سجل الشركة." : "لم يتم العثور على الشركة النشطة."),
        },
        {
          key: "branch",
          label: "بيانات الفروع",
          status: branchesResult.error ? "failed" : (branchesResult.data?.length ? "ok" : "warning"),
          detail: branchesResult.error?.message ?? (branchesResult.data?.length ? "تم التحقق من إمكانية قراءة بيانات الفروع." : "لم يتم العثور على فرع متاح ضمن نطاق الحساب."),
        },
        {
          key: "authorization",
          label: "خدمة الصلاحيات",
          status: permissionsResult.error ? "failed" : "ok",
          detail: permissionsResult.error?.message ?? "تم تنفيذ فحص الصلاحيات بنجاح.",
        },
        {
          key: "profile",
          label: "ملف المستخدم",
          status: profileResult.error ? "failed" : (profileResult.data ? "ok" : "warning"),
          detail: profileResult.error?.message ?? (profileResult.data ? "ملف المستخدم قابل للقراءة." : "ملف المستخدم غير مكتمل أو غير متاح."),
        },
      ];
      const overall = checks.some((check) => check.status === "failed")
        ? "degraded"
        : checks.every((check) => check.status === "ok") ? "healthy" : "warning";
      return { checkedAt, checks, overall };
    },
    enabled: !!tenantId && !!user?.id,
    refetchInterval: 30_000,
    retry: 1,
  });

  const dashboardNotifications = useQuery({
    queryKey: ["dashboard-notifications", tenantId, user?.id],
    queryFn: async () => {
      if (!tenantId || !user?.id) return [];
      const [items, reads] = await Promise.all([
        supabase.from("notifications").select("id,title,body,created_at,urgency")
          .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(6),
        (supabase.from("notification_reads" as any) as any).select("notification_id").eq("user_id", user.id),
      ]);
      if (items.error) throw items.error;
      if (reads.error) throw reads.error;
      const readIds = new Set<string>((reads.data ?? []).map((row: { notification_id: string }) => row.notification_id));
      return (items.data ?? []).map((item) => ({ ...item, isRead: readIds.has(item.id) }));
    },
    enabled: !!tenantId && !!user?.id && hasPermission("notifications.view"),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const superStats = useQuery({
    queryKey: ["super-owner-stats"],
    queryFn: async () => {
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const [tenants, branches, users, sales, refunds, expenses] = await Promise.all([
        supabase.from("tenants").select("id", { count: "exact", head: true }),
        supabase.from("branches").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("sales").select("total").neq("status", "void").gte("created_at", startOfMonth),
        supabase.from("sale_refunds").select("total").gte("created_at", startOfMonth),
        supabase.from("expenses").select("amount").gte("paid_at", startOfMonth.slice(0, 10)),
      ]);
      for (const result of [tenants, branches, users, sales, refunds, expenses]) {
        if (result.error) throw result.error;
      }
      const salesGross = (sales.data ?? []).reduce((s, r) => s + Number((r as { total: number }).total), 0);
      const refundsTotal = (refunds.data ?? []).reduce((s, r) => s + Number((r as { total: number }).total), 0);
      const salesTotal = salesGross - refundsTotal;
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
    queryKey: ["dashboard-stats", tenantId, user?.id, membership?.company_id, membership?.branch_id, isSuperOwner],
    queryFn: async () => {
      if (!tenantId || !user?.id) return null;
      const now = new Date();
      const dayStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const last30Date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      const dayStart = dayStartDate.toISOString();
      const tomorrow = tomorrowDate.toISOString();
      const yesterday = yesterdayDate.toISOString();
      const monthStart = monthStartDate.toISOString();
      const last30 = last30Date.toISOString();
      const cacheKey = offlineCacheKey({ tenantId, userId: user.id, companyId: membership?.company_id, branchId: membership?.branch_id }, "dashboard-statistics-v2");

      const loadLiveStats = async () => {
        let scopedBranchIds: string[] | null = null;
        if (!isSuperOwner && membership?.branch_id) scopedBranchIds = [membership.branch_id];
        else if (!isSuperOwner && membership?.company_id) {
          const { data, error } = await supabase.from("branches").select("id")
            .eq("tenant_id", tenantId).eq("company_id", membership.company_id);
          if (error) throw error;
          scopedBranchIds = (data ?? []).map((row) => row.id);
        }
        const scope = <T extends { in: (column: string, values: string[]) => T }>(query: T): T =>
          scopedBranchIds === null ? query : query.in("branch_id", scopedBranchIds);

        const salesTodayQ = scope(supabase.from("sales").select("id,total,created_at").eq("tenant_id", tenantId).neq("status", "void").gte("created_at", dayStart).lt("created_at", tomorrow));
        const salesYesterdayQ = scope(supabase.from("sales").select("id,total").eq("tenant_id", tenantId).neq("status", "void").gte("created_at", yesterday).lt("created_at", dayStart));
        const salesMonthQ = scope(supabase.from("sales").select("id,total,subtotal,discount").eq("tenant_id", tenantId).neq("status", "void").gte("created_at", monthStart));
        const salesTrendQ = scope(supabase.from("sales").select("total,created_at").eq("tenant_id", tenantId).neq("status", "void").gte("created_at", last30));
        const refundsTodayQ = scope(supabase.from("sale_refunds").select("total").eq("tenant_id", tenantId).gte("created_at", dayStart).lt("created_at", tomorrow));
        const refundsYesterdayQ = scope(supabase.from("sale_refunds").select("total").eq("tenant_id", tenantId).gte("created_at", yesterday).lt("created_at", dayStart));
        const refundsMonthQ = scope(supabase.from("sale_refunds").select("id,total,subtotal,discount").eq("tenant_id", tenantId).gte("created_at", monthStart));
        const refundsTrendQ = scope(supabase.from("sale_refunds").select("total,created_at").eq("tenant_id", tenantId).gte("created_at", last30));
        const expensesQ = scope(supabase.from("expenses").select("amount,paid_at").eq("tenant_id", tenantId).gte("paid_at", monthStart.slice(0, 10)));
        const expensesByCategoryQ = scope(supabase.from("expenses").select("amount,category_id,paid_at").eq("tenant_id", tenantId).gte("paid_at", monthStart.slice(0, 10)));
        const inventoryQ = scope(supabase.from("inventory").select("quantity,product_id").eq("tenant_id", tenantId));
        const sessionsQ = scope(supabase.from("cash_sessions").select("id").eq("tenant_id", tenantId).eq("status", "open"));

        const [
          salesToday, salesYesterday, salesMonth, salesTrend, refundsToday, refundsYesterday,
          refundsMonth, refundsTrend, expenses, expensesByCategory, inventory, sessions,
          salesCount, customersCount,
        ] = await Promise.all([
          fetchAllRows((from, to) => salesTodayQ.order("created_at").range(from, to)),
          fetchAllRows((from, to) => salesYesterdayQ.order("created_at").range(from, to)),
          fetchAllRows((from, to) => salesMonthQ.order("created_at").range(from, to)),
          fetchAllRows((from, to) => salesTrendQ.order("created_at").range(from, to)),
          fetchAllRows((from, to) => refundsTodayQ.order("created_at").range(from, to)),
          fetchAllRows((from, to) => refundsYesterdayQ.order("created_at").range(from, to)),
          fetchAllRows((from, to) => refundsMonthQ.order("created_at").range(from, to)),
          fetchAllRows((from, to) => refundsTrendQ.order("created_at").range(from, to)),
          fetchAllRows((from, to) => expensesQ.order("paid_at").range(from, to)),
          fetchAllRows((from, to) => expensesByCategoryQ.order("paid_at").range(from, to)),
          fetchAllRows((from, to) => inventoryQ.order("product_id").range(from, to)),
          fetchAllRows((from, to) => sessionsQ.order("id").range(from, to)),
          scope(supabase.from("sales").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).neq("status", "void").gte("created_at", dayStart).lt("created_at", tomorrow)),
          supabase.from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        ]);
        if (salesCount.error) throw salesCount.error;
        if (customersCount.error) throw customersCount.error;

        const saleIds = salesMonth.map((row) => row.id);
        const refundIds = refundsMonth.map((row) => row.id);
        const saleCostGroups = await Promise.all(Array.from({ length: Math.ceil(saleIds.length / 100) }, (_, i) => saleIds.slice(i * 100, (i + 1) * 100))
          .map((ids) => ids.length ? fetchAllRows((from, to) => supabase.from("sale_items").select("quantity,cost_price_snapshot").eq("tenant_id", tenantId).in("sale_id", ids).range(from, to)) : Promise.resolve([])));
        const refundCostGroups = await Promise.all(Array.from({ length: Math.ceil(refundIds.length / 100) }, (_, i) => refundIds.slice(i * 100, (i + 1) * 100))
          .map((ids) => ids.length ? fetchAllRows((from, to) => supabase.from("sale_refund_items").select("quantity,cost_price_snapshot,restocked").eq("tenant_id", tenantId).in("refund_id", ids).range(from, to)) : Promise.resolve([])));
        const saleCosts = saleCostGroups.flat();
        const refundCosts = refundCostGroups.flat();
        const categories = await supabase.from("expense_categories").select("id,name,color").eq("tenant_id", tenantId);
        if (categories.error) throw categories.error;
        const categoryMap = new Map((categories.data ?? []).map((row) => [row.id, row]));

        const todayTotal = salesToday.reduce((sum, row) => sum + Number(row.total), 0) - refundsToday.reduce((sum, row) => sum + Number(row.total), 0);
        const yesterdayTotal = salesYesterday.reduce((sum, row) => sum + Number(row.total), 0) - refundsYesterday.reduce((sum, row) => sum + Number(row.total), 0);
        const monthTotal = salesMonth.reduce((sum, row) => sum + Number(row.total), 0) - refundsMonth.reduce((sum, row) => sum + Number(row.total), 0);
        const expenseTotal = expenses.reduce((sum, row) => sum + Number(row.amount), 0);
        const unknownCosts = saleCosts.filter((row) => row.cost_price_snapshot == null).length + refundCosts.filter((row) => row.restocked && row.cost_price_snapshot == null).length;
        const soldCost = saleCosts.reduce((sum, row) => sum + Number(row.cost_price_snapshot ?? 0) * Number(row.quantity), 0);
        const returnedCost = refundCosts.reduce((sum, row) => sum + (row.restocked ? Number(row.cost_price_snapshot ?? 0) * Number(row.quantity) : 0), 0);
        const revenueBeforeTax = salesMonth.reduce((sum, row) => sum + Number(row.subtotal) - Number(row.discount), 0) - refundsMonth.reduce((sum, row) => sum + Number(row.subtotal) - Number(row.discount), 0);
        const grossProfit = unknownCosts ? null : revenueBeforeTax - soldCost + returnedCost;
        const profit = grossProfit === null ? null : grossProfit - expenseTotal;

        const dayMap = new Map<string, number>();
        for (let i = 29; i >= 0; i--) dayMap.set(localDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)), 0);
        for (const row of salesTrend) { const key = localDayKey(new Date(row.created_at)); if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) + Number(row.total)); }
        for (const row of refundsTrend) { const key = localDayKey(new Date(row.created_at)); if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) - Number(row.total)); }
        const trend = Array.from(dayMap.entries()).map(([day, total]) => ({ day: day.slice(5), total: +total.toFixed(2) }));

        const catTotals = new Map<string, number>();
        for (const row of expensesByCategory) { const id = row.category_id ?? "other"; catTotals.set(id, (catTotals.get(id) ?? 0) + Number(row.amount)); }
        const palette = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];
        const byCat = Array.from(catTotals.entries()).map(([id, value], i) => ({ name: id === "other" ? "أخرى" : (categoryMap.get(id)?.name ?? "—"), value: +value.toFixed(2), color: categoryMap.get(id)?.color ?? palette[i % palette.length] }));

        const productIds = [...new Set(inventory.map((row) => row.product_id))];
        const productGroups = await Promise.all(Array.from({ length: Math.ceil(productIds.length / 100) }, (_, i) => productIds.slice(i * 100, (i + 1) * 100))
          .map((ids) => ids.length ? fetchAllRows((from, to) => supabase.from("products").select("id,min_stock").eq("tenant_id", tenantId).in("id", ids).range(from, to)) : Promise.resolve([])));
        const products = productGroups.flat();
        const minStock = new Map(products.map((row) => [row.id, Number(row.min_stock)]));
        if (minStock.size !== productIds.length) throw new Error("تعذر التحقق من حدود إعادة الطلب لجميع منتجات المخزون.");
        const lowStockCount = inventory.filter((row) => Number(row.quantity) <= (minStock.get(row.product_id) ?? 0)).length;

        return {
          totalToday: todayTotal, totalYesterday: yesterdayTotal, totalMonth: monthTotal, totalExpMonth: expenseTotal,
          profit, unknownCostItems: unknownCosts, salesTodayCount: salesCount.count ?? 0, customersCount: customersCount.count ?? 0,
          openSessions: sessions.length, lowStockCount, trend, byCat,
          salesChange: calculatePercentChange(todayTotal, yesterdayTotal),
          ordersChange: calculatePercentChange(salesCount.count ?? 0, salesYesterday.length),
          updatedAt: new Date().toISOString(), source: "live" as const,
        };
      };

      try {
        const fresh = await loadLiveStats();
        await writeOfflineCache(cacheKey, fresh);
        return fresh;
      } catch (error) {
        const value = error as { status?: number; code?: string };
        if (value?.status === 401 || value?.status === 403 || ["42501", "PGRST301"].includes(value?.code ?? "")) throw error;
        const cached = await readOfflineCache<any>(cacheKey, 12 * 60 * 60 * 1000);
        if (!cached) throw error;
        return { ...cached.data, source: "offline" as const, cachedAt: new Date(cached.savedAt).toISOString() };
      }
    },
    enabled: !!tenantId && !!user?.id && (hasPermission("sales.view") || hasPermission("reports.view") || hasPermission("customers.view") || hasPermission("kitchen.view")),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });


  const latestOrders = useQuery({
    queryKey: ["dashboard-latest-orders", tenantId, membership?.company_id, membership?.branch_id, isSuperOwner],
    queryFn: async () => {
      if (!tenantId) return [];
      let query = supabase.from("sales").select("id,invoice_no,total,status,created_at,order_type,customer_id")
        .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(8);
      if (!isSuperOwner && membership?.branch_id) {
        query = query.eq("branch_id", membership.branch_id);
      } else if (!isSuperOwner && membership?.company_id) {
        const { data: branches, error: branchError } = await supabase.from("branches").select("id")
          .eq("tenant_id", tenantId).eq("company_id", membership.company_id);
        if (branchError) throw branchError;
        query = query.in("branch_id", (branches ?? []).map((branch) => branch.id));
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId && hasPermission("sales.view"),
    refetchInterval: 15_000,
    staleTime: 5_000,
  });
  const kitchenOverview = useQuery({
    queryKey: ["dashboard-kitchen-overview", tenantId, membership?.company_id, membership?.branch_id, isSuperOwner],
    queryFn: async () => {
      if (!tenantId) return [];
      let query = (supabase.from("kitchen_orders" as any) as any).select("id,branch_id,sale_id,status,created_at")
        .eq("tenant_id", tenantId).in("status", ["new", "preparing", "ready"])
        .order("created_at", { ascending: false }).limit(12);
      if (!isSuperOwner && membership?.branch_id) {
        query = query.eq("branch_id", membership.branch_id);
      } else if (!isSuperOwner && membership?.company_id) {
        const { data: branches, error: branchError } = await supabase.from("branches").select("id")
          .eq("tenant_id", tenantId).eq("company_id", membership.company_id);
        if (branchError) throw branchError;
        query = query.in("branch_id", (branches ?? []).map((branch) => branch.id));
      }
      const { data, error } = await query;
      if (error) throw error;
      const orders = data ?? [];
      const saleIds: string[] = Array.from(new Set<string>((orders as Array<{ sale_id: string }>).map((order) => order.sale_id)));
      if (!saleIds.length) return [];
      const { data: salesRows, error: salesError } = await supabase.from("sales")
        .select("id,invoice_no").eq("tenant_id", tenantId).in("id", saleIds);
      if (salesError) throw salesError;
      const invoiceMap = new Map((salesRows ?? []).map((sale) => [sale.id, sale.invoice_no]));
      return orders.map((order: { id: string; branch_id: string; sale_id: string; status: string; created_at: string }) => ({
        ...order,
        invoice_no: invoiceMap.get(order.sale_id) ?? null,
      }));
    },
    enabled: !!tenantId && hasPermission("kitchen.view"),
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  const kitchenStatusCounts = useQuery({
    queryKey: ["dashboard-kitchen-counts", tenantId, membership?.company_id, membership?.branch_id, isSuperOwner],
    queryFn: async () => {
      if (!tenantId) return { new: 0, preparing: 0, ready: 0 };
      let scopedBranchIds: string[] | null = null;
      if (!isSuperOwner && membership?.branch_id) {
        scopedBranchIds = [membership.branch_id];
      } else if (!isSuperOwner && membership?.company_id) {
        const { data: branches, error } = await supabase.from("branches").select("id")
          .eq("tenant_id", tenantId).eq("company_id", membership.company_id);
        if (error) throw error;
        scopedBranchIds = (branches ?? []).map((branch) => branch.id);
      }
      const statuses = ["new", "preparing", "ready"] as const;
      const entries = await Promise.all(statuses.map(async (status) => {
        let query = (supabase.from("kitchen_orders" as any) as any)
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId).eq("status", status);
        if (scopedBranchIds !== null) query = query.in("branch_id", scopedBranchIds);
        const result = await query;
        if (result.error) throw result.error;
        return [status, result.count ?? 0] as const;
      }));
      return Object.fromEntries(entries) as Record<typeof statuses[number], number>;
    },
    enabled: !!tenantId && hasPermission("kitchen.view"),
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  const currency = tenant?.currency ?? "";

  return (
    <div className="space-y-6">
      <section className="relative isolate min-h-[205px] overflow-hidden rounded-2xl border border-[#d7e2f6] bg-[#102f5c] text-white shadow-[0_8px_24px_rgba(16,47,92,.16)] sm:min-h-[220px]" aria-labelledby="dashboard-welcome-title">
        <img src="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1800&q=85" alt="" className="absolute inset-0 h-full w-full object-cover opacity-75" />
        <div className="absolute inset-0 bg-gradient-to-l from-[#061c3d]/95 via-[#0c2d59]/80 to-[#102f5c]/5" />
        <div className="absolute inset-x-0 bottom-0 h-2 bg-gradient-to-l from-[#f0b52f] via-[#d9a441] to-transparent" />
        <div className="relative z-[1] flex min-h-[205px] flex-col justify-center px-6 py-7 sm:min-h-[220px] sm:px-10">
          <div className="max-w-2xl">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/90"><Sparkles className="h-4 w-4 text-[#f4c24f]" /> {tenant?.name ?? "مساحة إدارة المطعم"}</div>
            <h1 id="dashboard-welcome-title" className="text-2xl font-extrabold tracking-tight sm:text-4xl">أهلاً بك في نظام إدارة <span className="text-[#f5bd36]">المطاعم</span></h1>
            <p className="mt-3 text-base font-medium text-white/90 sm:text-xl">إدارة أسهل.. عمل أكثر كفاءة</p>
            <p className="mt-1 text-xs text-white/70">مرحباً {displayName}</p>
          </div>
          <Link to="/pos" className="mt-4 inline-flex min-h-10 w-fit items-center gap-2 rounded-full bg-[#f2b632] px-5 py-2 text-sm font-extrabold text-[#102f5c] shadow-md transition hover:bg-[#ffd16b]"><ShoppingBag className="h-4 w-4" /> فتح نقطة البيع <ArrowLeft className="h-4 w-4" /></Link>
        </div>
      </section>

      {campaignsQuery.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
          تعذر تحميل العروض والإعلانات. <button type="button" className="underline" onClick={() => campaignsQuery.refetch()}>إعادة المحاولة</button>
        </div>
      )}
      {activeCampaign && (
        <section aria-label="الإعلانات والعروض المنشورة" aria-roledescription="عرض شرائح" className="space-y-2">
          <div className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
            {activeCampaign.image_url && <img src={activeCampaign.image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />}
            <div className="relative flex min-h-36 items-center bg-gradient-to-l from-background/95 via-background/85 to-background/45 p-4 sm:min-h-44 sm:p-6">
              <div className="max-w-3xl space-y-2">
                <div className="text-xs font-semibold text-primary">إعلان / مساحة ترويجية</div>
                <h2 className="text-lg font-extrabold sm:text-2xl">{activeCampaign.title}</h2>
                {activeCampaign.description && <p className="text-sm text-muted-foreground sm:text-base">{activeCampaign.description}</p>}
                {safeCampaignTarget(activeCampaign.target_url) && <a href={safeCampaignTarget(activeCampaign.target_url)!} target="_blank" rel="noopener noreferrer" onClick={() => void (supabase.rpc as any)("record_marketing_campaign_event", { _campaign_id: activeCampaign.id, _event_type: "click" }).catch((error: unknown) => console.warn("Campaign click tracking failed", error))} className="inline-flex min-h-9 items-center rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90">عرض التفاصيل ←</a>}
              </div>
            </div>
          </div>
          {(campaignsQuery.data?.length ?? 0) > 1 && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5" aria-label={`الشريحة ${activeCampaignIndex + 1} من ${campaignsQuery.data?.length ?? 0}`}>
                {campaignsQuery.data?.map((campaign, index) => <button key={campaign.id} type="button" aria-label={`عرض الإعلان ${index + 1}`} aria-current={index === activeCampaignIndex ? "true" : undefined} onClick={() => setActiveCampaignIndex(index)} className={`h-2.5 rounded-full transition-all ${index === activeCampaignIndex ? "w-7 bg-primary" : "w-2.5 bg-muted-foreground/35"}`} />)}
              </div>
              <div className="flex items-center gap-1">
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="الإعلان السابق" onClick={() => setActiveCampaignIndex((current) => (current - 1 + (campaignsQuery.data?.length ?? 1)) % (campaignsQuery.data?.length ?? 1))}><ChevronRight className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={campaignRotationPaused ? "استئناف عرض الإعلانات" : "إيقاف حركة الإعلانات"} onClick={() => setCampaignRotationPaused((paused) => !paused)}>{campaignRotationPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</Button>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="الإعلان التالي" onClick={() => setActiveCampaignIndex((current) => (current + 1) % (campaignsQuery.data?.length ?? 1))}><ChevronLeft className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </section>
      )}

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

      {stats.isLoading ? (
        <div className="flex justify-center py-12" role="status" aria-live="polite"><Loader2 className="h-6 w-6 animate-spin text-primary" /><span className="sr-only">جارٍ تحميل مؤشرات لوحة التحكم</span></div>
      ) : stats.error ? (
        <Card role="alert" className="border-destructive/40">
          <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-destructive">تعذر تحميل بيانات لوحة التحكم</p>
              <p className="mt-1 text-sm text-muted-foreground">تحقق من الاتصال والصلاحيات، ثم أعد المحاولة. لم يتم عرض أرقام جزئية أو مضللة.</p>
            </div>
            <Button onClick={() => void stats.refetch()} disabled={stats.isFetching}>
              {stats.isFetching && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      ) : !stats.data ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">لا توجد مؤسسة نشطة مرتبطة بهذا الحساب لعرض المؤشرات.</CardContent></Card>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className={stats.data.source === "offline" ? "inline-flex items-center gap-1 text-amber-700" : "inline-flex items-center gap-1 text-emerald-700"}>
              {stats.data.source === "offline" ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
              {stats.data.source === "offline" ? "بيانات مخزنة محلياً — قد لا تشمل آخر التغييرات" : "بيانات مباشرة من قاعدة البيانات"}
            </span>
            <span>آخر تحديث: {new Date(stats.data.source === "offline" ? stats.data.cachedAt : stats.data.updatedAt).toLocaleString("ar", { dateStyle: "short", timeStyle: "short" })}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {hasPermission("sales.view") && <Kpi label="إجمالي مبيعات اليوم" value={`${formatMoney(stats.data.totalToday)} ${currency}`} sub={`${stats.data.salesTodayCount} طلباً`} change={stats.data.salesChange} icon={<Receipt className="h-5 w-5" />} tone="primary" to="/reports" />}
            {hasPermission("sales.view") && <Kpi label="عدد الطلبات" value={String(stats.data.salesTodayCount)} sub="طلبات اليوم غير الملغاة" change={stats.data.ordersChange} icon={<ClipboardList className="h-5 w-5" />} tone="success" to="/sales" />}
            {hasPermission("customers.view") && <Kpi label="عدد العملاء" value={String(stats.data.customersCount)} sub="على مستوى الشركة" icon={<UsersIcon className="h-5 w-5" />} tone="primary" to="/customers" />}
            {hasPermission("kitchen.view") && <Kpi label="قيد التحضير" value={String(kitchenStatusCounts.data?.preparing ?? "—")} sub="طلبات المطبخ الحالية" icon={<ChefHat className="h-5 w-5" />} tone="destructive" to="/kitchen" />}
            {hasPermission("reports.view") && <Kpi label="صافي مبيعات الشهر" value={`${formatMoney(stats.data.totalMonth)} ${currency}`} sub="بعد خصم المرتجعات المسجلة" icon={<TrendingUp className="h-5 w-5" />} tone="success" to="/reports" />}
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

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniStat label="ورديات مفتوحة" value={stats.data.openSessions} icon={<Wallet className="h-4 w-4" />} />
            <MiniStat label="نفاد مخزون" value={stats.data.lowStockCount} icon={<Package className="h-4 w-4" />} />
            {hasPermission("sales.view") && <MiniStat label="طلبات اليوم" value={stats.data.salesTodayCount} icon={<Receipt className="h-4 w-4" />} />}
            {hasPermission("customers.view") && <MiniStat label="إجمالي العملاء" value={stats.data.customersCount} icon={<UsersIcon className="h-4 w-4" />} />
          </div>
        </>
      )}
      {(hasPermission("sales.view") || hasPermission("kitchen.view")) && (
        <section className="grid gap-4 xl:grid-cols-2" aria-label="متابعة الطلبات والتشغيل">
          {hasPermission("sales.view") && <Card className="overflow-hidden border-[#dce5f3] shadow-sm"><CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-[#e7edf6] bg-gradient-to-l from-[#f4f7fc] to-white px-4 py-3"><div><h2 className="font-extrabold text-[#102f5c]">أحدث الفواتير والطلبات</h2><p className="mt-1 text-[11px] text-slate-500">آخر العمليات المسجلة ضمن نطاق الشركة والفرع المصرح به</p></div><Link to="/sales" className="rounded-full border border-[#dce5f3] bg-white px-3 py-1.5 text-xs font-bold text-[#174b91] hover:bg-blue-50">عرض الكل</Link></div>
            {latestOrders.isError ? <p role="alert" className="text-sm text-destructive">تعذر تحميل أحدث الطلبات. <button className="underline" onClick={() => void latestOrders.refetch()}>إعادة المحاولة</button></p>
              : latestOrders.isLoading ? <div className="py-6 text-center text-sm text-muted-foreground">جارٍ تحميل الطلبات...</div>
              : (latestOrders.data ?? []).length === 0 ? <div className="py-6 text-center text-sm text-muted-foreground">لا توجد طلبات مسجلة بعد.</div>
              : <div className="divide-y divide-[#edf1f7] px-4">{(latestOrders.data ?? []).map((order) => <div key={order.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#edf3fc] text-[#174b91]"><Receipt className="h-5 w-5" /></div><div className="min-w-0"><div className="truncate text-sm font-extrabold text-[#18375f]">فاتورة #{order.invoice_no ?? "—"}</div><div className="mt-1 text-[11px] text-slate-500">{new Intl.DateTimeFormat("ar-YE", { dateStyle: "short", timeStyle: "short" }).format(new Date(order.created_at))} · {order.order_type === "dine_in" ? "داخل المطعم" : order.order_type === "delivery" ? "توصيل" : "سفري"}</div></div></div>
                <div className="shrink-0 text-left"><div className="text-sm font-extrabold text-[#102f5c] num">{formatMoney(Number(order.total))} {currency}</div><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${order.status === "completed" ? "bg-emerald-50 text-emerald-700" : order.status === "void" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{order.status === "completed" ? "مكتملة" : order.status === "void" ? "ملغاة" : "قيد المعالجة"}</span></div>
              </div>)}</div>}
          </CardContent></Card>}
          {hasPermission("kitchen.view") && <Card className="overflow-hidden border-[#dce5f3] shadow-sm"><CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-[#e7edf6] bg-gradient-to-l from-[#f4f7fc] to-white px-4 py-3"><div><h2 className="font-extrabold text-[#102f5c]">حالة المطبخ</h2><p className="mt-1 text-[11px] text-slate-500">متابعة مراحل تجهيز الطلبات</p></div><Link to="/kitchen" className="rounded-full border border-[#dce5f3] bg-white px-3 py-1.5 text-xs font-bold text-[#174b91] hover:bg-blue-50">شاشة المطبخ</Link></div><div className="p-4">
            {kitchenOverview.isError || kitchenStatusCounts.isError ? <p role="alert" className="text-sm text-destructive">تعذر تحميل حالة المطبخ. <button className="underline" onClick={() => { void kitchenOverview.refetch(); void kitchenStatusCounts.refetch(); }}>إعادة المحاولة</button></p>
              : kitchenOverview.isLoading || kitchenStatusCounts.isLoading ? <div className="py-6 text-center text-sm text-muted-foreground">جارٍ تحميل حالة المطبخ...</div>
              : <><div className="grid grid-cols-3 gap-2">{(["new", "preparing", "ready"] as const).map((status) => <div key={status} className={`rounded-xl border p-3 text-center ${status === "new" ? "border-sky-100 bg-sky-50" : status === "preparing" ? "border-amber-100 bg-amber-50" : "border-emerald-100 bg-emerald-50"}`}><div className="text-2xl font-extrabold text-[#102f5c] num">{kitchenStatusCounts.data?.[status] ?? 0}</div><div className="mt-1 text-xs font-bold text-slate-600">{status === "new" ? "جديد" : status === "preparing" ? "قيد التحضير" : "جاهز"}</div></div>)}</div><div className="mt-3 divide-y divide-[#edf1f7]">{(kitchenOverview.data ?? []).slice(0, 4).map((order: { id: string; status: string; created_at: string; invoice_no?: number | null }) => <div key={order.id} className="flex items-center justify-between gap-2 py-2 text-xs"><span className="font-bold text-slate-700">طلب #{order.invoice_no ?? "—"}</span><span className={`rounded-full px-2 py-1 font-bold ${order.status === "new" ? "bg-sky-50 text-sky-700" : order.status === "preparing" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{order.status === "new" ? "جديد" : order.status === "preparing" ? "قيد التحضير" : "جاهز"}</span></div>)}</div></>}
            <p className="mt-3 text-[11px] text-slate-500">حالة التحضير مستقلة عن حالة الفاتورة والمدفوعات.</p></div>
          </CardContent></Card>}
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-3" aria-label="الإشعارات وحالة النظام والاختصارات">
        {hasPermission("notifications.view") && <Card className="overflow-hidden border-[#dce5f3] shadow-sm xl:col-span-2">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-[#e7edf6] bg-gradient-to-l from-[#f4f7fc] to-white px-4 py-3">
              <div className="flex items-center gap-2"><Bell className="h-5 w-5 text-[#174b91]" /><div><h2 className="font-extrabold text-[#102f5c]">آخر الإشعارات</h2><p className="mt-1 text-[11px] text-slate-500">تنبيهات الحساب والشركة</p></div></div>
              <Link to="/notifications" className="rounded-full border border-[#dce5f3] bg-white px-3 py-1.5 text-xs font-bold text-[#174b91] hover:bg-blue-50">كل الإشعارات</Link>
            </div>
            <div className="divide-y divide-[#edf1f7] px-4">
              {dashboardNotifications.isError ? <div role="alert" className="py-5 text-sm text-destructive">تعذر تحميل الإشعارات. <button className="underline" onClick={() => void dashboardNotifications.refetch()}>إعادة المحاولة</button></div>
                : dashboardNotifications.isLoading ? <div className="py-6 text-center text-sm text-muted-foreground">جارٍ تحميل الإشعارات...</div>
                : (dashboardNotifications.data ?? []).length === 0 ? <div className="py-6 text-center text-sm text-muted-foreground">لا توجد إشعارات حالياً.</div>
                : (dashboardNotifications.data ?? []).map((item) => <div key={item.id} className="flex items-start gap-3 py-3"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.isRead ? "bg-slate-300" : "bg-amber-500"}`} /><div className="min-w-0 flex-1"><div className={`text-sm ${item.isRead ? "font-medium text-slate-600" : "font-extrabold text-[#18375f]"}`}>{item.title}</div>{item.body && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.body}</p>}<div className="mt-1 text-[10px] text-slate-400">{new Date(item.created_at).toLocaleString("ar-YE")}</div></div>{!item.isRead && <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">جديد</span>}</div>)}
            </div>
          </CardContent>
        </Card>}
        <Card className="overflow-hidden border-[#dce5f3] shadow-sm">
          <CardContent className="p-0">
            <div className="border-b border-[#e7edf6] bg-gradient-to-l from-[#f4f7fc] to-white px-4 py-3">
              <div className="flex items-center gap-2"><Wifi className="h-5 w-5 text-[#174b91]" /><h2 className="font-extrabold text-[#102f5c]">حالة النظام</h2></div>
              <p className="mt-1 text-[11px] text-slate-500">فحص فعلي لقاعدة البيانات ونطاق الشركة والصلاحيات والملف الشخصي</p>
            </div>
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-700">الحالة العامة</span>
                {systemStatusQuery.isLoading || !systemStatusQuery.data
                  ? <span className="text-xs text-slate-500">لم يكتمل التحقق</span>
                  : systemStatusQuery.isError || systemStatusQuery.data.overall === "degraded"
                    ? <span className="rounded-full bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700">يحتاج مراجعة</span>
                    : systemStatusQuery.data.overall === "healthy"
                      ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">سليم — تم اجتياز الفحوصات</span>
                      : <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">تحقق جزئي — توجد ملاحظات</span>}
              </div>
              {systemStatusQuery.isError && <p role="alert" className="text-xs text-destructive">{systemStatusQuery.error instanceof Error ? systemStatusQuery.error.message : "تعذر إكمال فحص النظام."}</p>}
              {(systemStatusQuery.data?.checks ?? []).map((check) => (
                <div key={check.key} className="flex items-start justify-between gap-3 border-t border-slate-100 pt-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-700">{check.label}</div>
                    <div className="mt-0.5 break-words text-[10px] text-slate-500">{check.detail}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${check.status === "ok" ? "bg-emerald-50 text-emerald-700" : check.status === "warning" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>
                    {check.status === "ok" ? "ناجح" : check.status === "warning" ? "ملاحظة" : "فشل"}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
                <span>آخر تحقق</span><span>{systemStatusQuery.data?.checkedAt ? new Date(systemStatusQuery.data.checkedAt).toLocaleTimeString("ar-YE") : "—"}</span>
              </div>
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => void systemStatusQuery.refetch()} disabled={systemStatusQuery.isFetching}>
                {systemStatusQuery.isFetching && <Loader2 className="ml-2 h-3.5 w-3.5 animate-spin" />}إعادة فحص النظام
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="اختصارات العمل">
        {hasPermission("sales.create") && <Link to="/pos" className="group flex items-center gap-3 rounded-xl border border-[#dce5f3] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b8cce9] hover:shadow-md"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#edf3fc] text-[#174b91]"><ShoppingBag className="h-5 w-5" /></span><span><span className="block text-sm font-extrabold text-[#102f5c]">نقطة البيع</span><span className="mt-1 block text-xs text-slate-500">إنشاء فاتورة جديدة</span></span></Link>}
        {hasPermission("sales.view") && <Link to="/sales" className="group flex items-center gap-3 rounded-xl border border-[#dce5f3] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b8cce9] hover:shadow-md"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#edf3fc] text-[#174b91]"><Receipt className="h-5 w-5" /></span><span><span className="block text-sm font-extrabold text-[#102f5c]">الفواتير</span><span className="mt-1 block text-xs text-slate-500">عرض وإدارة المبيعات</span></span></Link>}
        {hasPermission("kitchen.view") && <Link to="/kitchen" className="group flex items-center gap-3 rounded-xl border border-[#dce5f3] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b8cce9] hover:shadow-md"><span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-50 text-amber-700"><ChefHat className="h-5 w-5" /></span><span><span className="block text-sm font-extrabold text-[#102f5c]">المطبخ</span><span className="mt-1 block text-xs text-slate-500">متابعة تجهيز الطلبات</span></span></Link>}
        {hasPermission("reports.view") && <Link to="/reports" className="group flex items-center gap-3 rounded-xl border border-[#dce5f3] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#b8cce9] hover:shadow-md"><span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><ClipboardList className="h-5 w-5" /></span><span><span className="block text-sm font-extrabold text-[#102f5c]">التقارير</span><span className="mt-1 block text-xs text-slate-500">تحليل أداء المطعم</span></span></Link>}
      </section>

    </div>
  );
}

function Kpi({ label, value, sub, icon, tone, change, to }: { label: string; value: string; sub?: string; icon: React.ReactNode; tone: "primary" | "success" | "destructive"; change?: number | null; to?: "/reports" | "/sales" | "/customers" | "/kitchen" }) {
  const bg = tone === "success" ? "bg-success/15 text-success" : tone === "destructive" ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary";
  const content = (
    <Card className={to ? "h-full transition hover:-translate-y-0.5 hover:shadow-md" : "h-full"}>
      <CardContent className="flex h-full items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 text-xl font-extrabold num sm:text-2xl">{value}</div>
          {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
          {change !== undefined && <div className={`mt-2 inline-flex items-center gap-1 text-xs font-bold ${change === null ? "text-muted-foreground" : change >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {change === null ? "لا تتوفر مقارنة" : <>{change >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}{change > 0 ? "+" : ""}{change.toFixed(1)}% مقارنة بالأمس</>}
          </div>}
        </div>
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${bg}`}>{icon}</div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to} className="block h-full rounded-xl focus-visible:outline-none">{content}</Link> : content;
}
function MiniStat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card><CardContent className="flex items-center gap-3 p-4">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-muted-foreground">{icon}</div>
      <div><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-bold num">{value}</div></div>
    </CardContent></Card>
  );
}
