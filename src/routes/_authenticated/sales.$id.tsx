import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, Download, ArrowRight } from "lucide-react";
import { formatMoney, formatDateTime } from "@/lib/format";
import { printInvoicePDF, downloadInvoicePDF, type InvoiceData } from "@/lib/invoice-pdf";

export const Route = createFileRoute("/_authenticated/sales/$id")({
  component: SaleDetailPage,
});

type Sale = {
  id: string; invoice_no: number; created_at: string;
  subtotal: number; discount: number; tax_amount: number; total: number;
  payment_method: string; status: string;
  branch_id: string; cashier_id: string; notes: string | null;
};
type Item = { id: string; product_name: string; quantity: number; unit_price: number; line_total: number };
type Branch = { id: string; name: string; tax_number: string | null };

const methodLabels: Record<string, string> = {
  cash: "نقدي", card: "بطاقة", transfer: "تحويل", mixed: "مختلط",
};

function SaleDetailPage() {
  const { id } = Route.useParams();
  const { tenant } = useActiveTenant();

  const sale = useQuery({
    queryKey: ["sale", id],
    queryFn: async (): Promise<{ sale: Sale; items: Item[]; branch: Branch | null; cashier: string } | null> => {
      const { data: s, error } = await supabase.from("sales").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!s) return null;

      const [itemsRes, branchRes, profileRes] = await Promise.all([
        supabase.from("sale_items").select("id, product_name, quantity, unit_price, line_total").eq("sale_id", id),
        supabase.from("branches").select("id, name, tax_number").eq("id", s.branch_id).maybeSingle(),
        supabase.from("profiles").select("full_name").eq("id", s.cashier_id).maybeSingle(),
      ]);
      return {
        sale: s as Sale,
        items: (itemsRes.data ?? []) as Item[],
        branch: (branchRes.data as Branch | null) ?? null,
        cashier: (profileRes.data?.full_name as string | undefined) ?? "—",
      };
    },
  });

  if (sale.isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!sale.data) {
    return <Card><CardContent className="py-12 text-center text-muted-foreground">الفاتورة غير موجودة</CardContent></Card>;
  }

  const { sale: s, items, branch, cashier } = sale.data;

  const invoiceData: InvoiceData = {
    invoice_no: s.invoice_no,
    created_at: s.created_at,
    branch_name: branch?.name ?? "",
    cashier_name: cashier,
    tax_number: branch?.tax_number,
    currency: tenant?.currency ?? "SAR",
    subtotal: Number(s.subtotal),
    discount: Number(s.discount),
    tax_amount: Number(s.tax_amount),
    total: Number(s.total),
    payment_method: s.payment_method,
    items: items.map((i) => ({
      product_name: i.product_name,
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
      line_total: Number(i.line_total),
    })),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/sales"><ArrowRight className="ml-1 h-4 w-4" />رجوع</Link>
          </Button>
          <h1 className="text-2xl font-bold">فاتورة #{s.invoice_no}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadInvoicePDF(invoiceData)}>
            <Download className="ml-2 h-4 w-4" />تحميل PDF
          </Button>
          <Button onClick={() => printInvoicePDF(invoiceData)}>
            <Printer className="ml-2 h-4 w-4" />طباعة
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">التاريخ</div>
          <div className="mt-1 font-medium">{formatDateTime(s.created_at)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">الكاشير</div>
          <div className="mt-1 font-medium">{cashier}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">الفرع</div>
          <div className="mt-1 font-medium">{branch?.name ?? "—"}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">البنود</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-right">
              <tr>
                <th className="p-3 font-medium">المنتج</th>
                <th className="p-3 font-medium">الكمية</th>
                <th className="p-3 font-medium">السعر</th>
                <th className="p-3 font-medium">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-t">
                  <td className="p-3">{i.product_name}</td>
                  <td className="p-3 num">{i.quantity}</td>
                  <td className="p-3 num">{formatMoney(i.unit_price)}</td>
                  <td className="p-3 num font-medium">{formatMoney(i.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="max-w-sm mr-auto">
        <CardContent className="space-y-2 p-4 text-sm">
          <Row label="المجموع الفرعي" value={formatMoney(s.subtotal)} />
          {Number(s.discount) > 0 && <Row label="الخصم" value={`-${formatMoney(s.discount)}`} className="text-destructive" />}
          {Number(s.tax_amount) > 0 && <Row label="الضريبة" value={formatMoney(s.tax_amount)} />}
          <div className="border-t pt-2">
            <Row label="الإجمالي" value={`${formatMoney(s.total)} ${tenant?.currency ?? ""}`} className="text-base font-bold text-primary" />
          </div>
          <Row label="طريقة الدفع" value={methodLabels[s.payment_method] ?? s.payment_method} className="text-muted-foreground" />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`flex justify-between ${className}`}>
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}
