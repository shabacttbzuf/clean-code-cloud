import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Gift, Loader2, Plus, Archive, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/promotions")({ component: PromotionsPage });

type Offer = {
  id: string; tenant_id: string; company_id: string | null; branch_id: string | null;
  name: string; description: string; offer_type: "percentage" | "fixed" | "buy_x_get_y";
  discount_value: number; minimum_subtotal: number; max_discount: number | null;
  product_id: string | null; reward_product_id: string | null; buy_quantity: number; get_quantity: number;
  starts_at: string | null; ends_at: string | null; usage_limit: number | null; status: string;
};
type Product = { id: string; name: string; sale_price: number; is_active: boolean };
type Branch = { id: string; name: string };

const emptyForm = {
  name: "", description: "", offer_type: "percentage" as Offer["offer_type"],
  discount_value: "10", minimum_subtotal: "0", max_discount: "", product_id: "",
  reward_product_id: "", buy_quantity: "1", get_quantity: "1", branch_id: "",
  starts_at: "", ends_at: "", usage_limit: "",
};

function PromotionsPage() {
  const { tenantId, role, membership, isSuperOwner, hasPermission } = useActiveTenant();
  const qc = useQueryClient();
  const isTenantOwner = role === "owner" && !membership?.company_id;
  const canManage = isSuperOwner || isTenantOwner || hasPermission("promotions.manage");
  const [form, setForm] = useState({ ...emptyForm, branch_id: membership?.branch_id && !membership?.company_id ? membership.branch_id : "" });
  const [editing, setEditing] = useState<string | null>(null);

  const products = useQuery({
    queryKey: ["promotion-products", tenantId],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase.from("products").select("id,name,sale_price,is_active")
        .eq("tenant_id", tenantId!).eq("is_active", true).order("name");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
    enabled: !!tenantId && canManage,
  });
  const branches = useQuery({
    queryKey: ["promotion-branches", tenantId, membership?.company_id, membership?.branch_id],
    queryFn: async (): Promise<Branch[]> => {
      let query = supabase.from("branches").select("id,name").eq("tenant_id", tenantId!).eq("is_active", true);
      if (membership?.company_id) query = query.eq("company_id", membership.company_id);
      if (membership?.branch_id && !isTenantOwner && !isSuperOwner) query = query.eq("id", membership.branch_id);
      const { data, error } = await query.order("name");
      if (error) throw error;
      return (data ?? []) as Branch[];
    },
    enabled: !!tenantId && canManage,
  });
  const offers = useQuery({
    queryKey: ["promotional-offers", tenantId, membership?.company_id, membership?.branch_id],
    queryFn: async (): Promise<Offer[]> => {
      let query = (supabase.from("promotional_offers" as any) as any).select("*")
        .eq("tenant_id", tenantId!).order("created_at", { ascending: false });
      if (membership?.company_id) query = query.eq("company_id", membership.company_id);
      if (membership?.branch_id && !membership?.company_id && !isTenantOwner && !isSuperOwner) query = query.eq("branch_id", membership.branch_id);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Offer[];
    },
    enabled: !!tenantId && canManage,
  });
  const redemptions = useQuery({
    queryKey: ["promotion-redemptions", tenantId, membership?.company_id, membership?.branch_id],
    queryFn: async () => {
      let query = (supabase.from("promotion_redemptions" as any) as any)
        .select("promotion_id,discount_amount,created_at").eq("tenant_id", tenantId!);
      if (membership?.company_id) query = query.eq("company_id", membership.company_id);
      if (membership?.branch_id && !membership?.company_id && !isTenantOwner && !isSuperOwner) query = query.eq("branch_id", membership.branch_id);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Array<{promotion_id:string;discount_amount:number;created_at:string}>;
    },
    enabled: !!tenantId && canManage,
  });

  const stats = useMemo(() => {
    const map = new Map<string, { count: number; discount: number }>();
    for (const row of redemptions.data ?? []) {
      const current = map.get(row.promotion_id) ?? { count: 0, discount: 0 };
      current.count += 1;
      current.discount += Number(row.discount_amount) || 0;
      map.set(row.promotion_id, current);
    }
    return map;
  }, [redemptions.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("لم يتم تحديد الشركة");
      const name = form.name.trim();
      if (name.length < 2 || name.length > 120) throw new Error("اسم العرض يجب أن يكون بين حرفين و120 حرفاً");
      const value = Number(form.discount_value);
      const minimum = Number(form.minimum_subtotal);
      const maxDiscount = form.max_discount.trim() ? Number(form.max_discount) : null;
      const buy = Number(form.buy_quantity), get = Number(form.get_quantity);
      if (!Number.isFinite(minimum) || minimum < 0) throw new Error("الحد الأدنى للفاتورة غير صحيح");
      if (form.offer_type !== "buy_x_get_y" && (!Number.isFinite(value) || value <= 0 || (form.offer_type === "percentage" && value > 100))) throw new Error("قيمة الخصم غير صحيحة");
      if (form.offer_type === "buy_x_get_y" && (!form.product_id || !Number.isInteger(buy) || buy < 1 || !Number.isInteger(get) || get < 1)) throw new Error("حدد المنتج وكميات اشترِ واحصل على صحيحة");
      if (maxDiscount !== null && (!Number.isFinite(maxDiscount) || maxDiscount <= 0)) throw new Error("الحد الأقصى للخصم غير صحيح");
      if (form.starts_at && form.ends_at && new Date(form.ends_at) <= new Date(form.starts_at)) throw new Error("تاريخ النهاية يجب أن يكون بعد البداية");
      const usageLimit = form.usage_limit.trim() ? Number(form.usage_limit) : null;
      if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1)) throw new Error("عدد مرات الاستخدام غير صحيح");
      const payload = {
        tenant_id: tenantId,
        company_id: membership?.company_id ?? null,
        branch_id: form.branch_id || null,
        name, description: form.description.trim(), offer_type: form.offer_type,
        discount_value: form.offer_type === "buy_x_get_y" ? 0 : value,
        minimum_subtotal: minimum, max_discount: maxDiscount,
        product_id: form.product_id || null,
        reward_product_id: form.reward_product_id || null,
        buy_quantity: buy, get_quantity: get,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        usage_limit: usageLimit,
      };
      const table = supabase.from("promotional_offers" as any) as any;
      const result = editing
        ? await table.update(payload).eq("id", editing).eq("tenant_id", tenantId)
        : await table.insert({ ...payload, status: "draft" });
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      toast.success(editing ? "تم تحديث العرض" : "تم حفظ العرض كمسودة");
      resetForm();
      void qc.invalidateQueries({ queryKey: ["promotional-offers", tenantId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر حفظ العرض"),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: {id:string;status:string}) => {
      const { error } = await (supabase.from("promotional_offers" as any) as any)
        .update({ status }).eq("id", id).eq("tenant_id", tenantId!);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["promotional-offers", tenantId] }),
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر تحديث حالة العرض"),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("promotional_offers" as any) as any)
        .delete().eq("id", id).eq("tenant_id", tenantId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف العرض");
      void qc.invalidateQueries({ queryKey: ["promotional-offers", tenantId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "لا يمكن حذف عرض مستخدم؛ قم بأرشفته"),
  });

  function resetForm() { setForm({ ...emptyForm, branch_id: membership?.branch_id && !membership?.company_id ? membership.branch_id : "" }); setEditing(null); }
  function editOffer(offer: Offer) {
    const local = (v: string | null) => v ? new Date(new Date(v).getTime() - new Date(v).getTimezoneOffset() * 60000).toISOString().slice(0,16) : "";
    setEditing(offer.id);
    setForm({
      name: offer.name, description: offer.description, offer_type: offer.offer_type,
      discount_value: String(offer.discount_value), minimum_subtotal: String(offer.minimum_subtotal),
      max_discount: offer.max_discount === null ? "" : String(offer.max_discount),
      product_id: offer.product_id ?? "", reward_product_id: offer.reward_product_id ?? "",
      buy_quantity: String(offer.buy_quantity), get_quantity: String(offer.get_quantity),
      branch_id: offer.branch_id ?? "", starts_at: local(offer.starts_at), ends_at: local(offer.ends_at),
      usage_limit: offer.usage_limit === null ? "" : String(offer.usage_limit),
    });
  }

  if (!canManage) return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">لا تملك صلاحية إدارة العروض الترويجية. تتطلب هذه الصفحة صلاحية مستقلة عن الإعلانات والإعدادات.</CardContent></Card>;

  const statusLabel = (status: string) => status === "active" ? "نشط" : status === "paused" ? "متوقف" : status === "archived" ? "مؤرشف" : "مسودة";
  const offerLabel = (offer: Offer) => offer.offer_type === "percentage" ? `خصم ${offer.discount_value}%` : offer.offer_type === "fixed" ? `خصم ثابت ${offer.discount_value}` : `اشترِ ${offer.buy_quantity} واحصل على ${offer.get_quantity}`;

  return <div className="space-y-5">
    <PageHeader title="العروض الترويجية" subtitle="إنشاء الخصومات وعروض اشترِ واحصل، وتحديد المنتجات والفروع والجدولة، ومتابعة الاستخدام من نقطة البيع." />
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Gift className="h-5 w-5 text-primary" />{editing ? "تعديل عرض ترويجي" : "إنشاء عرض ترويجي"}</CardTitle><CardDescription>يحفظ العرض كمسودة أولاً، ولا يُطبق في نقطة البيع إلا بعد تفعيله واستيفاء شروطه.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2"><Label>اسم العرض</Label><Input value={form.name} maxLength={120} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="مثال: خصم نهاية الأسبوع" /></div>
          <div className="space-y-2"><Label>نوع العرض</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.offer_type} onChange={e=>setForm(p=>({...p,offer_type:e.target.value as Offer["offer_type"]}))}><option value="percentage">خصم نسبة مئوية</option><option value="fixed">خصم مبلغ ثابت</option><option value="buy_x_get_y">اشترِ واحصل</option></select></div>
          <div className="space-y-2 md:col-span-2"><Label>الوصف</Label><Input value={form.description} maxLength={500} onChange={e=>setForm(p=>({...p,description:e.target.value}))} /></div>
          {form.offer_type !== "buy_x_get_y" ? <div className="space-y-2"><Label>{form.offer_type === "percentage" ? "نسبة الخصم %" : "قيمة الخصم"}</Label><Input type="number" min="0.01" max={form.offer_type === "percentage" ? 100 : undefined} step="0.01" value={form.discount_value} onChange={e=>setForm(p=>({...p,discount_value:e.target.value}))} /></div> : <><div className="space-y-2"><Label>عدد المنتجات المطلوبة</Label><Input type="number" min="1" step="1" value={form.buy_quantity} onChange={e=>setForm(p=>({...p,buy_quantity:e.target.value}))} /></div><div className="space-y-2"><Label>عدد المنتجات المجانية</Label><Input type="number" min="1" step="1" value={form.get_quantity} onChange={e=>setForm(p=>({...p,get_quantity:e.target.value}))} /></div></>}
          <div className="space-y-2"><Label>الحد الأدنى للفاتورة</Label><Input type="number" min="0" step="0.01" value={form.minimum_subtotal} onChange={e=>setForm(p=>({...p,minimum_subtotal:e.target.value}))} /></div>
          <div className="space-y-2"><Label>الحد الأقصى للخصم (اختياري)</Label><Input type="number" min="0.01" step="0.01" value={form.max_discount} onChange={e=>setForm(p=>({...p,max_discount:e.target.value}))} /></div>
          <div className="space-y-2"><Label>المنتج المؤهل (اختياري للخصم، إلزامي لاشترِ واحصل)</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.product_id} onChange={e=>setForm(p=>({...p,product_id:e.target.value}))}><option value="">كل المنتجات</option>{(products.data??[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          {form.offer_type === "buy_x_get_y" && <div className="space-y-2"><Label>المنتج المجاني (اتركه فارغاً لنفس المنتج)</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.reward_product_id} onChange={e=>setForm(p=>({...p,reward_product_id:e.target.value}))}><option value="">نفس المنتج المؤهل</option>{(products.data??[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>}
          <div className="space-y-2"><Label>الفرع (اختياري: جميع فروع نطاقك)</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.branch_id} onChange={e=>setForm(p=>({...p,branch_id:e.target.value}))} disabled={!!membership?.branch_id && !membership?.company_id && !isTenantOwner && !isSuperOwner}><option value="">كل الفروع المسموح بها</option>{(branches.data??[]).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          <div className="space-y-2"><Label>حد الاستخدام (اختياري)</Label><Input type="number" min="1" step="1" value={form.usage_limit} onChange={e=>setForm(p=>({...p,usage_limit:e.target.value}))} /></div>
          <div className="space-y-2"><Label>بداية العرض</Label><Input type="datetime-local" value={form.starts_at} onChange={e=>setForm(p=>({...p,starts_at:e.target.value}))} /></div>
          <div className="space-y-2"><Label>نهاية العرض</Label><Input type="datetime-local" value={form.ends_at} onChange={e=>setForm(p=>({...p,ends_at:e.target.value}))} /></div>
        </div>
        <div className="flex flex-wrap gap-2"><Button onClick={()=>save.mutate()} disabled={save.isPending || !form.name.trim()}><Plus className="ml-1 h-4 w-4" />{save.isPending ? "جارٍ الحفظ..." : editing ? "حفظ التعديلات" : "حفظ كمسودة"}</Button>{editing && <Button variant="outline" onClick={resetForm}>إلغاء</Button>}</div>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>العروض المحفوظة والأداء</CardTitle><CardDescription>عدد مرات الاستخدام وإجمالي الخصومات المسجلة من عمليات البيع المكتملة.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {offers.isLoading ? <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div> : offers.isError ? <p className="text-sm text-destructive">تعذر تحميل العروض. <Button variant="link" onClick={()=>void offers.refetch()}>إعادة المحاولة</Button></p> : offers.data?.length ? offers.data.map(offer=>{
          const stat=stats.get(offer.id)??{count:0,discount:0};
          const canDelete=stat.count===0;
          return <div key={offer.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 font-semibold">{offer.name}<Badge variant={offer.status==="active"?"default":"secondary"}>{statusLabel(offer.status)}</Badge></div><div className="text-xs text-muted-foreground">{offerLabel(offer)} · استخدم {stat.count} مرة · إجمالي الخصم {stat.discount.toFixed(2)}{offer.usage_limit? ` · الحد ${offer.usage_limit}`:""}</div></div>
            <Button size="sm" variant="ghost" onClick={()=>editOffer(offer)}>تعديل</Button>
            <Button size="sm" variant="outline" disabled={updateStatus.isPending} onClick={()=>updateStatus.mutate({id:offer.id,status:offer.status==="active"?"paused":offer.status==="archived"?"draft":"active"})}>{offer.status==="active"?"إيقاف":offer.status==="archived"?"استعادة كمسودة":"تفعيل"}</Button>
            {offer.status!=="archived" && <Button size="sm" variant="ghost" onClick={()=>{if(confirm("أرشفة هذا العرض؟")) updateStatus.mutate({id:offer.id,status:"archived"});}}><Archive className="ml-1 h-4 w-4" />أرشفة</Button>}
            <Button size="icon" variant="ghost" aria-label={"حذف "+offer.name} disabled={!canDelete || remove.isPending} onClick={()=>{if(canDelete && confirm("حذف هذا العرض نهائياً؟")) remove.mutate(offer.id);}}>{canDelete?<Trash2 className="h-4 w-4 text-destructive" />:<RotateCcw className="h-4 w-4 text-muted-foreground" />}</Button>
          </div>;
        }) : <p className="text-sm text-muted-foreground">لا توجد عروض ترويجية بعد.</p>}
      </CardContent>
    </Card>
  </div>;
}
