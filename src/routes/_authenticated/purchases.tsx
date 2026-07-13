import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { Loader2, Plus, FileText, Trash2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { formatMoney, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/purchases")({
  component: PurchasesPage,
});

type PurchaseRow = {
  id: string; reference: string | null; supplier_id: string | null;
  branch_id: string; user_id: string;
  total: number; status: string; created_at: string;
};
type Product = { id: string; name: string; unit: string; cost_price: number };
type CartLine = { product_id: string; name: string; unit: string; quantity: string; cost_price: string };

function PurchasesPage() {
  const { tenantId, userId, isAdmin, role, membership } = useActiveTenant();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

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
      const list = (data ?? []) as PurchaseRow[];
      const supIds = Array.from(new Set(list.map((p) => p.supplier_id).filter(Boolean) as string[]));
      const brIds = Array.from(new Set(list.map((p) => p.branch_id)));
      const [supRes, brRes] = await Promise.all([
        supIds.length > 0 ? supabase.from("suppliers").select("id, name").in("id", supIds) : Promise.resolve({ data: [] }),
        brIds.length > 0 ? supabase.from("branches").select("id, name").in("id", brIds) : Promise.resolve({ data: [] }),
      ]);
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
        subtitle="أدخل فاتورة شراء وسيتم تحديث المخزون تلقائياً"
        action={
          canCreate && <Button onClick={() => setCreating(true)}><Plus className="ml-2 h-4 w-4" />فاتورة جديدة</Button>
        }
      />

      {purchases.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
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
                    <th className="p-3 font-medium">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.data.list.map((p) => (
                    <tr key={p.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 font-mono">{p.reference ?? p.id.slice(0, 6)}</td>
                      <td className="p-3">{p.supplier_id ? (purchases.data?.supMap.get(p.supplier_id) ?? "—") : "—"}</td>
                      <td className="p-3 text-muted-foreground">{purchases.data?.brMap.get(p.branch_id) ?? "—"}</td>
                      <td className="p-3 num font-bold text-primary">{formatMoney(p.total)}</td>
                      <td className="p-3 text-xs text-muted-foreground">{formatDateTime(p.created_at)}</td>
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
    </div>
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
  useMemo(() => {
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
      if (!branchId) throw new Error("اختر الفرع");
      if (lines.length === 0) throw new Error("أضف منتجات");
      const cleanLines = lines.map((l) => ({
        ...l,
        quantity: Number(l.quantity),
        cost_price: Number(l.cost_price),
      }));
      for (const l of cleanLines) {
        if (!(l.quantity > 0)) throw new Error(`كمية غير صالحة لـ ${l.name}`);
        if (l.cost_price < 0) throw new Error(`سعر غير صالح لـ ${l.name}`);
      }
      const purchaseTotal = cleanLines.reduce((s, l) => s + l.quantity * l.cost_price, 0);

      const { data: purchase, error: pErr } = await supabase
        .from("purchases")
        .insert({
          tenant_id: tenantId,
          branch_id: branchId,
          supplier_id: supplierId === "none" ? null : supplierId,
          user_id: userId,
          reference: reference || null,
          notes: notes || null,
          total: purchaseTotal,
          status: "received",
        })
        .select()
        .single();
      if (pErr) throw pErr;

      const items = cleanLines.map((l) => ({
        tenant_id: tenantId,
        purchase_id: purchase.id,
        product_id: l.product_id,
        quantity: l.quantity,
        cost_price: l.cost_price,
        line_total: +(l.quantity * l.cost_price).toFixed(2),
      }));
      const { error: iErr } = await supabase.from("purchase_items").insert(items);
      if (iErr) throw iErr;
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
        <Button onClick={() => submit.mutate()} disabled={submit.isPending || lines.length === 0}>
          {submit.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          <FileText className="ml-2 h-4 w-4" />حفظ وتحديث المخزون
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
