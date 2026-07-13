import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2, ArrowLeftRight, ArrowUp, ArrowDown, Settings2, ShoppingCart } from "lucide-react";
import { formatMoney, formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/inventory/movements")({
  component: MovementsPage,
});

type Txn = {
  id: string;
  product_id: string;
  branch_id: string;
  user_id: string | null;
  txn_type: "in" | "out" | "adjust" | "sale" | "refund";
  quantity: number;
  reason: string | null;
  created_at: string;
};

const typeMeta: Record<string, { label: string; icon: typeof ArrowUp; className: string }> = {
  in: { label: "دخول", icon: ArrowUp, className: "bg-success/15 text-success" },
  out: { label: "خروج", icon: ArrowDown, className: "bg-destructive/15 text-destructive" },
  adjust: { label: "تعديل", icon: Settings2, className: "bg-chart-3/15 text-chart-3" },
  sale: { label: "بيع", icon: ShoppingCart, className: "bg-chart-2/15 text-chart-2" },
  refund: { label: "إرجاع", icon: ArrowUp, className: "bg-warning/15 text-warning" },
};

function MovementsPage() {
  const { tenantId } = useActiveTenant();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const q = useQuery({
    queryKey: ["inventory-movements", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_transactions")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      const list = (data ?? []) as Txn[];

      const productIds = Array.from(new Set(list.map((t) => t.product_id)));
      const branchIds = Array.from(new Set(list.map((t) => t.branch_id)));
      const [prodRes, brRes] = await Promise.all([
        productIds.length > 0 ? supabase.from("products").select("id, name, unit").in("id", productIds) : Promise.resolve({ data: [] }),
        branchIds.length > 0 ? supabase.from("branches").select("id, name").in("id", branchIds) : Promise.resolve({ data: [] }),
      ]);
      const prodMap = new Map((prodRes.data ?? []).map((p) => [(p as { id: string }).id, p as { name: string; unit: string }]));
      const brMap = new Map((brRes.data ?? []).map((b) => [(b as { id: string }).id, (b as { name: string }).name]));
      return { list, prodMap, brMap };
    },
    enabled: !!tenantId,
  });

  const filtered = useMemo(() => {
    if (!q.data) return [];
    return q.data.list.filter((t) => {
      if (typeFilter !== "all" && t.txn_type !== typeFilter) return false;
      if (!search.trim()) return true;
      const pname = q.data.prodMap.get(t.product_id)?.name ?? "";
      return pname.toLowerCase().includes(search.trim().toLowerCase());
    });
  }, [q.data, search, typeFilter]);

  return (
    <div className="space-y-6">
      <PageHeader title="حركات المخزون" subtitle="سجل كامل لكل عمليات الدخول والخروج والتعديل" />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="ابحث بالمنتج..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأنواع</SelectItem>
            <SelectItem value="in">دخول</SelectItem>
            <SelectItem value="out">خروج</SelectItem>
            <SelectItem value="sale">بيع</SelectItem>
            <SelectItem value="adjust">تعديل</SelectItem>
            <SelectItem value="refund">إرجاع</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {q.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <ArrowLeftRight className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">لا توجد حركات</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-right">
                  <tr>
                    <th className="p-3 font-medium">النوع</th>
                    <th className="p-3 font-medium">المنتج</th>
                    <th className="p-3 font-medium">الفرع</th>
                    <th className="p-3 font-medium">الكمية</th>
                    <th className="p-3 font-medium">السبب</th>
                    <th className="p-3 font-medium">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    const meta = typeMeta[t.txn_type] ?? typeMeta.adjust;
                    const p = q.data?.prodMap.get(t.product_id);
                    return (
                      <tr key={t.id} className="border-t hover:bg-muted/30">
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.className}`}>
                            <meta.icon className="h-3 w-3" />{meta.label}
                          </span>
                        </td>
                        <td className="p-3">{p?.name ?? "—"}</td>
                        <td className="p-3 text-muted-foreground">{q.data?.brMap.get(t.branch_id) ?? "—"}</td>
                        <td className={`p-3 num font-medium ${Number(t.quantity) >= 0 ? "text-success" : "text-destructive"}`}>
                          {Number(t.quantity) >= 0 ? "+" : ""}{formatMoney(t.quantity)} {p?.unit ?? ""}
                        </td>
                        <td className="p-3 text-muted-foreground">{t.reason ?? "—"}</td>
                        <td className="p-3 text-xs text-muted-foreground">{formatDateTime(t.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
