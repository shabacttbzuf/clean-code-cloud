import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, Trash2, Package, Loader2, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
});

type Product = {
  id: string;
  tenant_id: string;
  category_id: string | null;
  name: string;
  sku: string | null;
  image_url: string | null;
  cost_price: number;
  sale_price: number;
  unit: string;
  min_stock: number;
  is_active: boolean;
};

type Category = { id: string; name: string };

const schema = z.object({
  name: z.string().trim().min(2, "الاسم قصير").max(120),
  sku: z.string().trim().max(50).optional().or(z.literal("")),
  category_id: z.string().uuid().nullable(),
  cost_price: z.coerce.number().min(0),
  sale_price: z.coerce.number().min(0),
  unit: z.string().trim().min(1).max(20),
  min_stock: z.coerce.number().min(0),
  is_active: z.boolean(),
  image_url: z.string().url().nullable().optional(),
});

function ProductsPage() {
  const { tenantId, isAdmin, tenant } = useActiveTenant();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");

  const cats = useQuery({
    queryKey: ["categories-min", tenantId],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase.from("categories").select("id, name").eq("tenant_id", tenantId!).order("sort_order");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
    enabled: !!tenantId,
  });

  const products = useQuery({
    queryKey: ["products", tenantId],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase.from("products").select("*").eq("tenant_id", tenantId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Product[];
    },
    enabled: !!tenantId,
  });

  const catMap = useMemo(() => new Map((cats.data ?? []).map((c) => [c.id, c.name])), [cats.data]);

  const filtered = useMemo(() => {
    const list = products.data ?? [];
    const s = search.trim().toLowerCase();
    return list.filter((p) => {
      if (filterCat !== "all" && p.category_id !== filterCat) return false;
      if (!s) return true;
      return p.name.toLowerCase().includes(s) || (p.sku ?? "").toLowerCase().includes(s);
    });
  }, [products.data, search, filterCat]);

  const upsert = useMutation({
    mutationFn: async (v: z.infer<typeof schema>) => {
      const payload = { ...v, sku: v.sku || null, tenant_id: tenantId! };
      if (editing) {
        const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", tenantId] });
      toast.success("تم الحفظ");
      setOpen(false); setEditing(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", tenantId] });
      toast.success("تم الحذف");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل الحذف"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="المنتجات"
        subtitle="أدر منتجات مطعمك مع الأسعار والصور والحد الأدنى للمخزون."
        action={
          isAdmin && (
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
              <DialogTrigger asChild>
                <Button><Plus className="ml-2 h-4 w-4" />منتج جديد</Button>
              </DialogTrigger>
              <ProductDialog
                initial={editing}
                categories={cats.data ?? []}
                tenantId={tenantId!}
                onSubmit={(v) => upsert.mutate(v)}
                pending={upsert.isPending}
              />
            </Dialog>
          )
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="ابحث بالاسم أو SKU..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="sm:w-48"><SelectValue placeholder="كل الأقسام" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأقسام</SelectItem>
            {(cats.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {products.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Package className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">
            {search || filterCat !== "all" ? "لا توجد نتائج" : "لا توجد منتجات بعد"}
          </p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <Card key={p.id} className="overflow-hidden">
              <div className="aspect-square bg-muted">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center"><Package className="h-10 w-10 text-muted-foreground/40" /></div>
                )}
              </div>
              <CardContent className="p-3">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{p.name}</div>
                    {p.category_id && (
                      <div className="text-xs text-muted-foreground">{catMap.get(p.category_id) ?? "—"}</div>
                    )}
                  </div>
                  {!p.is_active && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">متوقف</span>}
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-lg font-bold text-primary num">
                    {Number(p.sale_price).toFixed(2)} <span className="text-xs font-normal text-muted-foreground">{tenant?.currency ?? ""}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">/{p.unit}</span>
                </div>
                {isAdmin && (
                  <div className="mt-3 flex gap-1 border-t pt-3">
                    <Button size="sm" variant="ghost" className="flex-1" onClick={() => { setEditing(p); setOpen(true); }}>
                      <Edit className="ml-2 h-3 w-3" />تعديل
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => {
                      if (confirm(`حذف "${p.name}"؟`)) del.mutate(p.id);
                    }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductDialog({
  initial,
  categories,
  tenantId,
  onSubmit,
  pending,
}: {
  initial: Product | null;
  categories: Category[];
  tenantId: string;
  onSubmit: (v: z.infer<typeof schema>) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [sku, setSku] = useState(initial?.sku ?? "");
  const [categoryId, setCategoryId] = useState<string>(initial?.category_id ?? "none");
  const [cost, setCost] = useState(String(initial?.cost_price ?? 0));
  const [sale, setSale] = useState(String(initial?.sale_price ?? 0));
  const [unit, setUnit] = useState(initial?.unit ?? "piece");
  const [minStock, setMinStock] = useState(String(initial?.min_stock ?? 0));
  const [active, setActive] = useState(initial?.is_active ?? true);
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.image_url ?? null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("الحجم الأقصى 5MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${tenantId}/products/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("restaurant-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = await supabase.storage.from("restaurant-assets").createSignedUrl(path, 60 * 60 * 24 * 365);
      if (data?.signedUrl) setImageUrl(data.signedUrl);
      toast.success("تم رفع الصورة");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "فشل الرفع");
    } finally {
      setUploading(false);
    }
  }

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{initial ? "تعديل منتج" : "منتج جديد"}</DialogTitle></DialogHeader>
      <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault();
        try {
          onSubmit(schema.parse({
            name, sku,
            category_id: categoryId === "none" ? null : categoryId,
            cost_price: cost, sale_price: sale, unit, min_stock: minStock,
            is_active: active, image_url: imageUrl,
          }));
        } catch (err) {
          if (err instanceof z.ZodError) toast.error(err.issues[0].message);
        }
      }}>
        <div className="space-y-2">
          <Label>الصورة</Label>
          <div className="flex items-center gap-3">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-muted">
              {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><Package className="h-6 w-6 text-muted-foreground" /></div>}
            </div>
            <label className="flex-1">
              <div className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground hover:bg-muted/50">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? "جاري الرفع..." : "اختر صورة"}
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2 col-span-2">
            <Label>اسم المنتج</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>SKU (اختياري)</Label>
            <Input value={sku} onChange={(e) => setSku(e.target.value)} dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label>الوحدة</Label>
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="piece / kg / L" dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label>القسم</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون قسم</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>الحد الأدنى للمخزون</Label>
            <Input type="number" min="0" step="0.01" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>تكلفة الشراء</Label>
            <Input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>سعر البيع</Label>
            <Input type="number" min="0" step="0.01" value={sale} onChange={(e) => setSale(e.target.value)} required />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <Label>المنتج نشط</Label>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>

        <DialogFooter>
          <Button type="submit" disabled={pending || uploading}>
            {pending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            حفظ
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
