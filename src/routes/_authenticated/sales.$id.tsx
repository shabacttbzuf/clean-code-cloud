import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Printer, Download, ArrowRight, RotateCcw } from "lucide-react";
import { toast } from "sonner";
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
type Item = {
  id: string; product_id: string | null; product_name: string;
  quantity: number; unit_price: number; line_total: number; refunded_quantity: number;
};
type Branch = { id: string; name: string; tax_number: string | null };
type Refund = {
  id: string; total: number; reason: string; refund_method: string; created_at: string;
};

const methodLabels: Record<string, string> = {
  cash: "نقدي", card: "بطاقة", transfer: "تحويل", mixed: "مختلط",
};

function SaleDetailPage() {
  const { id } = Route.useParams();
  const { tenant, tenantId, isAdmin } = useActiveTenant();
  const qc = useQueryClient();
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<"cash" | "card" | "transfer">("transfer");
  const [refundQuantities, setRefundQuantities] = useState<Record<string, string>>({});
  const [restockFlags, setRestockFlags] = useState<Record<string, boolean>>({});

  const sale = useQuery({
    queryKey: ["sale", id],
    queryFn: async (): Promise<{ sale: Sale; items: Item[]; branch: Branch | null; cashier: string; refunds: Refund[] } | null> => {
      const { data: s, error } = await supabase.from("sales").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!s) return null;

      const [itemsRes, branchRes, profileRes, refundsRes] = await Promise.all([
        supabase.from("sale_items").select("id, product_id, product_name, quantity, unit_price, line_total").eq("sale_id", id),
        supabase.from("branches").select("id, name, tax_number").eq("id", s.branch_id).maybeSingle(),
        supabase.from("profiles").select("full_name").eq("id", s.cashier_id).maybeSingle(),
        supabase.from("sale_refunds").select("id, total, reason, refund_method, created_at").eq("sale_id", id).order("created_at", { ascending: false }),
      ]);
      if (itemsRes.error) throw itemsRes.error;
      if (refundsRes.error) throw refundsRes.error;
      const refundRows = (refundsRes.data ?? []) as Refund[];
      const refundIds = refundRows.map((r) => r.id);
      const refundItemsRes = refundIds.length
        ? await supabase.from("sale_refund_items").select("sale_item_id, quantity").in("refund_id", refundIds)
        : { data: [], error: null };
      if (refundItemsRes.error) throw refundItemsRes.error;
      const refundedByItem = new Map<string, number>();
      for (const row of refundItemsRes.data ?? []) {
        refundedByItem.set(row.sale_item_id, (refundedByItem.get(row.sale_item_id) ?? 0) + Number(row.quantity));
      }
      return {
        sale: s as Sale,
        items: ((itemsRes.data ?? []) as Omit<Item, "refunded_quantity">[]).map((item) => ({
          ...item,
          refunded_quantity: refundedByItem.get(item.id) ?? 0,
        })),
        branch: (branchRes.data as Branch | null) ?? null,
        cashier: (profileRes.data?.full_name as string | undefined) ?? "—",
        refunds: refundRows,
      };
    },
  });

  const refundMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("المؤسسة غير محددة");
      const items = (sale.data?.items ?? [])
        .map((item) => ({
          sale_item_id: item.id,
          quantity: Number(refundQuantities[item.id] ?? 0),
          restock: restockFlags[item.id] ?? true,
        }))
        .filter((item) => item.quantity > 0);
      if (items.length === 0) throw new Error("حدد كمية صنف واحد على الأقل");
      const { data, error } = await supabase.rpc("create_sale_refund", {
        _tenant_id: tenantId,
        _sale_id: id,
        _reason: refundReason.trim(),
        _refund_method: refundMethod,
        _items: items,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("تم تسجيل المرتجع وإعادة المخزون المحدد");
      setRefundOpen(false);
      setRefundReason("");
      setRefundQuantities({});
      qc.invalidateQueries({ queryKey: ["sale", id] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-movements"] });
      qc.invalidateQueries({ queryKey: ["cash-sessions"] });
      qc.invalidateQueries({ queryKey: ["sales-profitability"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر تسجيل المرتجع"),
  });

  if (sale.isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!sale.data) {
    return <Card><CardContent className="py-12 text-center text-muted-foreground">الفاتورة غير موجودة</CardContent></Card>;
  }

  const { sale: s, items, branch, cashier, refunds } = sale.data;
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
  const canRefund = Boolean(isAdmin && s.status === "completed" && items.some((i) => i.quantity - i.refunded_quantity > 0));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/sales"><ArrowRight className="ml-1 h-4 w-4" />رجوع</Link>
          </Button>
          <h1 className="text-2xl font-bold">فاتورة #{s.invoice_no}</h1>
          <span className="rounded-full bg-muted px-2 py-1 text-xs">{s.status === "refunded" ? "مستردة بالكامل" : s.status === "void" ? "ملغاة" : "مكتملة"}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {canRefund && <Button variant="destructive" onClick={() => setRefundOpen(true)}><RotateCcw className="ml-2 h-4 w-4" />تسجيل مرتجع</Button>}
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
                <th className="p-3 font-medium">المرتجع</th>
                <th className="p-3 font-medium">السعر</th>
                <th className="p-3 font-medium">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-t">
                  <td className="p-3">{i.product_name}</td>
                  <td className="p-3 num">{i.quantity}</td>
                  <td className="p-3 num">{i.refunded_quantity}</td>
                  <td className="p-3 num">{formatMoney(i.unit_price)}</td>
                  <td className="p-3 num font-medium">{formatMoney(i.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {refunds.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">سجل المرتجعات</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {refunds.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm last:border-0">
                <div><div className="font-medium">{formatDateTime(r.created_at)}</div><div className="text-xs text-muted-foreground">{r.reason}</div></div>
                <div className="text-left"><div className="font-bold text-destructive">-{formatMoney(r.total)} {tenant?.currency ?? ""}</div><div className="text-xs text-muted-foreground">{methodLabels[r.refund_method] ?? r.refund_method}</div></div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="max-w-sm mr-auto">
        <CardContent className="space-y-2 p-4 text-sm">
          <Row label="المجموع الفرعي" value={formatMoney(s.subtotal)} />
          {Number(s.discount) > 0 && <Row label="الخصم" value={`-${formatMoney(s.discount)}`} className="text-destructive" />}
          {Number(s.tax_amount) > 0 && <Row label="الضريبة" value={formatMoney(s.tax_amount)} />}
          <div className="border-t pt-2">
            <Row label="الإجمالي" value={`${formatMoney(s.total)} ${tenant?.currency ?? ""}`} className="text-base font-bold text-primary" />
          </div>
          <Row label="طريقة الدفع" value={methodLabels[s.payment_method] ?? s.payment_method} className="text-muted-foreground" />
          {refunds.length > 0 && <Row label="إجمالي المرتجعات" value={`-${formatMoney(refunds.reduce((sum, r) => sum + Number(r.total), 0))}`} className="text-destructive" />}
        </CardContent>
      </Card>

      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>تسجيل مرتجع للفاتورة #{s.invoice_no}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>طريقة إعادة المبلغ</Label>
                <Select value={refundMethod} onValueChange={(v) => setRefundMethod(v as "cash" | "card" | "transfer")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">نقداً (يتطلب وردية مفتوحة)</SelectItem>
                    <SelectItem value="card">بطاقة</SelectItem>
                    <SelectItem value="transfer">تحويل</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>سبب الإرجاع</Label>
                <Textarea value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="اكتب سبب الإرجاع..." maxLength={500} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>الأصناف والكميات المراد إرجاعها</Label>
              {items.map((item) => {
                const remaining = Math.max(0, Number(item.quantity) - Number(item.refunded_quantity));
                return (
                  <div key={item.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_110px_150px] sm:items-center">
                    <div><div className="font-medium">{item.product_name}</div><div className="text-xs text-muted-foreground">المتبقي للإرجاع: {remaining}</div></div>
                    <Input type="number" min="0" max={remaining} step="0.001" value={refundQuantities[item.id] ?? "0"}
                      onChange={(e) => setRefundQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))} disabled={remaining <= 0} />
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={restockFlags[item.id] ?? true}
                        onChange={(e) => setRestockFlags((prev) => ({ ...prev, [item.id]: e.target.checked }))} />
                      إعادة الصنف للمخزون
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundOpen(false)}>إلغاء</Button>
            <Button variant="destructive" disabled={refundMutation.isPending || refundReason.trim().length < 2}
              onClick={() => refundMutation.mutate()}>
              {refundMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              تأكيد المرتجع
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
