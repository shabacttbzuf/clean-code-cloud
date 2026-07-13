import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2,
  Search,
  Plus,
  Minus,
  Trash2,
  Banknote,
  CreditCard,
  Wallet,
  Printer,
  Pause,
  Save,
  X,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
import { printInvoiceHTML, type InvoiceData } from "@/lib/invoice-pdf";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/pos")({
  component: POSPage,
});

type Product = {
  id: string;
  name: string;
  sale_price: number;
  category_id: string | null;
  is_active: boolean;
};
type Category = { id: string; name: string };
type Branch = { id: string; name: string; tax_number: string | null; address: string | null; phone: string | null };
type Session = { id: string; branch_id: string; status: string };

type CartItem = { product_id: string; name: string; unit_price: number; quantity: number };

type PaymentUI = "cash" | "card" | "wallet";
const paymentToDb: Record<PaymentUI, "cash" | "card" | "transfer"> = {
  cash: "cash",
  card: "card",
  wallet: "transfer",
};

const DRAFTS_KEY = "pos-drafts-v1";
type Draft = { id: string; cart: CartItem[]; discount: string; created_at: string };

function loadDrafts(): Draft[] {
  try {
    return JSON.parse(localStorage.getItem(DRAFTS_KEY) || "[]") as Draft[];
  } catch {
    return [];
  }
}
function saveDrafts(list: Draft[]) {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(list));
}

function POSPage() {
  const { tenantId, tenant, userId, membership, isAdmin } = useActiveTenant();
  const qc = useQueryClient();

  const [branchId, setBranchId] = useState<string | null>(membership?.branch_id ?? null);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState("0");
  const [openSessionDialog, setOpenSessionDialog] = useState(false);
  const [openingBalance, setOpeningBalance] = useState("0");
  const [drafts, setDrafts] = useState<Draft[]>(() => (typeof window !== "undefined" ? loadDrafts() : []));
  const [paperSize, setPaperSize] = useState<"58mm" | "80mm" | "A4">("80mm");

  const branches = useQuery({
    queryKey: ["branches-active", tenantId],
    queryFn: async (): Promise<Branch[]> => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name, tax_number, address, phone")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as Branch[];
    },
    enabled: !!tenantId,
  });

  useEffect(() => {
    if (branchId) return;
    if (membership?.branch_id) setBranchId(membership.branch_id);
    else if (branches.data && branches.data.length > 0) setBranchId(branches.data[0].id);
  }, [branches.data, membership, branchId]);

  const currentBranch = useMemo(
    () => branches.data?.find((b) => b.id === branchId) ?? null,
    [branches.data, branchId],
  );

  const categories = useQuery({
    queryKey: ["categories-min", tenantId],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase.from("categories").select("id, name").eq("tenant_id", tenantId!).order("sort_order");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
    enabled: !!tenantId,
  });

  const products = useQuery({
    queryKey: ["products-pos", tenantId],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sale_price, category_id, is_active")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
    enabled: !!tenantId,
  });

  const openSession = useQuery({
    queryKey: ["open-session", userId, branchId],
    queryFn: async (): Promise<Session | null> => {
      if (!userId) return null;
      const { data, error } = await supabase.from("cash_sessions").select("id, branch_id, status").eq("cashier_id", userId).eq("status", "open").maybeSingle();
      if (error) throw error;
      return (data as Session | null) ?? null;
    },
    enabled: !!userId && !!tenantId,
  });

  const filteredProducts = useMemo(() => {
    const list = products.data ?? [];
    const s = search.trim().toLowerCase();
    return list.filter((p) => {
      if (catFilter !== "all" && p.category_id !== catFilter) return false;
      if (!s) return true;
      return p.name.toLowerCase().includes(s);
    });
  }, [products.data, search, catFilter]);

  const addToCart = (p: Product) => {
    setCart((prev) => {
      const found = prev.find((i) => i.product_id === p.id);
      if (found) return prev.map((i) => (i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i));
      return [...prev, { product_id: p.id, name: p.name, unit_price: Number(p.sale_price), quantity: 1 }];
    });
  };
  const inc = (id: string) => setCart((p) => p.map((i) => (i.product_id === id ? { ...i, quantity: i.quantity + 1 } : i)));
  const dec = (id: string) => setCart((p) => p.flatMap((i) => (i.product_id === id ? (i.quantity > 1 ? [{ ...i, quantity: i.quantity - 1 }] : []) : [i])));
  const remove = (id: string) => setCart((p) => p.filter((i) => i.product_id !== id));

  const totalQty = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);
  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.unit_price * i.quantity, 0), [cart]);
  const disc = Math.max(0, Number(discount) || 0);
  const taxable = Math.max(0, subtotal - disc);
  const taxRate = Number(tenant?.tax_rate ?? 0);
  const taxAmount = +(taxable * (taxRate / 100)).toFixed(2);
  const total = +(taxable + taxAmount).toFixed(2);

  const openSess = useMutation({
    mutationFn: async () => {
      if (!tenantId || !branchId || !userId) throw new Error("Missing context");
      const ob = Math.max(0, Number(openingBalance) || 0);
      const { error } = await supabase.from("cash_sessions").insert({
        tenant_id: tenantId,
        branch_id: branchId,
        cashier_id: userId,
        opening_balance: ob,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["open-session"] });
      toast.success("تم فتح الوردية");
      setOpenSessionDialog(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل فتح الوردية"),
  });

  const buildInvoice = (sale: { invoice_no: number; created_at: string }, items: CartItem[], method: PaymentUI): InvoiceData & {
    address?: string | null; phone?: string | null; tenant_name?: string | null; logo_url?: string | null;
  } => ({
    invoice_no: sale.invoice_no,
    created_at: sale.created_at,
    branch_name: currentBranch?.name ?? "",
    cashier_name: "",
    tax_number: currentBranch?.tax_number,
    address: currentBranch?.address,
    phone: currentBranch?.phone,
    tenant_name: tenant?.name ?? null,
    logo_url: tenant?.logo_url ?? null,
    currency: tenant?.currency ?? "SAR",
    subtotal,
    discount: disc,
    tax_amount: taxAmount,
    total,
    payment_method: paymentToDb[method],
    items: items.map((i) => ({
      product_name: i.name,
      quantity: i.quantity,
      unit_price: i.unit_price,
      line_total: +(i.unit_price * i.quantity).toFixed(2),
    })),
  });

  const checkoutMut = useMutation({
    mutationFn: async (method: PaymentUI) => {
      if (!tenantId || !branchId || !userId) throw new Error("سياق ناقص");
      if (cart.length === 0) throw new Error("السلة فارغة");
      if (!openSession.data) throw new Error("يجب فتح وردية أولاً");

      const dbMethod = paymentToDb[method];
      const { data: sale, error: saleErr } = await supabase
        .from("sales")
        .insert({
          tenant_id: tenantId,
          branch_id: branchId,
          cashier_id: userId,
          session_id: openSession.data.id,
          invoice_no: 0,
          subtotal,
          discount: disc,
          tax_amount: taxAmount,
          total,
          payment_method: dbMethod,
        })
        .select()
        .single();
      if (saleErr) throw saleErr;

      const items = cart.map((c) => ({
        tenant_id: tenantId,
        sale_id: sale.id,
        product_id: c.product_id,
        product_name: c.name,
        quantity: c.quantity,
        unit_price: c.unit_price,
        line_total: +(c.unit_price * c.quantity).toFixed(2),
        tax_rate: taxRate,
      }));
      const { error: itemsErr } = await supabase.from("sale_items").insert(items);
      if (itemsErr) throw itemsErr;

      const { error: payErr } = await supabase.from("payments").insert({
        tenant_id: tenantId,
        sale_id: sale.id,
        method: dbMethod,
        amount: total,
      });
      if (payErr) throw payErr;

      return { sale, method };
    },
    onSuccess: ({ sale, method }) => {
      toast.success(`تم إصدار فاتورة #${sale.invoice_no}`);
      const inv = buildInvoice(sale, cart, method);
      try { printInvoiceHTML(inv, paperSize); } catch (e) { console.error(e); }
      setCart([]);
      setDiscount("0");
      qc.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل إتمام البيع"),
  });

  const holdOrDraft = (label: string) => {
    if (cart.length === 0) return toast.info("السلة فارغة");
    const list = loadDrafts();
    const d: Draft = { id: crypto.randomUUID(), cart, discount, created_at: new Date().toISOString() };
    list.unshift(d);
    saveDrafts(list);
    setDrafts(list);
    setCart([]);
    setDiscount("0");
    toast.success(label);
  };
  const restoreDraft = (d: Draft) => {
    setCart(d.cart);
    setDiscount(d.discount);
    const list = loadDrafts().filter((x) => x.id !== d.id);
    saveDrafts(list);
    setDrafts(list);
  };

  const printPreview = () => {
    if (cart.length === 0) return toast.info("السلة فارغة");
    const inv = buildInvoice(
      { invoice_no: 0, created_at: new Date().toISOString() },
      cart,
      "cash",
    );
    printInvoiceHTML(inv, paperSize);
  };

  if (branches.isLoading || openSession.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!branches.data || branches.data.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="نقطة البيع" />
        <Card><CardContent className="py-10 text-center text-muted-foreground">لا توجد فروع مفعّلة. أنشئ فرعاً أولاً من صفحة الفروع.</CardContent></Card>
      </div>
    );
  }

  if (!openSession.data) {
    return (
      <div className="space-y-4">
        <PageHeader title="نقطة البيع" subtitle="افتح وردية للبدء بالبيع" />
        <Card className="max-w-md">
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label>الفرع</Label>
              <Select value={branchId ?? ""} onValueChange={setBranchId} disabled={!isAdmin && !!membership?.branch_id}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {branches.data.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>رصيد بداية الوردية</Label>
              <Input type="number" min="0" step="0.01" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} />
            </div>
            <Button className="w-full" disabled={!branchId || openSess.isPending} onClick={() => openSess.mutate()}>
              {openSess.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              فتح الوردية والبدء بالبيع
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currency = tenant?.currency ?? "";

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col gap-2 overflow-hidden p-1">
      <PageHeader
        title="نقطة البيع"
        subtitle={currentBranch?.name}
        action={
          <div className="flex items-center gap-2">
            <Select value={paperSize} onValueChange={(v) => setPaperSize(v as "58mm" | "80mm" | "A4")}>
              <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="58mm">حراري 58mm</SelectItem>
                <SelectItem value="80mm">حراري 80mm</SelectItem>
                <SelectItem value="A4">ورق A4</SelectItem>
              </SelectContent>
            </Select>
            <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success">وردية مفتوحة</span>
          </div>
        }
      />

      {/* Three-column layout — fits in one screen */}
      <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Left area: categories + products */}
        <div className="grid min-h-0 gap-2 md:grid-cols-[140px_minmax(0,1fr)] lg:grid-cols-[160px_minmax(0,1fr)]">
          {/* Categories */}
          <Card className="min-h-0 overflow-hidden">
            <CardContent className="flex h-full flex-col p-2">
              <div className="mb-1.5 flex items-center justify-between border-b pb-1">
                <h2 className="text-xs font-bold">الأقسام</h2>
                <span className="text-[10px] text-muted-foreground">{(categories.data?.length ?? 0) + 1}</span>
              </div>
              <div className="grid min-h-0 flex-1 grid-cols-1 gap-1.5 overflow-y-auto pr-0.5">
                <CategoryTile label="الكل" active={catFilter === "all"} onClick={() => setCatFilter("all")} />
                {(categories.data ?? []).map((c) => (
                  <CategoryTile key={c.id} label={c.name} active={catFilter === c.id} onClick={() => setCatFilter(c.id)} />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Products */}
          <Card className="min-h-0 overflow-hidden">
            <CardContent className="flex h-full flex-col p-2">
              <div className="mb-1.5 flex items-center gap-2 border-b pb-1">
                <h2 className="text-xs font-bold">المنتجات</h2>
                <div className="relative mr-auto w-56 max-w-full">
                  <Search className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="بحث..."
                    className="h-7 pr-7 text-xs"
                    autoFocus
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{filteredProducts.length}</span>
              </div>
              <div className="grid min-h-0 flex-1 grid-cols-3 gap-1.5 overflow-y-auto pr-0.5 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
                {filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addToCart(p)}
                    className="flex min-h-[62px] flex-col items-center justify-center rounded-md border bg-card p-1.5 text-center text-xs font-semibold leading-tight transition hover:border-primary hover:bg-primary/5 active:scale-95"
                  >
                    <span className="line-clamp-2">{p.name}</span>
                    <span className="mt-1 text-[10px] font-normal text-muted-foreground num">{formatMoney(Number(p.sale_price))}</span>
                  </button>
                ))}
                {filteredProducts.length === 0 && (
                  <div className="col-span-full grid place-items-center rounded-md border bg-muted/30 p-6 text-center text-xs text-muted-foreground">
                    لا توجد منتجات
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column: invoice */}
        <Card className="min-h-0 overflow-hidden">
          <CardContent className="flex h-full flex-col p-2">
            <div className="mb-1.5 flex flex-wrap items-center gap-2 border-b pb-1">
              <h2 className="text-xs font-bold">الفاتورة</h2>
            <span className="text-xs text-muted-foreground">
              {cart.length} صنف • كمية {totalQty}
            </span>
            {drafts.length > 0 && (
              <div className="mr-auto flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-muted-foreground">مسودات:</span>
                {drafts.slice(0, 3).map((d, idx) => (
                  <Button key={d.id} size="sm" variant="outline" className="h-6 px-1.5 text-[10px]" onClick={() => restoreDraft(d)}>
                    #{idx + 1} ({d.cart.length})
                  </Button>
                ))}
              </div>
            )}
            </div>

            {/* Items list */}
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/70 text-[10px]">
                  <tr>
                    <th className="p-1.5 text-right">المنتج</th>
                    <th className="p-1.5 text-center">الكمية</th>
                    <th className="p-1.5 text-center">الإجمالي</th>
                    <th className="p-1.5 text-center"></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-[11px] text-muted-foreground">
                        اضغط على أي منتج لإضافته
                      </td>
                    </tr>
                  ) : (
                    cart.map((i) => (
                      <tr key={i.product_id} className="border-t">
                        <td className="p-1.5 text-right">
                          <div className="font-medium leading-tight">{i.name}</div>
                          <div className="text-[10px] text-muted-foreground num">{formatMoney(i.unit_price)}</div>
                        </td>
                        <td className="p-1.5 text-center">
                          <div className="inline-flex items-center gap-0.5">
                            <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => dec(i.product_id)}>
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="min-w-6 text-center text-xs font-semibold num">{i.quantity}</span>
                            <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => inc(i.product_id)}>
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                        <td className="p-1.5 text-center font-bold num">{formatMoney(i.unit_price * i.quantity)}</td>
                        <td className="p-1.5 text-center">
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => remove(i.product_id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-1.5 rounded-md border bg-muted/30 p-2 text-xs">
              <div className="mb-1.5 flex items-center gap-2">
                <Label className="shrink-0 text-[10px] text-muted-foreground">خصم</Label>
                <Input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className="h-7 text-xs" />
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>الفرعي</span>
                <span className="num">{formatMoney(subtotal)}</span>
              </div>
              {disc > 0 && (
                <div className="flex justify-between text-destructive">
                  <span>الخصم</span>
                  <span className="num">-{formatMoney(disc)}</span>
                </div>
              )}
              {taxRate > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>ضريبة ({taxRate}%)</span>
                  <span className="num">{formatMoney(taxAmount)}</span>
                </div>
              )}
              <div className="mt-1 flex items-baseline justify-between border-t pt-1 text-lg font-black">
                <span>الإجمالي</span>
                <span className="num text-primary">
                  {formatMoney(total)} <span className="text-[10px] font-normal text-muted-foreground">{currency}</span>
                </span>
              </div>
            </div>

            {/* Payment buttons */}
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              <PayBtn icon={Banknote} label="نقدي" onClick={() => checkoutMut.mutate("cash")} disabled={checkoutMut.isPending || cart.length === 0} />
              <PayBtn icon={Wallet} label="محفظة" onClick={() => checkoutMut.mutate("wallet")} disabled={checkoutMut.isPending || cart.length === 0} />
              <PayBtn icon={CreditCard} label="بطاقة" onClick={() => checkoutMut.mutate("card")} disabled={checkoutMut.isPending || cart.length === 0} />
            </div>

            {/* Action row */}
            <div className="mt-1.5 grid grid-cols-4 gap-1">
              <Button variant="outline" size="sm" className="h-8 px-1 text-[10px]" onClick={() => holdOrDraft("تم التعليق")}> <Pause className="ml-0.5 h-3 w-3" />تعليق</Button>
              <Button variant="outline" size="sm" className="h-8 px-1 text-[10px]" onClick={() => holdOrDraft("تم الحفظ")}> <Save className="ml-0.5 h-3 w-3" />مسودة</Button>
              <Button variant="outline" size="sm" className="h-8 px-1 text-[10px]" onClick={printPreview}> <Printer className="ml-0.5 h-3 w-3" />طباعة</Button>
              <Button variant="outline" size="sm" className="h-8 px-1 text-[10px] text-destructive" onClick={() => { setCart([]); setDiscount("0"); }} disabled={cart.length === 0}>
                <X className="ml-0.5 h-3 w-3" />إلغاء
              </Button>
            </div>
            <Button
              size="sm"
              className="mt-1.5 h-10 bg-success text-sm font-bold text-success-foreground hover:bg-success/90"
              onClick={() => checkoutMut.mutate("cash")}
              disabled={checkoutMut.isPending || cart.length === 0}
            >
              {checkoutMut.isPending ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="ml-1 h-4 w-4" />}
              إتمام البيع
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CategoryTile({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid min-h-[44px] place-items-center rounded-md border p-1.5 text-center text-[11px] font-semibold leading-tight transition active:scale-95 ${
        active ? "border-primary bg-primary text-primary-foreground shadow" : "bg-card hover:border-primary hover:bg-primary/5"
      }`}
    >
      <span className="line-clamp-2">{label}</span>
    </button>
  );
}

function PayBtn({ icon: Icon, label, onClick, disabled }: { icon: typeof Banknote; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      className="flex h-11 flex-col gap-0.5 border hover:border-primary hover:bg-primary/5"
    >
      <Icon className="h-4 w-4" />
      <span className="text-[10px] font-semibold">{label}</span>
    </Button>
  );
}