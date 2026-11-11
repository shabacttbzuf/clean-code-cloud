import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, FileText, Trash2, ShoppingBag, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { formatMoney, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/purchases")({
  component: PurchasesPage,
});

type PurchaseRow = {
  id: string; reference: string | null; supplier_id: string | null;
  branch_id: string; user_id: string;
  total: number; status: string; created_at: string; returned_total: number;
};
type Product = { id: string; name: string; unit: string; cost_price: number };
type CartLine = { product_id: string; name: string; unit: string; quantity: string; cost_price: string };

function PurchasesPage() {
  const { tenantId, userId, isAdmin, role, membership } = useActiveTenant();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [returningPurchaseId, setReturningPurchaseId] = useState<string | null>(null);
  const canReturn = isAdmin || role === "warehouse";

  const purchases = useQuery({
    queryKey: ["purchases", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("id, reference, supplier_id, branch_id, user_id, total, status, created_at")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const baseList = (data ?? []) as Omit<PurchaseRow, "returned_total">[];
      const supIds = Array.from(new Set(baseList.map((p) => p.supplier_id).filter(Boolean) as string[]));
      const brIds = Array.from(new Set(baseList.map((p) => p.branch_id)));
      const purchaseIds = baseList.map((p) => p.id);
      const [supRes, brRes, returnRes] = await Promise.all([
        supIds.length > 0 ? supabase.from("suppliers").select("id, name").in("id", supIds) : Promise.resolve({ data: [] }),
        brIds.length > 0 ? supabase.from("branches").select("id, name").in("id", brIds) : Promise.resolve({ data: [] }),
        purchaseIds.length > 0 ? supabase.from("purchase_returns").select("purchase_id, total").in("purchase_id", purchaseIds) : Promise.resolve({ data: [] }),
      ]);
      for (const result of [supRes, brRes, returnRes]) {
        if ("error" in result && result.error) throw result.error;
      }
      const returnedTotals = new Map<string, number>();
      for (const ret of returnRes.data ?? []) returnedTotals.set(ret.purchase_id, (returnedTotals.get(ret.purchase_id) ?? 0) + Number(ret.total));
      const list = baseList.map((purchase) => ({ ...purchase, returned_total: returnedTotals.get(purchase.id) ?? 0 }));
      const supMap = new Map((supRes.data ?? []).map((s) => [(s as { id: string }).id, (s as { name: string }).name]));
      const brMap = new Map((brRes.data ?? []).map((b) => [(b as { id: string }).id, (b as { name: string }).name]));
      return { list, supMap, brMap };
    },
    enabled: !!tenantId,
  });

  const canCreate = isAdmin || role === "warehouse";

  return (
    <div className="space-y-6">
      <PageHeader
        title="فواتير الشراء"
        subtitle="تسجل فواتير الشراء والمرتجعات مع تحديث المخزون وحفظ قيمة المرتجع"
        action={
          canCreate && <Button onClick={() => setCreating(true)}><Plus className="ml-2 h-4 w-4" />فاتورة جديدة</Button>
        }
      />

      <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
        قيمة مرتجع المورد تُحفظ وتُخصم من صافي قيمة المشتريات والمخزون. تسوية المبلغ أو رصيد المورد تتم خارج التطبيق حالياً؛ لا يسجل النظام دفعة نقدية للمورد.
      </p>

      {purchases.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : purchases.isError ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <ShoppingBag className="h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">تعذر تحميل فواتير الشراء أو بيانات الموردين والفروع.</p>
          <Button variant="outline" onClick={() => purchases.refetch()}>إعادة المحاولة</Button>
        </CardContent></Card>
      ) : !purchases.data || purchases.data.list.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <ShoppingBag className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">لا توجد فواتير شراء</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-right">
                  <tr>
                    <th className="p-3 font-medium">المرجع</th>
                    <th className="p-3 font-medium">المورد</th>
                    <th className="p-3 font-medium">الفرع</th>
                    <th className="p-3 font-medium">الإجمالي</th>
                    <th className="p-3 font-medium">المرتجع</th>
                    <th className="p-3 font-medium">الصافي</th>
                    <th className="p-3 font-medium">الحالة</th>
                    <th className="p-3 font-medium">التاريخ</th>
                    {canReturn && <th className="p-3 font-medium">الإجراء</th>}
                  </tr>
                </thead>
                <tbody>
                  {purchases.data.list.map((p) => (
                    <tr key={p.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 font-mono">{p.reference ?? p.id.slice(0, 6)}</td>
                      <td className="p-3">{p.supplier_id ? (purchases.data?.supMap.get(p.supplier_id) ?? "—") : "—"}</td>
                      <td className="p-3 text-muted-foreground">{purchases.data?.brMap.get(p.branch_id) ?? "—"}</td>
                      <td className="p-3 num">{formatMoney(p.total)}</td>
                      <td className="p-3 num text-destructive">{p.returned_total > 0 ? `-${formatMoney(p.returned_total)}` : "—"}</td>
                      <td className="p-3 num font-bold text-primary">{formatMoney(Number(p.total) - p.returned_total)}</td>
                      <td className="p-3 text-xs">{p.status === "returned" ? "مرتجعة بالكامل" : p.status === "cancelled" ? "ملغاة" : p.status === "draft" ? "مسودة" : "مستلمة"}</td>
                      <td className="p-3 text-xs text-muted-foreground">{formatDateTime(p.created_at)}</td>
                      {canReturn && <td className="p-3">{p.status === "received" ? <Button size="sm" variant="outline" onClick={() => setReturningPurchaseId(p.id)}><RotateCcw className="ml-1 h-3 w-3" />إرجاع للمورد</Button> : "—"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <NewPurchaseDialog
          onDone={() => {
            setCreating(false);
            qc.invalidateQueries({ queryKey: ["purchases"] });
            qc.invalidateQueries({ queryKey: ["inventory"] });
          }}
          tenantId={tenantId!}
          userId={userId!}
          defaultBranchId={membership?.branch_id ?? null}
        />
      </Dialog>
      <Dialog open={!!returningPurchaseId} onOpenChange={(open) => { if (!open) setReturningPurchaseId(null); }}>
        {returningPurchaseId && (
          <PurchaseReturnDialog
            purchaseId={returningPurchaseId}
            tenantId={tenantId!}
            onDone={() => {
              setReturningPurchaseId(null);
              qc.invalidateQueries({ queryKey: ["purchases"] });
              qc.invalidateQueries({ queryKey: ["inventory"] });
              qc.invalidateQueries({ queryKey: ["inventory-movements"] });
            }}
            onCancel={() => setReturningPurchaseId(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

function PurchaseReturnDialog({
  purchaseId, tenantId, onDone, onCancel,
}: { purchaseId: string; tenantId: string; onDone: () => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  const purchaseLines = useQuery({
    queryKey: ["purchase-return-lines", purchaseId],
    queryFn: async () => {
      const { data: lines, error } = await supabase.from("purchase_items")
        .select("id, product_id, quantity, cost_price").eq("purchase_id", purchaseId);
      if (error) throw error;
      const { data: returns, error: returnsError } = await supabase.from("purchase_returns")
        .select("id").eq("purchase_id", purchaseId);
      if (returnsError) throw returnsError;
      const returnIds = (returns ?? []).map((r) => r.id);
      const { data: returnItems, error: returnItemsError } = returnIds.length
        ? await supabase.from("purchase_return_items").select("purchase_item_id, quantity").in("purchase_return_id", returnIds)
        : { data: [], error: null };
      if (returnItemsError) throw returnItemsError;
      const returned = new Map<string, number>();
      for (const item of returnItems ?? []) returned.set(item.purchase_item_id, (returned.get(item.purchase_item_id) ?? 0) + Number(item.quantity));
      const productIds = Array.from(new Set((lines ?? []).map((line) => line.product_id)));
      const { data: products, error: productsError } = productIds.length
        ? await supabase.from("products").select("id, name").in("id", productIds)
        : { data: [], error: null };
      if (productsError) throw productsError;
      const names = new Map((products ?? []).map((p) => [p.id, p.name]));
      return (lines ?? []).map((line) => ({
        id: line.id, product_id: line.product_id, name: names.get(line.product_id) ?? "منتج",
        quantity: Number(line.quantity), cost_price: Number(line.cost_price), returned: returned.get(line.id) ?? 0,
      }));
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      const items = (purchaseLines.data ?? []).map((line) => ({
        purchase_item_id: line.id, quantity: Number(quantities[line.id] ?? 0),
      })).filter((line) => line.quantity > 0);
      if (items.length === 0) throw new Error("حدد كمية صنف واحد على الأقل");
      if (reason.trim().length < 2) throw new Error("اكتب سبب الإرجاع");
      const { error } = await supabase.rpc("create_purchase_return", {
        _tenant_id: tenantId, _purchase_id: purchaseId, _reason: reason.trim(), _items: items,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم تسجيل إرجاع المورد وتحديث المخزون"); onDone(); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر تسجيل الإرجاع"),
  });

  return (
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader><DialogTitle>إرجاع أصناف إلى المورد</DialogTitle></DialogHeader>
      {purchaseLines.isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : purchaseLines.isError ? (
        <p className="text-sm text-destructive">تعذر تحميل بنود فاتورة الشراء.</p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2"><Label>سبب الإرجاع</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="اكتب سبب الإرجاع..." />
          </div>
          <div className="space-y-2"><Label>الأصناف والكميات</Label>
            {(purchaseLines.data ?? []).map((line) => {
              const remaining = Math.max(0, line.quantity - line.returned);
              return (
                <div key={line.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_110px] sm:items-center">
                  <div><div className="font-medium">{line.name}</div>
                    <div className="text-xs text-muted-foreground">المشتَرى: {line.quantity} • المرتجع: {line.returned} • المتبقي: {remaining}</div>
                    <div className="text-xs text-muted-foreground">{formatMoney(line.cost_price)} للوحدة</div>
                  </div>
                  <Input type="number" min="0" max={remaining} step="0.001" value={quantities[line.id] ?? "0"}
                    onChange={(e) => setQuantities((prev) => ({ ...prev, [line.id]: e.target.value }))} disabled={remaining <= 0} />
                </div>
              );
            })}
          </div>
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>إلغاء</Button>
        <Button variant="destructive" disabled={submit.isPending || purchaseLines.isLoading || !purchaseLines.data}
          onClick={() => submit.mutate()}>
          {submit.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}تأكيد إرجاع المورد
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function NewPurchaseDialog({
  onDone, tenantId, userId, defaultBranchId,
}: { onDone: () => void; tenantId: string; userId: string; defaultBranchId: string | null }) {
  const [branchId, setBranchId] = useState<string>(defaultBranchId ?? "");
  const [supplierId, setSupplierId] = useState<string>("none");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [addProdId, setAddProdId] = useState<string>("");

  const branches = useQuery({
    queryKey: ["branches-active-purchase", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("id, name").eq("tenant_id", tenantId).eq("is_active", true);
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const suppliers = useQuery({
    queryKey: ["suppliers-min", tenantId],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("id, name").eq("tenant_id", tenantId).eq("is_active", true);
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
  const products = useQuery({
    queryKey: ["products-purchase", tenantId],
    queryFn: async (): Promise<Product[]> => {
      const { data } = await supabase.from("products").select("id, name, unit, cost_price").eq("tenant_id", tenantId).eq("is_active", true).order("name");
      return (data ?? []).map((p) => ({ ...(p as { id: string; name: string; unit: string; cost_price: number }) }));
    },
  });

  // Auto-pick first branch when none preselected
  useEffect(() => {
    if (!branchId && branches.data && branches.data.length > 0) setBranchId(branches.data[0].id);
  }, [branches.data, branchId]);

  const total = useMemo(() =>
    lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.cost_price) || 0), 0)
  , [lines]);

  function addLine() {
    if (!addProdId) return;
    const p = products.data?.find((x) => x.id === addProdId);
    if (!p) return;
    if (lines.some((l) => l.product_id === addProdId)) {
      toast.error("المنتج مضاف بالفعل");
      return;
    }
    setLines((prev) => [...prev, {
      product_id: p.id, name: p.name, unit: p.unit,
      quantity: "1", cost_price: String(p.cost_price ?? 0),
    }]);
    setAddProdId("");
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!tenantId || !userId || !branchId) throw new Error("اختر الفرع وتأكد من تسجيل الدخول");
      if (lines.length === 0) throw new Error("أضف منتجات");
      const cleanLines = lines.map((l) => ({
        ...l,
        quantity: Number(l.quantity),
        cost_price: Number(l.cost_price),
      }));
      for (const l of cleanLines) {
        if (!(l.quantity > 0)) throw new Error(`كمية غير صالحة لـ ${l.name}`);
        if (!Number.isFinite(l.cost_price) || l.cost_price < 0) throw new Error(`سعر غير صالح لـ ${l.name}`);
      }

      const { error } = await supabase.rpc("create_purchase_with_items", {
        _tenant_id: tenantId,
        _branch_id: branchId,
        _user_id: userId,
        _supplier_id: supplierId === "none" ? null : supplierId,
        _reference: reference || null,
        _notes: notes || null,
        _items: cleanLines.map((line) => ({
          product_id: line.product_id,
          quantity: line.quantity,
          cost_price: line.cost_price,
        })),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تسجيل الفاتورة");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل"),
  });

  return (
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader><DialogTitle>فاتورة شراء جديدة</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>الفرع</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
              <SelectContent>
                {(branches.data ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>المورد</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون مورد</SelectItem>
                {(suppliers.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>رقم المرجع (اختياري)</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="INV-2026-001" dir="ltr" />
        </div>

        <div className="rounded-lg border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">البنود</span>
          </div>
          <div className="mb-3 flex gap-2">
            <Select value={addProdId} onValueChange={setAddProdId}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="اختر منتج..." /></SelectTrigger>
              <SelectContent>
                {(products.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" onClick={addLine} disabled={!addProdId}><Plus className="ml-1 h-3 w-3" />إضافة</Button>
          </div>

          {lines.length === 0 ? (
            <div className="rounded bg-muted/30 p-4 text-center text-sm text-muted-foreground">لم يُضف أي منتج</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-right">
                <tr className="text-xs text-muted-foreground">
                  <th className="p-1 font-normal">المنتج</th>
                  <th className="p-1 font-normal">الكمية</th>
                  <th className="p-1 font-normal">التكلفة</th>
                  <th className="p-1 font-normal">الإجمالي</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.product_id} className="border-t">
                    <td className="p-1">{l.name}</td>
                    <td className="p-1">
                      <Input type="number" min="0" step="0.001" value={l.quantity}
                        onChange={(e) => setLines((prev) => prev.map((x, ix) => ix === i ? { ...x, quantity: e.target.value } : x))}
                        className="h-8 w-20" />
                    </td>
                    <td className="p-1">
                      <Input type="number" min="0" step="0.01" value={l.cost_price}
                        onChange={(e) => setLines((prev) => prev.map((x, ix) => ix === i ? { ...x, cost_price: e.target.value } : x))}
                        className="h-8 w-24" />
                    </td>
                    <td className="p-1 num font-medium">
                      {formatMoney((Number(l.quantity) || 0) * (Number(l.cost_price) || 0))}
                    </td>
                    <td className="p-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                        onClick={() => setLines((prev) => prev.filter((_, ix) => ix !== i))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-bold">
                  <td colSpan={3} className="p-2 text-left">الإجمالي</td>
                  <td className="p-2 num text-primary">{formatMoney(total)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="space-y-2">
          <Label>ملاحظات</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => submit.mutate()} disabled={submit.isPending || lines.length === 0 || branches.isError || suppliers.isError || products.isError || branches.isLoading || products.isLoading}>
          {submit.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          <FileText className="ml-2 h-4 w-4" />حفظ وتحديث المخزون
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
