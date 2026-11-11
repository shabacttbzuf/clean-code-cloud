import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  image_url: string | null;
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
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewMethod, setReviewMethod] = useState<PaymentUI>("cash");
  const beginCheckout = (method: PaymentUI) => {
    if (cart.length === 0) return toast.info("الفاتورة فارغة");
    setReviewMethod(method);
    setReviewOpen(true);
  };

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
        .select("id, name, sale_price, category_id, is_active, image_url")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
    enabled: !!tenantId,
  });

  const inventory = useQuery({
    queryKey: ["pos-inventory", tenantId, branchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory")
        .select("product_id, quantity")
        .eq("tenant_id", tenantId!)
        .eq("branch_id", branchId!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId && !!branchId,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const stockByProduct = useMemo(
    () => new Map((inventory.data ?? []).map((row) => [row.product_id, Number(row.quantity)])),
    [inventory.data],
  );

  const openSession = useQuery({
    queryKey: ["open-session", userId, branchId],
    queryFn: async (): Promise<Session | null> => {
      if (!userId) return null;
      const { data, error } = await supabase.from("cash_sessions").select("id, branch_id, status").eq("tenant_id", tenantId!)
        .eq("branch_id", branchId!)
        .eq("cashier_id", userId)
        .eq("status", "open")
        .maybeSingle();
      if (error) throw error;
      return (data as Session | null) ?? null;
    },
    enabled: !!userId && !!tenantId && !!branchId,
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
    if (inventory.isLoading || inventory.isError) {
      toast.error("لا يمكن إضافة المنتج قبل التحقق من المخزون");
      return;
    }
    const available = stockByProduct.get(p.id);
    const current = cart.find((item) => item.product_id === p.id)?.quantity ?? 0;
    if (available === undefined) {
      toast.error("لا يوجد رصيد مخزون مسجل لهذا المنتج في الفرع");
      return;
    }
    if (available <= current) {
      toast.error(available <= 0 ? "المنتج غير متوفر في المخزون" : "الكمية المطلوبة تتجاوز المخزون المتاح");
      return;
    }
    setCart((prev) => {
      const found = prev.find((item) => item.product_id === p.id);
      if (found) return prev.map((item) => (item.product_id === p.id ? { ...item, quantity: item.quantity + 1 } : item));
      return [...prev, { product_id: p.id, name: p.name, unit_price: Number(p.sale_price), quantity: 1 }];
    });
  };
  const inc = (id: string) => {
    const item = cart.find((entry) => entry.product_id === id);
    const available = stockByProduct.get(id);
    if (inventory.isLoading || inventory.isError || !item || available === undefined || item.quantity >= available) {
      toast.error("لا يمكن زيادة الكمية؛ تحقق من رصيد المخزون");
      return;
    }
    setCart((prev) => prev.map((entry) => (entry.product_id === id ? { ...entry, quantity: entry.quantity + 1 } : entry)));
  };
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

  const buildInvoice = (
    sale: {
      invoice_no: number;
      created_at: string;
      subtotal: number;
      discount: number;
      tax_amount: number;
      total: number;
    },
    items: Array<{ name: string; unit_price: number; quantity: number }>,
    method: PaymentUI,
  ): InvoiceData & {
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
    subtotal: Number(sale.subtotal),
    discount: Number(sale.discount),
    tax_amount: Number(sale.tax_amount),
    total: Number(sale.total),
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
      const { data: sale, error: saleErr } = await supabase.rpc("create_sale_with_items", {
        _tenant_id: tenantId,
        _branch_id: branchId,
        _cashier_id: userId,
        _session_id: openSession.data.id,
        _discount: disc,
        _payment_method: dbMethod,
        _items: cart.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
        })),
      });
      if (saleErr) throw saleErr;
      if (!sale) throw new Error("لم يتم إنشاء الفاتورة.");

      // Read the committed item snapshots for printing. A read failure must
      // not cause a retry of an already-committed sale.
      const { data: savedItems, error: savedItemsError } = await supabase
        .from("sale_items")
        .select("product_name, quantity, unit_price")
        .eq("sale_id", sale.id);
      if (savedItemsError) console.error("Could not load committed sale items", savedItemsError);

      const invoiceItems = savedItems?.map((item) => ({
        name: item.product_name,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
      })) ?? cart.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
      }));

      return { sale, method, items: invoiceItems };
    },
    onSuccess: ({ sale, method, items }) => {
      setReviewOpen(false);
      toast.success(`تم إصدار فاتورة #${sale.invoice_no}`);
      const inv = buildInvoice(sale, items, method);
      try { printInvoiceHTML(inv, paperSize); } catch (e) { console.error(e); }
      setCart([]);
      setDiscount("0");
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["pos-inventory", tenantId, branchId] });
      qc.invalidateQueries({ queryKey: ["inventory-movements"] });
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
      {
        invoice_no: 0,
        created_at: new Date().toISOString(),
        subtotal,
        discount: disc,
        tax_amount: taxAmount,
        total,
      },
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
    <div className="flex h-[calc(100dvh-7rem)] min-h-[420px] flex-col gap-2 overflow-hidden p-1">
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

      {/* Responsive POS: category chips, dense product grid and a reviewable invoice. */}
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-2 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-1">
        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2">
          <Card className="overflow-hidden">
            <CardContent className="p-2">
              <div className="mb-1 flex items-center justify-between border-b pb-1">
                <h2 className="text-xs font-bold">الأقسام</h2>
                <span className="text-[10px] text-muted-foreground">{(categories.data?.length ?? 0) + 1} قسم</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <CategoryTile label="الكل" active={catFilter === "all"} onClick={() => setCatFilter("all")} />
                {(categories.data ?? []).map((category) => (
                  <CategoryTile key={category.id} label={category.name} active={catFilter === category.id} onClick={() => setCatFilter(category.id)} />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-0 overflow-hidden">
            <CardContent className="flex h-full flex-col p-2">
              <div className="mb-1.5 flex items-center gap-2 border-b pb-1">
                <h2 className="text-xs font-bold">المنتجات</h2>
                <div className="relative mr-auto w-56 max-w-full">
                  <Search className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن منتج..." className="h-8 pr-7 text-xs" />
                </div>
                <span className="text-[10px] text-muted-foreground">{filteredProducts.length} منتج</span>
              </div>
              <div className="grid min-h-0 flex-1 content-start grid-cols-4 gap-1.5 overflow-y-auto p-0.5 sm:grid-cols-5 md:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
                {filteredProducts.map((product) => {
                  const available = stockByProduct.get(product.id);
                  const stockUnavailable = inventory.isLoading || inventory.isError || available === undefined || available <= 0;
                  const stockLabel = inventory.isLoading
                    ? "جاري التحقق"
                    : inventory.isError
                      ? "تعذر المخزون"
                      : available === undefined
                        ? "غير مسجل"
                        : available < 0
                          ? `رصيد سالب: ${available}`
                          : available === 0
                            ? "نفد المخزون"
                            : `متاح: ${available}`;
                  return (
                    <button key={product.id} type="button" onClick={() => addToCart(product)}
                      disabled={stockUnavailable || checkoutMut.isPending}
                      title={stockLabel}
                      className="flex min-h-[66px] flex-col items-center justify-center rounded-lg border bg-card p-1 text-center text-[10px] font-semibold leading-tight shadow-sm transition hover:border-primary hover:bg-primary/5 active:scale-95 disabled:cursor-not-allowed disabled:opacity-55 sm:min-h-[70px] sm:p-1.5 sm:text-xs">
                      <span className="relative mb-0.5 grid h-7 w-7 place-items-center overflow-hidden rounded-md bg-muted text-xs font-black text-muted-foreground">
                        {product.name.slice(0, 1)}
                        {product.image_url && <img src={product.image_url} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
                      </span>
                      <span className="line-clamp-1 w-full">{product.name}</span>
                      <span className="mt-0.5 text-[10px] font-bold text-primary num">{formatMoney(Number(product.sale_price))}</span>
                      <span className={`mt-0.5 text-[9px] font-semibold ${available !== undefined && available > 0 ? "text-success" : "text-destructive"}`}>{stockLabel}</span>
                    </button>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <div className="col-span-full grid place-items-center rounded-md border bg-muted/30 p-6 text-center text-xs text-muted-foreground">لا توجد منتجات مطابقة</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="hidden min-h-0 overflow-hidden lg:block">
          <CardContent className="flex h-full flex-col p-2">
            <div className="mb-1.5 flex flex-wrap items-center gap-2 border-b pb-1">
              <h2 className="text-xs font-bold">الفاتورة الحالية</h2>
              <span className="text-xs text-muted-foreground">{cart.length} صنف • {totalQty} قطعة</span>
              {drafts.length > 0 && (
                <div className="mr-auto flex flex-wrap items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">مسودات:</span>
                  {drafts.slice(0, 3).map((draft, index) => (
                    <Button key={draft.id} size="sm" variant="outline" className="h-6 px-1.5 text-[10px]" onClick={() => restoreDraft(draft)}>
                      #{index + 1} ({draft.cart.length})
                    </Button>
                  ))}
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/70 text-[10px]">
                  <tr><th className="p-1.5 text-right">المنتج</th><th className="p-1.5 text-center">الكمية</th><th className="p-1.5 text-center">الإجمالي</th><th className="p-1.5 text-center"></th></tr>
                </thead>
                <tbody>
                  {cart.length === 0 ? (
                    <tr><td colSpan={4} className="p-6 text-center text-[11px] text-muted-foreground">أضف المنتجات لتكوين الفاتورة</td></tr>
                  ) : cart.map((item) => (
                    <tr key={item.product_id} className="border-t">
                      <td className="p-1.5 text-right"><div className="font-medium leading-tight">{item.name}</div><div className="text-[10px] text-muted-foreground num">{formatMoney(item.unit_price)}</div></td>
                      <td className="p-1.5 text-center"><div className="inline-flex items-center gap-0.5">
                        <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => dec(item.product_id)} disabled={checkoutMut.isPending}><Minus className="h-3 w-3" /></Button>
                        <span className="min-w-6 text-center font-semibold num">{item.quantity}</span>
                        <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => inc(item.product_id)} disabled={checkoutMut.isPending || inventory.isLoading || inventory.isError || (stockByProduct.get(item.product_id) ?? 0) <= item.quantity}><Plus className="h-3 w-3" /></Button>
                      </div></td>
                      <td className="p-1.5 text-center font-bold num">{formatMoney(item.unit_price * item.quantity)}</td>
                      <td className="p-1.5 text-center"><Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" aria-label="حذف الصنف" onClick={() => remove(item.product_id)} disabled={checkoutMut.isPending}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-1.5 rounded-md border bg-muted/30 p-2 text-xs">
              <div className="mb-1.5 flex items-center gap-2"><Label className="shrink-0 text-[10px] text-muted-foreground">الخصم</Label><Input type="number" min="0" max={subtotal} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className="h-7 text-xs" disabled={checkoutMut.isPending} /></div>
              <div className="flex justify-between text-muted-foreground"><span>المجموع الفرعي</span><span className="num">{formatMoney(subtotal)}</span></div>
              {disc > 0 && <div className="flex justify-between text-destructive"><span>الخصم</span><span className="num">-{formatMoney(disc)}</span></div>}
              {taxRate > 0 && <div className="flex justify-between text-muted-foreground"><span>الضريبة ({taxRate}%)</span><span className="num">{formatMoney(taxAmount)}</span></div>}
              <div className="mt-1 flex items-baseline justify-between border-t pt-1 text-lg font-black"><span>الإجمالي</span><span className="num text-primary">{formatMoney(total)} <span className="text-[10px] font-normal text-muted-foreground">{currency}</span></span></div>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              <PayBtn icon={Banknote} label="نقدي" onClick={() => beginCheckout("cash")} disabled={checkoutMut.isPending || cart.length === 0} />
              <PayBtn icon={Wallet} label="محفظة" onClick={() => beginCheckout("wallet")} disabled={checkoutMut.isPending || cart.length === 0} />
              <PayBtn icon={CreditCard} label="بطاقة" onClick={() => beginCheckout("card")} disabled={checkoutMut.isPending || cart.length === 0} />
            </div>
            <div className="mt-1.5 grid grid-cols-4 gap-1">
              <Button variant="outline" size="sm" className="h-8 px-1 text-[10px]" onClick={() => holdOrDraft("تم تعليق الفاتورة")}><Pause className="ml-0.5 h-3 w-3" />تعليق</Button>
              <Button variant="outline" size="sm" className="h-8 px-1 text-[10px]" onClick={() => holdOrDraft("تم حفظ المسودة")}><Save className="ml-0.5 h-3 w-3" />مسودة</Button>
              <Button variant="outline" size="sm" className="h-8 px-1 text-[10px]" onClick={printPreview}><Printer className="ml-0.5 h-3 w-3" />معاينة</Button>
              <Button variant="outline" size="sm" className="h-8 px-1 text-[10px] text-destructive" onClick={() => { setCart([]); setDiscount("0"); }} disabled={cart.length === 0}><X className="ml-0.5 h-3 w-3" />إلغاء</Button>
            </div>
            <Button size="sm" className="mt-1.5 h-10 bg-success text-sm font-bold text-success-foreground hover:bg-success/90" onClick={() => beginCheckout("cash")} disabled={checkoutMut.isPending || cart.length === 0}>
              <CheckCircle2 className="ml-1 h-4 w-4" />مراجعة وإتمام البيع
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:hidden">
          <CardContent className="flex items-center gap-2 p-2">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-muted-foreground">الفاتورة • {cart.length} أصناف / {totalQty} قطع</div>
              <div className="text-lg font-black text-primary num">{formatMoney(total)} <span className="text-xs font-normal text-muted-foreground">{currency}</span></div>
            </div>
            <Button size="sm" className="h-10 shrink-0 font-bold" onClick={() => beginCheckout("cash")} disabled={checkoutMut.isPending || cart.length === 0}>مراجعة الفاتورة</Button>
            <Button size="icon" variant="outline" className="h-10 w-10 shrink-0" aria-label="حفظ مسودة" onClick={() => holdOrDraft("تم حفظ المسودة")} disabled={cart.length === 0}><Save className="h-4 w-4" /></Button>
            <Button size="icon" variant="outline" className="h-10 w-10 shrink-0" aria-label="معاينة وطباعة الفاتورة" onClick={printPreview} disabled={cart.length === 0}><Printer className="h-4 w-4" /></Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={reviewOpen} onOpenChange={(open) => { if (!checkoutMut.isPending) setReviewOpen(open); }}>
        <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>مراجعة الفاتورة قبل الإصدار</DialogTitle>
            <DialogDescription>راجع الأصناف والكميات والأسعار، ويمكنك الزيادة أو التخفيض أو حذف أي صنف قبل اعتماد البيع.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[320px] text-xs">
                <thead className="bg-muted/60"><tr><th className="p-2 text-right">الصنف</th><th className="p-2 text-center">الكمية</th><th className="p-2 text-center">السعر</th><th className="p-2 text-center">الإجمالي</th><th className="p-2"></th></tr></thead>
                <tbody>
                  {cart.map((item) => (
                    <tr key={item.product_id} className="border-t">
                      <td className="p-2 font-medium">{item.name}</td>
                      <td className="p-2"><div className="flex items-center justify-center gap-1">
                        <Button size="icon" variant="outline" className="h-7 w-7" aria-label="تقليل الكمية" onClick={() => dec(item.product_id)} disabled={checkoutMut.isPending}><Minus className="h-3 w-3" /></Button>
                        <span className="min-w-6 text-center font-bold num">{item.quantity}</span>
                        <Button size="icon" variant="outline" className="h-7 w-7" aria-label="زيادة الكمية" onClick={() => inc(item.product_id)} disabled={checkoutMut.isPending || inventory.isLoading || inventory.isError || (stockByProduct.get(item.product_id) ?? 0) <= item.quantity}><Plus className="h-3 w-3" /></Button>
                      </div></td>
                      <td className="p-2 text-center num">{formatMoney(item.unit_price)}</td>
                      <td className="p-2 text-center font-bold num">{formatMoney(item.unit_price * item.quantity)}</td>
                      <td className="p-2 text-center"><Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" aria-label="حذف الصنف" onClick={() => remove(item.product_id)} disabled={checkoutMut.isPending}><Trash2 className="h-4 w-4" /></Button></td>
                    </tr>
                  ))}
                  {cart.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">أصبحت الفاتورة فارغة؛ أغلق المراجعة وأضف المنتجات من جديد.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
              <div className="space-y-1"><Label className="text-xs">الخصم</Label><Input type="number" min="0" max={subtotal} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} disabled={checkoutMut.isPending} /></div>
              <div className="space-y-1"><Label className="text-xs">طريقة الدفع</Label><Select value={reviewMethod} onValueChange={(value) => setReviewMethod(value as PaymentUI)} disabled={checkoutMut.isPending}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">نقداً</SelectItem><SelectItem value="wallet">محفظة / تحويل</SelectItem><SelectItem value="card">بطاقة</SelectItem></SelectContent></Select></div>
              <div className="flex justify-between text-sm text-muted-foreground"><span>المجموع الفرعي</span><span className="num">{formatMoney(subtotal)}</span></div>
              <div className="flex justify-between text-sm text-muted-foreground"><span>الخصم</span><span className="num">-{formatMoney(disc)}</span></div>
              <div className="flex justify-between text-sm text-muted-foreground"><span>الضريبة ({taxRate}%)</span><span className="num">{formatMoney(taxAmount)}</span></div>
              <div className="flex justify-between border-t pt-2 text-base font-black"><span>الإجمالي</span><span className="text-primary num">{formatMoney(total)} {currency}</span></div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setReviewOpen(false)} disabled={checkoutMut.isPending}>العودة للتعديل</Button>
            <Button className="bg-success font-bold text-success-foreground hover:bg-success/90" disabled={checkoutMut.isPending || cart.length === 0 || disc > subtotal}
              onClick={() => checkoutMut.mutate(reviewMethod)}>
              {checkoutMut.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="ml-2 h-4 w-4" />}
              تأكيد وإصدار الفاتورة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryTile({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active
        ? "inline-flex min-h-8 items-center justify-center rounded-full border border-primary bg-primary px-3 py-1 text-center text-[10px] font-semibold leading-tight text-primary-foreground shadow transition active:scale-95 sm:min-h-9 sm:text-xs"
        : "inline-flex min-h-8 items-center justify-center rounded-full border bg-card px-3 py-1 text-center text-[10px] font-semibold leading-tight transition hover:border-primary hover:bg-primary/5 active:scale-95 sm:min-h-9 sm:text-xs"}
    >
      <span className="line-clamp-1">{label}</span>
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