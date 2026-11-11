import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Warehouse, AlertTriangle, Search, Settings2, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/inventory/")({
  component: InventoryPage,
});

// Supabase REST applies a per-request row cap. Page through inventory and products so
// high-volume tenants never receive silently truncated stock balances.
async function fetchAllRows<T>(query: any): Promise<T[]> {
  const pageSize = 500;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

type InvRow = {
  id: string;
  product_id: string;
  branch_id: string;
  quantity: number;
  product_name: string;
  product_unit: string;
  min_stock: number;
  has_inventory_record: boolean;
};

function InventoryPage() {
  const { tenantId, isAdmin, isSuperOwner, role, membership } = useActiveTenant();
  const qc = useQueryClient();
  const [branchId, setBranchId] = useState<string>(membership?.branch_id ?? "all");
  const [search, setSearch] = useState("");
  const [adjustFor, setAdjustFor] = useState<InvRow | null>(null);
  const [adjustQty, setAdjustQty] = useState("0");
  const [adjustReason, setAdjustReason] = useState("");

  const branches = useQuery({
    queryKey: ["branches-all", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("id, name").eq("tenant_id", tenantId!);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
    enabled: !!tenantId,
  });

  const inventory = useQuery({
    queryKey: ["inventory", tenantId, branchId],
    queryFn: async (): Promise<InvRow[]> => {
      // Base query: all products for tenant + optional filter by branch
      const products = await fetchAllRows<{ id: string; name: string; unit: string; min_stock: number }>(
        supabase.from("products").select("id, name, unit, min_stock")
          .eq("tenant_id", tenantId!).eq("is_active", true).order("id"),
      );

      let invQ = supabase.from("inventory").select("id, product_id, branch_id, quantity").eq("tenant_id", tenantId!);
      if (branchId !== "all") invQ = invQ.eq("branch_id", branchId);
      const inventoryRows = await fetchAllRows<{ id: string; product_id: string; branch_id: string; quantity: number }>(
        invQ.order("id"),
      );
      const invMap = new Map<string, { id: string; quantity: number; branch_id: string }>();
      for (const r of inventoryRows) {
        invMap.set(`${(r as { product_id: string }).product_id}::${(r as { branch_id: string }).branch_id}`, r as { id: string; quantity: number; branch_id: string; product_id: string });
      }

      const branchList = branchId !== "all" ? [branchId] : (branches.data ?? []).map((b) => b.id);
      const rows: InvRow[] = [];
      for (const p of products) {
        for (const bId of branchList) {
          const inv = invMap.get(`${p.id}::${bId}`);
          rows.push({
            id: inv?.id ?? `${p.id}::${bId}`,
            product_id: p.id,
            branch_id: bId,
            quantity: inv?.quantity ? Number(inv.quantity) : 0,
            product_name: p.name,
            product_unit: p.unit,
            min_stock: Number(p.min_stock),
            has_inventory_record: !!inv,
          });
        }
      }
      return rows;
    },
    enabled: !!tenantId && !!branches.data,
  });

  const filtered = useMemo(() => {
    const list = inventory.data ?? [];
    const s = search.trim().toLowerCase();
    return list.filter((r) => !s || r.product_name.toLowerCase().includes(s));
  }, [inventory.data, search]);

  const negativeStock = filtered.filter((r) => r.quantity < 0).length;
  const missingStock = filtered.filter((r) => !r.has_inventory_record).length;
  const belowMinStock = filtered.filter((r) => r.has_inventory_record && r.min_stock > 0 && r.quantity < r.min_stock).length;
  const lowStock = negativeStock + missingStock + belowMinStock;

  const branchMap = useMemo(() => new Map((branches.data ?? []).map((b) => [b.id, b.name])), [branches.data]);

  const canAdjust = isAdmin || isSuperOwner || role === "warehouse";

  const adjustMut = useMutation({
    mutationFn: async () => {
      if (!adjustFor || !tenantId) throw new Error("Missing");
      const target = Number(adjustQty);
      if (!Number.isFinite(target) || target < 0) throw new Error("قيمة غير صالحة");
      const delta = target - Number(adjustFor.quantity);
      if (delta === 0) return;

      const { error } = await supabase.rpc("adjust_inventory_balance", {
        _tenant_id: tenantId,
        _product_id: adjustFor.product_id,
        _branch_id: adjustFor.branch_id,
        _target_quantity: target,
        _reason: adjustReason || "تعديل يدوي",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("تم التعديل");
      setAdjustFor(null); setAdjustQty("0"); setAdjustReason("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="رصيد المخزون"
        subtitle={lowStock > 0 ? `${negativeStock} رصيد سالب • ${missingStock} غير مسجل • ${belowMinStock} دون الحد الأدنى` : "الرصيد الحالي لكل منتج/فرع"}
        action={
          <Button variant="outline" asChild>
            <Link to="/inventory/movements"><ArrowLeftRight className="ml-2 h-4 w-4" />الحركات</Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="ابحث بالمنتج..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
        </div>
        <Select value={branchId} onValueChange={setBranchId}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الفروع</SelectItem>
            {(branches.data ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {branches.isError ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">تعذر تحميل قائمة الفروع.</p>
          <Button variant="outline" onClick={() => branches.refetch()}>إعادة المحاولة</Button>
        </CardContent></Card>
      ) : inventory.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : inventory.isError ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">تعذر تحميل أرصدة المخزون. لم نعرض أرقاماً جزئية.</p>
          <Button variant="outline" onClick={() => inventory.refetch()}>إعادة المحاولة</Button>
        </CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Warehouse className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">لا توجد بيانات</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-right">
                  <tr>
                    <th className="p-3 font-medium">المنتج</th>
                    <th className="p-3 font-medium">الفرع</th>
                    <th className="p-3 font-medium">الرصيد</th>
                    <th className="p-3 font-medium">الحد الأدنى</th>
                    <th className="p-3 font-medium">الحالة</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const low = !r.has_inventory_record || r.quantity < 0 || (r.min_stock > 0 && r.quantity < r.min_stock);
                    const statusLabel = !r.has_inventory_record ? "غير مسجل" : r.quantity < 0 ? "رصيد سالب" : low ? "نقص" : "جيد";
                    return (
                      <tr key={r.id} className="border-t hover:bg-muted/30">
                        <td className="p-3 font-medium">{r.product_name}</td>
                        <td className="p-3 text-muted-foreground">{branchMap.get(r.branch_id) ?? "—"}</td>
                        <td className="p-3 num font-bold">{formatMoney(r.quantity, 2)} <span className="text-xs font-normal text-muted-foreground">{r.product_unit}</span></td>
                        <td className="p-3 num text-muted-foreground">{formatMoney(r.min_stock, 2)}</td>
                        <td className="p-3">
                          {low ? (
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${r.quantity < 0 || !r.has_inventory_record ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning"}`}>
                              <AlertTriangle className="h-3 w-3" />{statusLabel}
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">جيد</span>
                          )}
                        </td>
                        <td className="p-3">
                          {canAdjust && (
                            <Button size="sm" variant="ghost" onClick={() => { setAdjustFor(r); setAdjustQty(String(r.quantity)); }}>
                              <Settings2 className="ml-1 h-3 w-3" />تعديل
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!adjustFor} onOpenChange={(v) => { if (!v) setAdjustFor(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>جرد وتعديل الرصيد</DialogTitle></DialogHeader>
          {adjustFor && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/30 p-3">
                <div className="font-medium">{adjustFor.product_name}</div>
                <div className="text-xs text-muted-foreground">
                  الفرع: {branchMap.get(adjustFor.branch_id) ?? "—"} • الرصيد الحالي: <span className="num">{formatMoney(adjustFor.quantity)}</span> {adjustFor.product_unit}
                </div>
              </div>
              <div className="space-y-2">
                <Label>الرصيد الجديد</Label>
                <Input type="number" min="0" step="0.001" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} autoFocus />
              </div>
              <div className="space-y-2">
                <Label>السبب</Label>
                <Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="جرد شهري / تلف / ..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustFor(null)}>إلغاء</Button>
            <Button onClick={() => adjustMut.mutate()} disabled={adjustMut.isPending}>
              {adjustMut.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              حفظ التعديل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
