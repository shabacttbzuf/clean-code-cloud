import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { formatMoney } from "@/lib/format";
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
  const navigate = useNavigate();
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
  const canViewReports = isSuperOwner || permissionsQuery.data?.has("reports.view") === true;
  const canViewSalesReports = isSuperOwner || permissionsQuery.data?.has("sales.view") === true;
  const canViewExpenses = isSuperOwner || permissionsQuery.data?.has("expenses.view") === true;
  const canViewCash = isSuperOwner || permissionsQuery.data?.has("cash.view") === true;
  const canViewPurchases = isSuperOwner || permissionsQuery.data?.has("purchases.view") === true;
  const canViewInventory = isSuperOwner || permissionsQuery.data?.has("inventory.view") === true;
  const canViewEmployees = isSuperOwner || permissionsQuery.data?.has("hr.employees.view") === true;
  const canViewAttendance = isSuperOwner || permissionsQuery.data?.has("hr.attendance.view") === true;
  const canManagePromotions = isSuperOwner || permissionsQuery.data?.has("promotions.manage") === true;
  const canManageAds = isSuperOwner || permissionsQuery.data?.has("ads.manage") === true;
  const canViewFinancialReports = canViewExpenses;
  const canExportReports = isSuperOwner || permissionsQuery.data?.has("reports.export") === true;
  const canFilterReports = isSuperOwner || permissionsQuery.data?.has("reports.filter") === true;
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return localDateKey(d);
  });
  const [to, setTo] = useState(() => localDateKey(new Date()));
  const [groupBy, setGroupBy] = useState<"day" | "month" | "year">("day");
  const [companyId, setCompanyId] = useState(membership?.company_id ?? "all");
  const [branchId, setBranchId] = useState("all");
  const companiesQuery = useQuery({
    queryKey: ["report-companies", tenantId, userId, isSuperOwner, membership?.company_id],
    queryFn: async () => {
      if (!tenantId) return [];
      let query = supabase.from("companies").select("id,name").eq("tenant_id", tenantId).order("name");
      if (!isSuperOwner && membership?.company_id) query = query.eq("id", membership.company_id);
      else if (!isSuperOwner) return [];
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });
  useEffect(() => {
    if (!isSuperOwner && membership?.company_id && companyId !== membership.company_id) setCompanyId(membership.company_id);
  }, [isSuperOwner, membership?.company_id, companyId]);
  const branchesQuery = useQuery({ queryKey: ["report-branches", tenantId, companyId, membership?.company_id, membership?.branch_id, isSuperOwner],
    queryFn: async () => {
      if (!isSuperOwner && !membership?.branch_id && !membership?.company_id) return [];
      let query = supabase.from("branches").select("id,name").eq("tenant_id", tenantId!).order("name");
      if (!isSuperOwner && membership?.branch_id) query = query.eq("id", membership.branch_id);
      else if (companyId !== "all") query = query.eq("company_id", companyId);
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
    queryKey: ["reports", tenantId, userId, membership?.company_id, membership?.branch_id, companyId, isSuperOwner, canViewFinancialReports, from, to, branchId],
    queryFn: async () => {
      if (!tenantId) return null;
      if (!canViewReports) throw new Error("ليس لديك صلاحية عرض التقارير.");
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

      const [sales, expenses, sessions, inventory, purchases, employees, campaigns, campaignEvents, promotions, redemptions, refunds] = await Promise.all([
        canViewSalesReports ? fetchAllRows((pageFrom, pageTo) => {
          let query = supabase.from("sales")
            .select("id, created_at, total, subtotal, discount, tax_amount, payment_method, cashier_id, branch_id, status")
            .eq("tenant_id", tenantId).neq("status", "void")
            .gte("created_at", fromDate).lte("created_at", toDate);
          if (branchId !== "all") query = query.eq("branch_id", branchId);
          else if (!isSuperOwner || companyId !== "all") query = query.in("branch_id", (branchesQuery.data ?? []).map((branch) => branch.id));
          return query.order("created_at", { ascending: false }).range(pageFrom, pageTo);
        }) : Promise.resolve([]),
        canViewExpenses ? fetchAllRows((pageFrom, pageTo) => {
          let query = supabase.from("expenses")
            .select("id, paid_at, amount, category_id, description, branch_id")
            .eq("tenant_id", tenantId).gte("paid_at", from).lte("paid_at", to);
          if (branchId !== "all") query = query.eq("branch_id", branchId);
          else if (!isSuperOwner || companyId !== "all") query = query.in("branch_id", (branchesQuery.data ?? []).map((branch) => branch.id));
          return query.order("paid_at", { ascending: false }).range(pageFrom, pageTo);
        }) : Promise.resolve([]),
        canViewCash ? fetchAllRows((pageFrom, pageTo) => {
          let query = supabase.from("cash_sessions")
            .select("cashier_id, opening_balance, closing_balance, expected_cash, cash_difference, opened_at, closed_at, status, branch_id")
            .eq("tenant_id", tenantId).gte("opened_at", fromDate).lte("opened_at", toDate);
          if (branchId !== "all") query = query.eq("branch_id", branchId);
          else if (!isSuperOwner || companyId !== "all") query = query.in("branch_id", (branchesQuery.data ?? []).map((branch) => branch.id));
          return query.range(pageFrom, pageTo);
        }) : Promise.resolve([]),
        canViewInventory ? fetchAllRows((pageFrom, pageTo) => {
          let query = supabase.from("inventory")
            .select("quantity, product_id, branch_id").eq("tenant_id", tenantId);
          if (branchId !== "all") query = query.eq("branch_id", branchId);
          else if (!isSuperOwner || companyId !== "all") query = query.in("branch_id", (branchesQuery.data ?? []).map((branch) => branch.id));
          return query.range(pageFrom, pageTo);
        }) : Promise.resolve([]),
        canViewPurchases ? fetchAllRows((pageFrom, pageTo) => {
          let query = supabase.from("purchases")
            .select(canViewFinancialReports ? "id, branch_id, received_at, total, status, supplier_id, reference" : "id, branch_id, received_at, status, supplier_id, reference")
            .eq("tenant_id", tenantId).gte("received_at", fromDate).lte("received_at", toDate);
          if (branchId !== "all") query = query.eq("branch_id", branchId);
          else if (!isSuperOwner || companyId !== "all") query = query.in("branch_id", (branchesQuery.data ?? []).map((branch) => branch.id));
          return query.order("received_at", { ascending: false }).range(pageFrom, pageTo);
        }) : Promise.resolve([]),
        canViewEmployees ? fetchAllRows((pageFrom, pageTo) => {
          let query = supabase.from("employees")
            .select("id, full_name, branch_id, status")
            .eq("tenant_id", tenantId);
          if (branchId !== "all") query = query.eq("branch_id", branchId);
          else if (!isSuperOwner || companyId !== "all") query = query.in("branch_id", (branchesQuery.data ?? []).map((branch) => branch.id));
          return query.order("full_name").range(pageFrom, pageTo);
        }) : Promise.resolve([]),
        canManageAds ? fetchAllRows((pageFrom, pageTo) => {
          let query = supabase.from("marketing_campaigns")
            .select("id, title, status, company_id, starts_at, ends_at")
            .eq("tenant_id", tenantId);
          if (companyId !== "all") query = query.eq("company_id", companyId);
          else if (!isSuperOwner && membership?.company_id) query = query.eq("company_id", membership.company_id);
          else if (!isSuperOwner) return [];
          return query.order("created_at", { ascending: false }).range(pageFrom, pageTo);
        }) : Promise.resolve([]),
        canManageAds ? fetchAllRows((pageFrom, pageTo) => {
          let query = (supabase as any).from("marketing_campaign_events")
            .select("campaign_id, event_type, event_day, company_id")
            .eq("tenant_id", tenantId).gte("event_day", from).lte("event_day", to);
          if (companyId !== "all") query = query.eq("company_id", companyId);
          else if (!isSuperOwner && membership?.company_id) query = query.eq("company_id", membership.company_id);
          else if (!isSuperOwner) return [];
          if (branchId !== "all") return [];
          return query.range(pageFrom, pageTo);
        }) : Promise.resolve([]),
        canManagePromotions ? fetchAllRows((pageFrom, pageTo) => {
          let query = (supabase as any).from("promotional_offers")
            .select("id, name, status, company_id, branch_id")
            .eq("tenant_id", tenantId);
          if (companyId !== "all") query = query.eq("company_id", companyId);
          else if (!isSuperOwner && membership?.company_id) query = query.eq("company_id", membership.company_id);
          else if (!isSuperOwner) return [];
          if (branchId !== "all") query = query.or("branch_id.is.null,branch_id.eq." + branchId);
          return query.range(pageFrom, pageTo);
        }) : Promise.resolve([]),
        canManagePromotions ? fetchAllRows((pageFrom, pageTo) => {
          let query = (supabase as any).from("promotion_redemptions")
            .select(canViewFinancialReports ? "promotion_id, discount_amount, branch_id, created_at, company_id" : "promotion_id, branch_id, created_at, company_id")
            .eq("tenant_id", tenantId).gte("created_at", fromDate).lte("created_at", toDate);
          if (companyId !== "all") query = query.eq("company_id", companyId);
          else if (!isSuperOwner && membership?.company_id) query = query.eq("company_id", membership.company_id);
          else if (!isSuperOwner) return [];
          if (branchId !== "all") query = query.eq("branch_id", branchId);
          else if (!isSuperOwner || companyId !== "all") query = query.in("branch_id", (branchesQuery.data ?? []).map((branch) => branch.id));
          return query.range(pageFrom, pageTo);
        }) : Promise.resolve([]),
        canViewSalesReports ? fetchAllRows((pageFrom, pageTo) => {
          let query = supabase.from("sale_refunds")
            .select("id, sale_id, subtotal, discount, tax_amount, total, refund_method, created_at, branch_id")
            .eq("tenant_id", tenantId).gte("created_at", fromDate).lte("created_at", toDate);
          if (branchId !== "all") query = query.eq("branch_id", branchId);
          else if (!isSuperOwner || companyId !== "all") query = query.in("branch_id", (branchesQuery.data ?? []).map((branch) => branch.id));
          return query.range(pageFrom, pageTo);
        }) : Promise.resolve([]),
      ]);

      const validSales = sales.filter((row) => row.status !== "void");
      const employeeIds = new Set(employees.map((employee) => employee.id));
      const attendance = canViewAttendance && employeeIds.size ? await fetchAllRows((pageFrom, pageTo) => supabase.from("attendance")
        .select("employee_id, date, status, hours_worked, is_late, late_minutes")
        .eq("tenant_id", tenantId).gte("date", from).lte("date", to)
        .in("employee_id", [...employeeIds]).range(pageFrom, pageTo)) : [];
      const saleIds = new Set(validSales.map((sale) => sale.id));
      const saleIdGroups = Array.from({ length: Math.ceil(saleIds.size / 100) }, (_, index) => [...saleIds].slice(index * 100, (index + 1) * 100));
      const itemGroups = await Promise.all(saleIdGroups.map((ids) => fetchAllRows((pageFrom, pageTo) =>
        supabase.from("sale_items")
          .select(canViewFinancialReports ? "product_name, quantity, line_total, sale_id, cost_price_snapshot" : "product_name, quantity, line_total, sale_id")
          .eq("tenant_id", tenantId).in("sale_id", ids).range(pageFrom, pageTo))));
      const validItems = itemGroups.flat();
      const refundIds = refunds.map((refund) => refund.id);
      const refundItemGroups = await Promise.all(
        Array.from({ length: Math.ceil(refundIds.length / 100) }, (_, index) => refundIds.slice(index * 100, (index + 1) * 100))
          .map((ids) => fetchAllRows((pageFrom, pageTo) => supabase.from("sale_refund_items")
            .select(canViewFinancialReports ? "refund_id, product_name, quantity, subtotal_amount, discount_amount, tax_amount, restocked, cost_price_snapshot" : "refund_id, product_name, quantity, subtotal_amount, discount_amount, tax_amount, restocked")
            .in("refund_id", ids).range(pageFrom, pageTo))),
      );
      const refundItems = refundItemGroups.flat();

      const inventoryProductIds = [...new Set(inventory.map((row) => row.product_id))];
      const productGroups = await Promise.all(
        Array.from({ length: Math.ceil(inventoryProductIds.length / 100) }, (_, index) => inventoryProductIds.slice(index * 100, (index + 1) * 100))
          .map((ids) => fetchAllRows((pageFrom, pageTo) => supabase.from("products")
            .select(canViewFinancialReports ? "id, name, sku, cost_price, min_stock" : "id, name, sku, min_stock").eq("tenant_id", tenantId)
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
        canViewSalesReports ? fetchAllRows((pageFrom, pageTo) => {
          let query = supabase.from("sales").select("id,total")
            .eq("tenant_id", tenantId).neq("status", "void")
            .gte("created_at", previousFrom).lte("created_at", previousTo);
          if (branchId !== "all") query = query.eq("branch_id", branchId);
          else if (!isSuperOwner || companyId !== "all") query = query.in("branch_id", (branchesQuery.data ?? []).map((branch) => branch.id));
          return query.range(pageFrom, pageTo);
        }) : Promise.resolve([]),
        canViewExpenses ? fetchAllRows((pageFrom, pageTo) => {
          let query = supabase.from("expenses").select("amount")
            .eq("tenant_id", tenantId)
            .gte("paid_at", previousFromDay).lte("paid_at", previousToDay);
          if (branchId !== "all") query = query.eq("branch_id", branchId);
          else if (!isSuperOwner || companyId !== "all") query = query.in("branch_id", (branchesQuery.data ?? []).map((branch) => branch.id));
          return query.range(pageFrom, pageTo);
        }) : Promise.resolve([]),
        canViewSalesReports ? fetchAllRows((pageFrom, pageTo) => {
          let query = supabase.from("sale_refunds").select("total")
            .eq("tenant_id", tenantId)
            .gte("created_at", previousFrom).lte("created_at", previousTo);
          if (branchId !== "all") query = query.eq("branch_id", branchId);
          else if (!isSuperOwner || companyId !== "all") query = query.in("branch_id", (branchesQuery.data ?? []).map((branch) => branch.id));
          return query.range(pageFrom, pageTo);
        }) : Promise.resolve([]),
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
        purchases,
        employees,
        attendance,
        campaigns,
        campaignEvents,
        promotions,
        redemptions,
        refunds,
        refundItems,
        previousPeriod,
      };
    },
    enabled: !!tenantId && !permissionsQuery.isLoading && canViewReports && !branchesQuery.isLoading,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const data = report.data;
  const safe = useMemo(() => {
    const raw = data ?? { sales: [] as any[], expenses: [] as any[], items: [] as any[], sessions: [] as any[], inventory: [] as any[], inventoryProducts: [] as any[], purchases: [] as any[], employees: [] as any[], attendance: [] as any[], campaigns: [] as any[], campaignEvents: [] as any[], promotions: [] as any[], redemptions: [] as any[], refunds: [] as any[], refundItems: [] as any[] };
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
      purchases: raw.purchases.filter((row: any) => row.branch_id === branchId),
      employees: raw.employees.filter((row: any) => row.branch_id === branchId),
      attendance: raw.attendance.filter((row: any) => raw.employees.some((employee: any) => employee.id === row.employee_id && employee.branch_id === branchId)),
      inventory: raw.inventory.filter((row: any) => row.branch_id === branchId),
      items: raw.items.filter((row: any) => saleIds.has(row.sale_id)),
      refundItems: raw.refundItems.filter((row: any) => refundIds.has(row.refund_id)),
      campaigns: raw.campaigns,
      campaignEvents: raw.campaignEvents,
      promotions: raw.promotions.filter((row: any) => row.branch_id == null || row.branch_id === branchId),
      redemptions: raw.redemptions.filter((row: any) => row.branch_id === branchId),
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

  const cashTotals = useMemo(() => ({
    closed: safe.sessions.filter((row: any) => row.status === "closed").length,
    difference: safe.sessions.reduce((sum: number, row: any) => sum + Number(row.cash_difference ?? 0), 0),
  }), [safe.sessions]);
  const employeeAttendanceStats = useMemo(() => {
    const byEmployee = new Map<string, { days: number; hours: number; late: number }>();
    for (const row of safe.attendance) {
      const current = byEmployee.get(row.employee_id) ?? { days: 0, hours: 0, late: 0 };
      current.days += 1;
      current.hours += Number(row.hours_worked ?? 0);
      if (row.is_late) current.late += 1;
      byEmployee.set(row.employee_id, current);
    }
    return safe.employees.map((employee: any) => ({
      id: employee.id,
      name: employee.full_name,
      status: employee.status,
      ...(byEmployee.get(employee.id) ?? { days: 0, hours: 0, late: 0 }),
    }));
  }, [safe.employees, safe.attendance]);

  const purchaseTotals = useMemo(() => ({
    count: safe.purchases.length,
    total: safe.purchases.filter((row: any) => row.status !== "cancelled" && row.status !== "void").reduce((sum: number, row: any) => sum + Number(row.total ?? 0), 0),
  }), [safe.purchases]);
  const staffTotals = useMemo(() => ({
    employees: safe.employees.length,
    attendance: safe.attendance.length,
    late: safe.attendance.filter((row: any) => row.is_late).length,
    hours: safe.attendance.reduce((sum: number, row: any) => sum + Number(row.hours_worked ?? 0), 0),
  }), [safe.employees, safe.attendance]);
  const campaignTotals = useMemo(() => ({
    total: safe.campaigns.length,
    active: safe.campaigns.filter((row: any) => row.status === "active").length,
    impressions: safe.campaignEvents.filter((row: any) => row.event_type === "impression").length,
    clicks: safe.campaignEvents.filter((row: any) => row.event_type === "click").length,
  }), [safe.campaigns, safe.campaignEvents]);
  const promotionTotals = useMemo(() => ({
    offers: safe.promotions.length,
    redemptions: safe.redemptions.length,
    discount: safe.redemptions.reduce((sum: number, row: any) => sum + Number(row.discount_amount ?? 0), 0),
  }), [safe.promotions, safe.redemptions]);
  const branchStats = useMemo(() => {
    const map = new Map<string, { id: string; name: string; invoices: number; revenue: number }>();
    const names = new Map((branchesQuery.data ?? []).map((branch) => [branch.id, branch.name]));
    for (const sale of safe.sales) {
      const row = map.get(sale.branch_id) ?? { id: sale.branch_id, name: names.get(sale.branch_id) ?? "فرع غير محدد", invoices: 0, revenue: 0 };
      row.invoices += 1;
      row.revenue += Number(sale.total ?? 0);
      map.set(sale.branch_id, row);
    }
    for (const refund of safe.refunds) {
      const row = map.get(refund.branch_id);
      if (row) row.revenue -= Number(refund.total ?? 0);
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue);
  }, [safe.sales, safe.refunds, branchesQuery.data]);

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

  const chartMax = Math.max(1, ...groupedSales.map(([, row]) => Math.max(row.sales, row.expenses)));

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

  if (permissionsQuery.isError) {
    return <div className="space-y-6"><PageHeader title="التقارير" subtitle="تعذر التحقق من صلاحيات الوصول." /><Card><CardContent className="p-6 text-center text-sm text-destructive" role="alert">تعذر التحقق من صلاحياتك. أعد المحاولة قبل عرض أي بيانات.</CardContent></Card><Button variant="outline" onClick={() => void permissionsQuery.refetch()}>إعادة المحاولة</Button></div>;
  }

  if (permissionsQuery.isLoading || (isSuperOwner === false && !permissionsQuery.data)) {
    return <div className="space-y-6"><PageHeader title="التقارير" subtitle="جارٍ التحقق من صلاحيات الوصول..." /><div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div></div>;
  }

  if (!canViewReports) {
    return <div className="space-y-6"><PageHeader title="التقارير" subtitle="الوصول إلى التقارير محمي بالصلاحيات." /><Card><CardContent className="p-6 text-center text-sm text-muted-foreground" role="alert">ليس لديك صلاحية عرض التقارير. تواصل مع مسؤول الشركة لمنحك الصلاحية المناسبة.</CardContent></Card></div>;
  }

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
        action={canExportReports ? <Button variant="outline" className="print:hidden" onClick={() => window.print()}><Printer className="ml-2 h-4 w-4" />طباعة التقرير</Button> : undefined}
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
            {isSuperOwner && <div className="space-y-2 sm:w-48">
              <Label className="text-xs">تصفية حسب الشركة</Label>
              <Select value={companyId} onValueChange={(value) => { setCompanyId(value); setBranchId("all"); }} disabled={!canFilterReports}>
                <SelectTrigger><SelectValue placeholder="كل الشركات" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الشركات</SelectItem>
                  {(companiesQuery.data ?? []).map((company) => <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>}
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
        {canViewSalesReports && <Kpi icon={<TrendingUp className="h-5 w-5" />} label="المبيعات بعد المرتجعات" value={`${formatMoney(totals.salesTotal)} ${tenant?.currency ?? ""}`} tone="primary" />}
        {canViewFinancialReports && <Kpi icon={<Wallet className="h-5 w-5" />} label="المصروفات" value={`${formatMoney(totals.expensesTotal)} ${tenant?.currency ?? ""}`} tone="destructive" />}
        {canViewFinancialReports && <Kpi icon={<Package className="h-5 w-5" />} label="تكلفة البضاعة" value={profitMetrics.costOfGoods === null ? "غير مكتملة" : `${formatMoney(profitMetrics.costOfGoods)} ${tenant?.currency ?? ""}`} tone="primary" />}
        {canViewFinancialReports && <Kpi icon={<FileText className="h-5 w-5" />} label="مجمل الربح" value={profitMetrics.grossProfit === null ? "غير متاح" : `${formatMoney(profitMetrics.grossProfit)} ${tenant?.currency ?? ""}`} tone={profitMetrics.grossProfit !== null && profitMetrics.grossProfit >= 0 ? "success" : "destructive"} />}
        {canViewFinancialReports && <Kpi icon={<Wallet className="h-5 w-5" />} label="صافي الربح التشغيلي" value={profitMetrics.netProfit === null ? "غير متاح" : `${formatMoney(profitMetrics.netProfit)} ${tenant?.currency ?? ""}`} tone={profitMetrics.netProfit !== null && profitMetrics.netProfit >= 0 ? "success" : "destructive"} />}
        {canViewSalesReports && <Kpi icon={<Users className="h-5 w-5" />} label="عدد الفواتير" value={String(safe.sales.length)} tone="primary" />}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-card px-4 py-3 text-xs">
        <span className="font-semibold text-foreground">مقارنة بالفترة السابقة المماثلة:</span>
        {([
          ...(canViewSalesReports ? [["المبيعات", comparison.sales] as [string, number | null]] : []),
          ...(canViewFinancialReports ? [["المصروفات", comparison.expenses] as [string, number | null]] : []),
          ["الفواتير", comparison.invoices],
        ] as Array<[string, number | null]>).map(([label, change]) => (
          <span key={label} className="text-muted-foreground">
            {label}: <strong className={change === null ? "text-muted-foreground" : change >= 0 ? "text-success" : "text-destructive"}>
              {change === null ? "لا توجد قاعدة مقارنة" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`}
            </strong>
          </span>
        ))}
      </div>
      {canViewFinancialReports && profitMetrics.unknownCostItems > 0 && (
        <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-300">
          لا يمكن اعتماد الربحية بدقة: توجد {profitMetrics.unknownCostItems} بنود بيع أو مرتجعات مستردة بلا تكلفة محفوظة وقت البيع. لم يتم تقديرها من سعر المنتج الحالي.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {canViewPurchases && <Kpi icon={<Package className="h-5 w-5" />} label="المشتريات خلال الفترة" value={String(purchaseTotals.count)} tone="primary" />}
        {canViewFinancialReports && <Kpi icon={<Wallet className="h-5 w-5" />} label="إجمالي قيمة المشتريات" value={formatMoney(purchaseTotals.total)} tone="primary" />}
        {canViewCash && <Kpi icon={<Wallet className="h-5 w-5" />} label="فروقات إغلاق الصندوق" value={formatMoney(cashTotals.difference)} tone={cashTotals.difference === 0 ? "success" : "destructive"} />}
        {canViewEmployees && <Kpi icon={<Users className="h-5 w-5" />} label="الموظفون ضمن النطاق" value={String(staffTotals.employees)} tone="primary" />}
        {canViewAttendance && <Kpi icon={<Users className="h-5 w-5" />} label="سجلات الحضور" value={String(staffTotals.attendance)} tone="primary" />}
        {canViewAttendance && <Kpi icon={<Users className="h-5 w-5" />} label="حالات التأخر المسجلة" value={String(staffTotals.late)} tone={staffTotals.late ? "destructive" : "success"} />}
        {canManageAds && <Kpi icon={<FileText className="h-5 w-5" />} label="الحملات والإعلانات" value={branchId === "all" ? campaignTotals.active + " نشطة · " + campaignTotals.impressions + " ظهور · " + campaignTotals.clicks + " نقرة" : campaignTotals.total + " حملة على مستوى الشركة"} tone="primary" />}
        {canManagePromotions && <Kpi icon={<FileText className="h-5 w-5" />} label="العروض والاستردادات" value={promotionTotals.offers + " عرض · " + promotionTotals.redemptions + " استخدام" + (canViewFinancialReports ? " · خصومات " + formatMoney(promotionTotals.discount) : "")} tone="primary" />}
      </div>

      {canViewPurchases && <Card><CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">تفاصيل المشتريات</h3><Button size="sm" variant="outline" onClick={() => navigate({ to: "/purchases" })}>فتح المشتريات</Button></div>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead className="bg-muted/50 text-right"><tr><th className="p-2">التاريخ</th><th className="p-2">المرجع</th><th className="p-2">الفرع</th><th className="p-2">الحالة</th>{canViewFinancialReports && <th className="p-2">الإجمالي</th>}</tr></thead>
          <tbody>{safe.purchases.slice(0, 100).map((purchase: any) => <tr key={purchase.id} className="border-t">
            <td className="p-2">{new Date(purchase.received_at).toLocaleDateString("ar-EG")}</td><td className="p-2">{purchase.reference || "—"}</td>
            <td className="p-2">{(branchesQuery.data ?? []).find((branch) => branch.id === purchase.branch_id)?.name ?? "—"}</td>
            <td className="p-2">{purchase.status}</td>{canViewFinancialReports && <td className="p-2 num font-semibold">{formatMoney(purchase.total ?? 0)}</td>}
          </tr>)}
          {safe.purchases.length === 0 && <tr><td colSpan={canViewFinancialReports ? 5 : 4} className="p-6 text-center text-muted-foreground">لا توجد مشتريات في الفترة المحددة.</td></tr>}</tbody>
        </table></div>
      </CardContent></Card>}

      {canViewSalesReports && <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">مقارنة أداء الفروع</h3><Button size="sm" variant="outline" onClick={() => navigate({ to: "/branches" })}>إدارة الفروع</Button></div>
          {branchStats.length ? <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="bg-muted/50 text-right"><tr><th className="p-2">الفرع</th><th className="p-2">الفواتير</th><th className="p-2">المبيعات بعد المرتجعات</th></tr></thead>
            <tbody>{branchStats.map((branch) => <tr key={branch.id} className="border-t"><td className="p-2 font-medium">{branch.name}</td><td className="p-2 num">{branch.invoices}</td><td className="p-2 num font-semibold">{formatMoney(branch.revenue)}</td></tr>)}</tbody>
          </table></div> : <p className="text-sm text-muted-foreground">لا توجد بيانات فروع في الفترة المحددة.</p>}
        </CardContent>
      </Card>}

      <Tabs defaultValue={canViewSalesReports ? "sales" : canViewEmployees || canViewAttendance ? "staff" : "inventory"}>
        <TabsList className="grid w-full grid-cols-4 sm:w-auto sm:inline-grid">
          {canViewSalesReports && <TabsTrigger value="sales">المبيعات</TabsTrigger>}
          {canViewSalesReports && <TabsTrigger value="products">المنتجات</TabsTrigger>}
          {(canViewSalesReports || canViewEmployees || canViewAttendance) && <TabsTrigger value="staff">الموظفون</TabsTrigger>}
          {canViewInventory && <TabsTrigger value="inventory">المخزون</TabsTrigger>}
        </TabsList>

        {canViewSalesReports && <TabsContent value="sales" className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><h3 className="font-semibold">ملخص المبيعات والمصروفات</h3><Button size="sm" variant="ghost" onClick={() => navigate({ to: "/sales" })}>تفاصيل المبيعات</Button></div>
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
                    ...(canViewFinancialReports ? { "المبيعات بعد المصروفات قبل تكلفة البضاعة": g.sales - g.expenses, المصروفات: g.expenses } : {}),
                  })),
                  `sales-report-${from}-${to}.csv`,
                )
              }
            >
              <Download className="ml-2 h-4 w-4" />تصدير CSV
            </Button>}
          </div>
          <Card><CardContent className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">اتجاه المبيعات حسب الفترة</span>
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-primary" />المبيعات بعد المرتجعات</span>
              {canViewFinancialReports && <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-destructive" />المصروفات</span>}
            </div>
            <div className="flex min-h-40 items-end gap-2 overflow-x-auto pb-2" role="img" aria-label="رسم بياني يقارن المبيعات والمصروفات حسب الفترة">
              {groupedSales.map(([key, row]) => <div key={key} className="flex min-w-10 flex-1 flex-col items-center gap-1">
                <div className="flex h-32 w-full items-end justify-center gap-1">
                  <div className="w-3 rounded-t bg-primary" title={"المبيعات: " + formatMoney(row.sales)} style={{ height: Math.max(2, Math.max(0, row.sales) / chartMax * 100) + "%" }} />
                  {canViewFinancialReports && <div className="w-3 rounded-t bg-destructive" title={"المصروفات: " + formatMoney(row.expenses)} style={{ height: Math.max(2, row.expenses / chartMax * 100) + "%" }} />}
                </div>
                <span className="max-w-16 truncate text-[10px] text-muted-foreground">{row.label}</span>
              </div>)}
              {groupedSales.length === 0 && <p className="m-auto text-sm text-muted-foreground">لا توجد بيانات للرسم البياني.</p>}
            </div>
          </CardContent></Card>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-right">
                    <tr>
                      <th className="p-3 font-medium">الفترة</th>
                      <th className="p-3 font-medium">المبيعات</th>
                      {canViewFinancialReports && <th className="p-3 font-medium">المصروفات</th>}
                      {canViewFinancialReports && <th className="p-3 font-medium">المبيعات بعد المصروفات (قبل تكلفة البضاعة)</th>}
                      <th className="p-3 font-medium">عدد الفواتير</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedSales.map(([key, g]) => (
                      <tr key={key} className="border-t hover:bg-muted/30">
                        <td className="p-3">{g.label}</td>
                        <td className="p-3 num font-bold text-primary">{formatMoney(g.sales)}</td>
                        {canViewFinancialReports && <td className="p-3 num text-destructive">{formatMoney(g.expenses)}</td>}
                        {canViewFinancialReports && <td className={`p-3 num font-medium ${g.sales - g.expenses >= 0 ? "text-success" : "text-destructive"}`}>{formatMoney(g.sales - g.expenses)}</td>}
                        <td className="p-3 num">{g.count}</td>
                      </tr>
                    ))}
                    {groupedSales.length === 0 && (
                      <tr><td colSpan={canViewFinancialReports ? 5 : 3} className="p-8 text-center text-muted-foreground">لا توجد بيانات في الفترة المحددة</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>}

        {canViewSalesReports && <TabsContent value="products" className="space-y-4 pt-2">
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
                    ...(canViewFinancialReports ? { الإيراد: p.revenue } : {}),
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
                      {canViewFinancialReports && <th className="p-3 font-medium">الإيراد</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((p, i) => (
                      <tr key={p.name} className="border-t hover:bg-muted/30">
                        <td className="p-3 num text-muted-foreground">{i + 1}</td>
                        <td className="p-3 font-medium">{p.name}</td>
                        <td className="p-3 num">{formatMoney(p.qty, 3)}</td>
                        {canViewFinancialReports && <td className="p-3 num font-bold text-primary">{formatMoney(p.revenue)}</td>}
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
        </TabsContent>}

        {(canViewSalesReports || canViewEmployees || canViewAttendance) && <TabsContent value="staff" className="space-y-4 pt-2">
          {canViewEmployees && <Card><CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">ملخص الموظفين</h3><Button size="sm" variant="outline" onClick={() => navigate({ to: "/hr/employees" })}>ملف الموظفين</Button></div>
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead className="bg-muted/50 text-right"><tr><th className="p-2">الموظف</th><th className="p-2">الحالة</th>{canViewAttendance && <><th className="p-2">أيام الحضور</th><th className="p-2">ساعات العمل</th><th className="p-2">مرات التأخر</th></>}</tr></thead>
              <tbody>{employeeAttendanceStats.map((employee) => <tr key={employee.id} className="border-t">
                <td className="p-2 font-medium">{employee.name}</td><td className="p-2">{employee.status}</td>
                {canViewAttendance && <><td className="p-2 num">{employee.days}</td><td className="p-2 num">{formatMoney(employee.hours, 2)}</td><td className="p-2 num">{employee.late}</td></>}
              </tr>)}
              {employeeAttendanceStats.length === 0 && <tr><td colSpan={canViewAttendance ? 5 : 2} className="p-6 text-center text-muted-foreground">لا توجد بيانات موظفين ضمن النطاق المحدد.</td></tr>}</tbody>
            </table></div>
          </CardContent></Card>}
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">أداء الكاشيرين</h3>
            {canExportReports && <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportCsv(
                  cashierStats.map((c) => ({
                    "معرف الكاشير": c.id,
                    ...(canViewFinancialReports ? { المبيعات: c.sales, النقدي: c.cash } : {}),
                    "عدد الفواتير": c.count,
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
                      {canViewFinancialReports && <th className="p-3 font-medium">المبيعات</th>}
                      {canViewFinancialReports && <th className="p-3 font-medium">النقدي</th>}
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
                        {canViewFinancialReports && <td className="p-3 num font-bold text-primary">{formatMoney(c.sales)}</td>}
                        {canViewFinancialReports && <td className="p-3 num">{formatMoney(c.cash)}</td>}
                        <td className="p-3 num">{c.count}</td>
                      </tr>
                    ))}
                    {cashierStats.length === 0 && (
                      <tr><td colSpan={canViewFinancialReports ? 4 : 2} className="p-8 text-center text-muted-foreground">لا يوجد كاشيرون في الفترة المحددة</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>}

        {canViewInventory && <TabsContent value="inventory" className="space-y-4 pt-2">
          <div className="grid gap-4 sm:grid-cols-2">
            {canViewFinancialReports && <Kpi icon={<Package className="h-5 w-5" />} label="قيمة المخزون الحالية بالتكلفة" value={`${formatMoney(inventoryValue)} ${tenant?.currency ?? ""}`} tone="primary" />}
            <Kpi icon={<Package className="h-5 w-5" />} label="أصناف عند حد إعادة الطلب أو أقل" value={String(lowStockRows.length)} tone={lowStockRows.length ? "destructive" : "success"} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2"><h3 className="font-semibold">تفاصيل أرصدة المخزون</h3><Button size="sm" variant="ghost" onClick={() => navigate({ to: "/inventory" })}>فتح المخزون</Button></div>
              <p className="text-xs text-muted-foreground">القيمة تقديرية وفق تكلفة المنتج الحالية، وليست تكلفة تاريخية للمبيعات.</p>
            </div>
            {canExportReports && <Button variant="outline" size="sm" onClick={() => exportCsv(
              inventoryRows.map((row: any) => ({
                المنتج: row.productName, الرمز: row.sku ?? "", الفرع: row.branchName,
                الكمية: row.quantity, "حد إعادة الطلب": row.minimum,
                ...(canViewFinancialReports ? { "تكلفة الوحدة الحالية": row.costPrice, "القيمة التقديرية": row.estimatedValue } : {}),
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
                      {canViewFinancialReports && <th className="p-3 font-medium">قيمة المخزون</th>}
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
        </TabsContent>}
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
