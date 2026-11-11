import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Upload, ImagePlus } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { useTheme, DEFAULT_DESIGN, type DesignSettings } from "@/lib/theme";
import { useSuperOwner } from "@/hooks/use-super-owner";
import { Palette, RotateCcw, Plus, Trash2, MonitorCog, Megaphone, Image } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

type MarketingCampaign = { id: string; title: string; description: string; image_url: string | null; target_url: string | null; placement: string; status: string; starts_at: string | null; ends_at: string | null; sort_order: number };

const schema = z.object({
  name: z.string().trim().min(2, "الاسم قصير").max(100),
  currency: z.string().trim().min(1).max(5),
  tax_rate: z.coerce.number().min(0).max(100),
  logo_url: z.string().url().nullable().optional(),
});

function SettingsPage() {
  const { tenant, tenantId, isAdmin, role } = useActiveTenant();
  const { isSuperOwner } = useSuperOwner();
  const { design, saveDesign, resetDesign } = useTheme();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("SAR");
  const [tax, setTax] = useState("15");
  const [logoUrl, setLogoUrl] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [designDraft, setDesignDraft] = useState<DesignSettings>(design);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const [customTabs, setCustomTabs] = useState<Array<{ title: string; url: string }>>([]);
  const [newTabTitle, setNewTabTitle] = useState("");
  const [newTabUrl, setNewTabUrl] = useState("/dashboard");
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [campaignImage, setCampaignImage] = useState("");
  const [campaignTarget, setCampaignTarget] = useState("");
  const [campaignPlacement, setCampaignPlacement] = useState("dashboard_banner");
  const [campaignStart, setCampaignStart] = useState("");
  const [campaignEnd, setCampaignEnd] = useState("");
  const [uploadingCampaignImage, setUploadingCampaignImage] = useState(false);

  useEffect(() => {
    if (tenant) {
      setName(tenant.name);
      setCurrency(tenant.currency);
      setTax(String(tenant.tax_rate));
      setLogoUrl(tenant.logo_url ?? "");
    }
  }, [tenant]);

  const canManageMarketing = role === "owner" || role === "manager" || isSuperOwner;
  const campaignsQuery = useQuery({
    queryKey: ["marketing-campaigns", tenantId],
    queryFn: async (): Promise<MarketingCampaign[]> => {
      const { data, error } = await supabase.from("marketing_campaigns").select("id,title,description,image_url,target_url,placement,status,starts_at,ends_at,sort_order").eq("tenant_id", tenantId!).order("sort_order").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MarketingCampaign[];
    },
    enabled: !!tenantId && canManageMarketing,
  });

  const campaignCreate = useMutation({
    mutationFn: async () => {
      const title = campaignTitle.trim();
      if (title.length < 2 || title.length > 120) throw new Error("اسم العرض يجب أن يكون بين حرفين و120 حرفاً");
      if (campaignDescription.length > 500) throw new Error("الوصف أطول من الحد المسموح");
      if (campaignTarget && !/^https?:\/\//i.test(campaignTarget)) throw new Error("رابط الوجهة يجب أن يبدأ بـ https:// أو http://");
      if (campaignStart && campaignEnd && new Date(campaignEnd) <= new Date(campaignStart)) throw new Error("تاريخ النهاية يجب أن يكون بعد البداية");
      const payload = {
        title,
        description: campaignDescription.trim(),
        image_url: campaignImage || null,
        target_url: campaignTarget.trim() || null,
        placement: campaignPlacement,
        starts_at: campaignStart ? new Date(campaignStart).toISOString() : null,
        ends_at: campaignEnd ? new Date(campaignEnd).toISOString() : null,
      };
      const result = editingCampaignId
        ? await supabase.from("marketing_campaigns").update(payload).eq("id", editingCampaignId).eq("tenant_id", tenantId!)
        : await supabase.from("marketing_campaigns").insert({ ...payload, tenant_id: tenantId!, status: "draft" });
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-campaigns", tenantId] });
      setEditingCampaignId(null);
      setCampaignTitle(""); setCampaignDescription(""); setCampaignImage(""); setCampaignTarget(""); setCampaignStart(""); setCampaignEnd("");
      toast.success("تم حفظ بيانات العرض.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر حفظ العرض"),
  });

  const campaignUpdate = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("marketing_campaigns").update({ status }).eq("id", id).eq("tenant_id", tenantId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketing-campaigns", tenantId] }),
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر تحديث العرض"),
  });

  const campaignDelete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketing_campaigns").delete().eq("id", id).eq("tenant_id", tenantId!);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["marketing-campaigns", tenantId] }); toast.success("تم حذف العرض"); },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر حذف العرض"),
  });

  async function uploadCampaignImage(file?: File) {
    if (!file || !tenantId || !canManageMarketing) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (!allowed.includes(file.type)) { toast.error("صيغة الصورة غير مدعومة"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("الحجم الأقصى للصورة 5MB"); return; }
    setUploadingCampaignImage(true);
    try {
      const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" } as Record<string, string>)[file.type];
      const path = `${tenantId}/marketing/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("restaurant-assets").upload(path, file, { upsert: false, contentType: file.type, cacheControl: "31536000" });
      if (error) throw error;
      const { data } = supabase.storage.from("restaurant-assets").getPublicUrl(path);
      setCampaignImage(data.publicUrl);
      toast.success("تم رفع صورة العرض");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر رفع الصورة"); }
    finally { setUploadingCampaignImage(false); }
  }

  const save = useMutation({
    mutationFn: async () => {
      const v = schema.parse({ name, currency, tax_rate: tax, logo_url: logoUrl.trim() || null });
      const { error } = await supabase.from("tenants").update(v).eq("id", tenantId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant", tenantId] });
      toast.success("تم حفظ الإعدادات");
    },
    onError: (e) => {
      const msg = e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : "فشل الحفظ";
      toast.error(msg);
    },
  });

  const canEdit = role === "owner";

  async function uploadBackground(file?: File) {
    if (!file || !tenantId || !isSuperOwner) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (!allowed.includes(file.type)) { toast.error("صيغة الصورة غير مدعومة"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("الحجم الأقصى للخلفية 5MB"); return; }
    setUploadingBackground(true);
    try {
      const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" } as Record<string, string>)[file.type];
      const path = `${tenantId}/branding/background-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("restaurant-assets").upload(path, file, { upsert: false, contentType: file.type, cacheControl: "31536000" });
      if (error) throw error;
      const { data } = supabase.storage.from("restaurant-assets").getPublicUrl(path);
      setDesignDraft((current) => ({ ...current, backgroundImage: data.publicUrl }));
      toast.success("تم رفع الخلفية. اضغط تطبيق التصميم لمعاينتها.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر رفع الخلفية");
    } finally { setUploadingBackground(false); }
  }

  function applyDesign() {
    saveDesign(designDraft);
    toast.success("تم تطبيق التصميم على هذا الجهاز");
  }

  function resetWorkspaceDesign() {
    resetDesign();
    setDesignDraft(DEFAULT_DESIGN);
    toast.success("تمت استعادة التصميم الافتراضي");
  }

  function persistCustomTabs(next: Array<{ title: string; url: string }>) {
    setCustomTabs(next);
    try {
      window.localStorage.setItem("ras-custom-sidebar-items-v1", JSON.stringify(next));
      window.dispatchEvent(new Event("ras-custom-tabs-updated"));
      toast.success("تم تحديث الاختصارات");
    } catch { toast.error("تعذر حفظ الاختصارات على هذا الجهاز"); }
  }

  function addCustomTab() {
    const title = newTabTitle.trim();
    const allowedRoutes = ["/dashboard", "/pos", "/sales", "/products", "/inventory", "/purchases", "/reports", "/customers", "/branches", "/users", "/settings"];
    if (!title || title.length > 28 || !allowedRoutes.includes(newTabUrl)) { toast.error("أدخل اسماً صالحاً واختر صفحة موجودة"); return; }
    if (customTabs.some((item) => item.url === newTabUrl)) { toast.error("هذا الاختصار مضاف بالفعل"); return; }
    if (customTabs.length >= 12) { toast.error("الحد الأقصى 12 اختصاراً"); return; }
    persistCustomTabs([...customTabs, { title, url: newTabUrl }]);
    setNewTabTitle("");
  }

  async function uploadRestaurantLogo(file?: File) {
    if (!file || !tenantId || !canEdit) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (!allowed.includes(file.type)) { toast.error("صيغة الصورة غير مدعومة"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("الحجم الأقصى للشعار 5MB"); return; }
    setUploadingLogo(true);
    try {
      const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" } as Record<string, string>)[file.type];
      const path = `${tenantId}/branding/logo-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("restaurant-assets").upload(path, file, { upsert: false, contentType: file.type, cacheControl: "31536000" });
      if (error) throw error;
      const { data } = supabase.storage.from("restaurant-assets").getPublicUrl(path);
      setLogoUrl(data.publicUrl);
      toast.success("تم رفع الشعار. احفظ التغييرات لتثبيته.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر رفع الشعار");
    } finally { setUploadingLogo(false); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="إعدادات المطعم" subtitle="الاسم والعملة ونسبة الضريبة العامة." />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>البيانات الأساسية</CardTitle>
          <CardDescription>
            {canEdit ? "يمكنك تعديل هذه الإعدادات." : "المالك فقط يستطيع التعديل."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <div className="space-y-2">
              <Label>شعار المطعم</Label>
              <div className="flex flex-wrap items-center gap-3">
                <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border bg-muted">
                  {logoUrl ? <img src={logoUrl} alt="شعار المطعم" className="h-full w-full object-contain" /> : <ImagePlus className="h-8 w-8 text-muted-foreground" />}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
                    {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploadingLogo ? "جارٍ رفع الشعار..." : "رفع شعار من الجهاز"}
                    <input className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={!canEdit || uploadingLogo} onChange={(e) => { void uploadRestaurantLogo(e.target.files?.[0]); e.currentTarget.value = ""; }} />
                  </label>
                  <Input dir="ltr" placeholder="أو رابط الشعار https://..." value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} disabled={!canEdit} />
                  <p className="text-xs text-muted-foreground">JPG أو PNG أو WEBP أو AVIF — بحد أقصى 5MB.</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>اسم المطعم</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required disabled={!canEdit} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>العملة</Label>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={5} dir="ltr" required disabled={!canEdit} />
              </div>
              <div className="space-y-2">
                <Label>نسبة الضريبة (%)</Label>
                <Input type="number" min="0" max="100" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} required disabled={!canEdit} />
              </div>
            </div>
            <Button type="submit" disabled={!canEdit || save.isPending}>
              {save.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              حفظ التغييرات
            </Button>
            {!isAdmin && (
              <p className="text-xs text-muted-foreground">
                * هذه الصفحة للعرض فقط بدورك الحالي.
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      {canManageMarketing && (
        <Card id="marketing-campaigns"><CardHeader><CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" /> إدارة العروض والإعلانات</CardTitle>
            <CardDescription>أنشئ حملات ترويجية بصور وروابط، وحدد مكان ظهورها وفترة تشغيلها. تحفظ الحملات كمسودات حتى تقوم بتفعيلها.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2"><Label>عنوان العرض</Label><Input value={campaignTitle} onChange={(e) => setCampaignTitle(e.target.value)} maxLength={120} placeholder="مثال: عرض نهاية الأسبوع" /></div>
              <div className="space-y-2"><Label>مكان العرض</Label>
                <select value={campaignPlacement} onChange={(e) => setCampaignPlacement(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                  <option value="dashboard_banner">شريط أعلى لوحة التحكم</option><option value="dashboard_card">بطاقة داخل لوحة التحكم</option><option value="pos_promo">منطقة ترويج نقطة البيع</option>
                </select>
              </div>
              <div className="space-y-2 md:col-span-2"><Label>الوصف</Label><Input value={campaignDescription} onChange={(e) => setCampaignDescription(e.target.value)} maxLength={500} placeholder="تفاصيل العرض أو الإعلان" /></div>
              <div className="space-y-2"><Label>رابط الوجهة (اختياري)</Label><Input dir="ltr" value={campaignTarget} onChange={(e) => setCampaignTarget(e.target.value)} placeholder="https://example.com/offer" /></div>
              <div className="space-y-2"><Label>صورة الإعلان</Label>
                <div className="flex items-center gap-3">
                  <div className="grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">{campaignImage ? <img src={campaignImage} alt="صورة العرض" className="h-full w-full object-cover" /> : <Image className="h-5 w-5 text-muted-foreground" />}</div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">{uploadingCampaignImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{uploadingCampaignImage ? "جارٍ الرفع..." : "اختيار صورة"}<input className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={uploadingCampaignImage} onChange={(e) => { void uploadCampaignImage(e.target.files?.[0]); e.currentTarget.value = ""; }} /></label>
                </div>
              </div>
              <div className="space-y-2"><Label>بداية العرض (اختياري)</Label><Input type="datetime-local" value={campaignStart} onChange={(e) => setCampaignStart(e.target.value)} /></div>
              <div className="space-y-2"><Label>نهاية العرض (اختياري)</Label><Input type="datetime-local" value={campaignEnd} onChange={(e) => setCampaignEnd(e.target.value)} /></div>
            </div>
            <Button type="button" onClick={() => campaignCreate.mutate()} disabled={campaignCreate.isPending || !campaignTitle.trim()}>{campaignCreate.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}{editingCampaignId ? "حفظ التعديلات" : "حفظ كمسودة"}</Button>
            <div className="space-y-2 border-t pt-4">
              <h3 className="font-semibold">الحملات المحفوظة</h3>
              {campaignsQuery.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : campaignsQuery.isError ? <div className="text-sm text-destructive">تعذر تحميل الحملات. <Button type="button" variant="link" onClick={() => campaignsQuery.refetch()}>إعادة المحاولة</Button></div> : campaignsQuery.data?.length ? campaignsQuery.data.map((campaign) => (
                <div key={campaign.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                  {campaign.image_url && <img src={campaign.image_url} alt="" className="h-14 w-20 rounded object-cover" />}
                  <div className="min-w-0 flex-1"><div className="font-medium">{campaign.title}</div><div className="text-xs text-muted-foreground">{campaign.placement === "dashboard_banner" ? "شريط لوحة التحكم" : campaign.placement === "dashboard_card" ? "بطاقة لوحة التحكم" : "نقطة البيع"} · {campaign.status === "active" ? "نشط" : campaign.status === "paused" ? "متوقف" : campaign.status === "archived" ? "مؤرشف" : "مسودة"}</div></div>
                  <Button type="button" size="sm" variant="ghost" onClick={() => {
                    setEditingCampaignId(campaign.id);
                    setCampaignTitle(campaign.title);
                    setCampaignDescription(campaign.description);
                    setCampaignImage(campaign.image_url ?? "");
                    setCampaignTarget(campaign.target_url ?? "");
                    setCampaignPlacement(campaign.placement);
                    const toLocalInput = (value: string | null) => {
                      if (!value) return "";
                      const date = new Date(value);
                      return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
                    };
                    setCampaignStart(toLocalInput(campaign.starts_at));
                    setCampaignEnd(toLocalInput(campaign.ends_at));
                  }}>تعديل</Button>
                  <Button type="button" size="sm" variant="outline" disabled={campaignUpdate.isPending} onClick={() => campaignUpdate.mutate({ id: campaign.id, status: campaign.status === "active" ? "paused" : "active" })}>{campaign.status === "active" ? "إيقاف" : "تفعيل"}</Button>
                  <Button type="button" size="icon" variant="ghost" aria-label={`حذف ${campaign.title}`} disabled={campaignDelete.isPending} onClick={() => { if (window.confirm("هل تريد حذف هذا العرض؟")) campaignDelete.mutate(campaign.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              )) : <p className="text-sm text-muted-foreground">لا توجد حملات بعد.</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {isSuperOwner && (
        <Card id="developer-studio" className="border-primary/30"><CardHeader><CardTitle className="flex items-center gap-2"><MonitorCog className="h-5 w-5 text-primary" /> استوديو تطوير وتخصيص النظام</CardTitle>
            <CardDescription>تحكم آمن في ألوان الواجهة والخلفية والاختصارات. التغييرات المرئية تحفظ محلياً على هذا الجهاز ولا تغير منطق المبيعات أو المحاسبة أو الصلاحيات.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <section className="space-y-3">
              <h3 className="flex items-center gap-2 font-semibold"><Palette className="h-4 w-4" /> ألوان النظام</h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {([
                  ["background", "خلفية مساحة العمل"],
                  ["primary", "اللون الرئيسي والأزرار"],
                  ["accent", "لون التمييز"],
                  ["sidebar", "خلفية القائمة الجانبية"],
                  ["card", "خلفية البطاقات"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                    <span>{label}</span>
                    <input type="color" value={designDraft[key]} onChange={(e) => setDesignDraft((current) => ({ ...current, [key]: e.target.value }))} className="h-9 w-12 cursor-pointer rounded border bg-transparent p-1" />
                  </label>
                ))}
              </div>
            </section>
            <section className="space-y-3">
              <h3 className="font-semibold">خلفية مخصصة</h3>
              <div className="flex flex-wrap items-center gap-3">
                <div className="h-24 w-36 overflow-hidden rounded-lg border bg-muted">
                  {designDraft.backgroundImage ? <img src={designDraft.backgroundImage} alt="معاينة خلفية النظام" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs text-muted-foreground">بدون صورة</div>}
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
                  {uploadingBackground ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploadingBackground ? "جارٍ رفع الخلفية..." : "رفع صورة خلفية"}
                  <input className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={uploadingBackground} onChange={(e) => { void uploadBackground(e.target.files?.[0]); e.currentTarget.value = ""; }} />
                </label>
                <Button type="button" variant="outline" onClick={() => setDesignDraft((current) => ({ ...current, backgroundImage: "" }))}>إزالة الصورة</Button>
              </div>
              <p className="text-xs text-muted-foreground">تظهر الخلفية خلف مساحة العمل مع طبقة شفافة لسهولة قراءة المحتوى.</p>
            </section>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={applyDesign}>تطبيق التصميم</Button>
              <Button type="button" variant="outline" onClick={resetWorkspaceDesign}><RotateCcw className="ml-2 h-4 w-4" /> استعادة الافتراضي</Button>
            </div>
            <section className="space-y-3 border-t pt-5">
              <h3 className="font-semibold">إدارة الاختصارات والتبويبات الجانبية</h3>
              <p className="text-xs text-muted-foreground">أضف تبويباً باسم تختاره يفتح صفحة موجودة. لا ينشئ هذا محرراً لصفحات أو وظائف جديدة؛ إضافة وحدات تشغيلية جديدة تحتاج تطويراً وبرمجة وصلاحيات مستقلة.</p>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input value={newTabTitle} onChange={(e) => setNewTabTitle(e.target.value)} placeholder="اسم التبويب" maxLength={28} />
                <select value={newTabUrl} onChange={(e) => setNewTabUrl(e.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm">
                  <option value="/dashboard">لوحة التحكم</option>
                  <option value="/pos">نقطة البيع</option>
                  <option value="/sales">الفواتير</option>
                  <option value="/products">المنتجات</option>
                  <option value="/inventory">المخزون</option>
                  <option value="/purchases">المشتريات</option>
                  <option value="/reports">التقارير</option>
                  <option value="/customers">العملاء</option>
                  <option value="/branches">الفروع</option>
                  <option value="/users">الموظفون</option>
                  <option value="/settings">الإعدادات</option>
                </select>
                <Button type="button" onClick={addCustomTab} disabled={!newTabTitle.trim() || customTabs.length >= 12}><Plus className="ml-1 h-4 w-4" /> إضافة</Button>
              </div>
              <div className="space-y-2">
                {customTabs.map((item) => (
                  <div key={item.url} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                    <div className="min-w-0"><div className="font-medium">{item.title}</div><div className="text-xs text-muted-foreground" dir="ltr">{item.url}</div></div>
                    <Button type="button" size="icon" variant="ghost" aria-label={`حذف اختصار ${item.title}`} onClick={() => persistCustomTabs(customTabs.filter((entry) => entry.url !== item.url))}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                ))}
                {customTabs.length === 0 && <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">لم تضف اختصارات مخصصة بعد.</p>}
              </div>
            </section>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
