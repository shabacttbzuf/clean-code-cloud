import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2, Receipt, ChevronLeft } from "lucide-react";
import { formatMoney, formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/sales/")({
  component: SalesListPage,
});

type SaleRow = {
  id: string;
  invoice_no: number;
  created_at: string;
  total: number;
  discount: number;
  tax_amount: number;
  subtotal: number;
  payment_method: string;
  status: string;
  branch_id: string;
  cashier_id: string;
};

const methodLabels: Record<string, string> = {
  cash: "نقدي", card: "بطاقة", transfer: "تحويل", mixed: "مختلط",
};
const methodColors: Record<string, string> = {
  cash: "bg-success/15 text-success",
  card: "bg-chart-3/15 text-chart-3",
  transfer: "bg-chart-2/15 text-chart-2",
  mixed: "bg-chart-4/15 text-chart-4",
};

function SalesListPage() {
  const { tenantId, tenant } = useActiveTenant();
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("all");

  const sales = useQuery({
    queryKey: ["sales", tenantId],
    queryFn: async (): Promise<SaleRow[]> => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, invoice_no, created_at, total, discount, tax_amount, subtotal, payment_method, status, branch_id, cashier_id")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as SaleRow[];
    },
    enabled: !!tenantId,
  });

  const filtered = useMemo(() => {
    const list = sales.data ?? [];
    return list.filter((s) => {
      if (methodFilter !== "all" && s.payment_method !== methodFilter) return false;
      if (!search.trim()) return true;
      return String(s.invoice_no).includes(search.trim());
    });
  }, [sales.data, search, methodFilter]);

  const totalSum = filtered.reduce((a, s) => a + Number(s.total), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="الفواتير" subtitle={`${filtered.length} فاتورة — إجمالي ${formatMoney(totalSum)} ${tenant?.currency ?? ""}`} />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="ابحث برقم الفاتورة..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
        </div>
        <Select value={methodFilter} onValueChange={setMethodFilter}>
          <SelectTrigger className="sm:w-40"><SelectValue placeholder="طريقة الدفع" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الطرق</SelectItem>
            <SelectItem value="cash">نقدي</SelectItem>
            <SelectItem value="card">بطاقة</SelectItem>
            <SelectItem value="transfer">تحويل</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {sales.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Receipt className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">لا توجد فواتير</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-right">
                  <tr>
                    <th className="p-3 font-medium">رقم</th>
                    <th className="p-3 font-medium">التاريخ</th>
                    <th className="p-3 font-medium">الدفع</th>
                    <th className="p-3 font-medium">الخصم</th>
                    <th className="p-3 font-medium">الضريبة</th>
                    <th className="p-3 font-medium">الإجمالي</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 font-mono">#{s.invoice_no}</td>
                      <td className="p-3 text-muted-foreground">{formatDateTime(s.created_at)}</td>
                      <td className="p-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${methodColors[s.payment_method] ?? "bg-muted"}`}>
                          {methodLabels[s.payment_method] ?? s.payment_method}
                        </span>
                      </td>
                      <td className="p-3 num text-muted-foreground">{formatMoney(s.discount)}</td>
                      <td className="p-3 num text-muted-foreground">{formatMoney(s.tax_amount)}</td>
                      <td className="p-3 num font-bold text-primary">{formatMoney(s.total)}</td>
                      <td className="p-3">
                        <Link to="/sales/$id" params={{ id: s.id }} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          التفاصيل <ChevronLeft className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
