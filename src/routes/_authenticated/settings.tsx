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
import { isAllowedCustomShortcutRoute, normalizeCustomShortcuts } from "@/lib/navigation-shortcuts";
import { Palette, RotateCcw, Plus, Trash2, MonitorCog, Image, Building2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

type NavOverride = { title?: string; hidden?: boolean };



const MANAGEABLE_NAV_ITEMS = [
  { title: "لوحة التحكم", url: "/dashboard", protected: true },
  { title: "التقارير", url: "/reports" },
  { title: "نقطة البيع", url: "/pos", protected: true },
  { title: "الطاولات", url: "/tables" },
  { title: "شاشة المطبخ", url: "/kitchen" },
  { title: "الفواتير", url: "/sales" },
  { title: "الورديات", url: "/cash-sessions" },
  { title: "العملاء", url: "/customers" },
  { title: "المخزون", url: "/inventory" },
  { title: "حركات المخزون", url: "/inventory/movements" },
  { title: "الموردون", url: "/suppliers" },
  { title: "المشتريات", url: "/purchases" },
  { title: "المصروفات", url: "/expenses" },
  { title: "الفروع", url: "/branches" },
  { title: "المنتجات", url: "/products" },
  { title: "الأقسام", url: "/categories" },
  { title: "تصنيفات المصروفات", url: "/expense-categories" },
  { title: "الموظفون", url: "/users" },
  { title: "ملفات الموظفين", url: "/hr/employees" },
  { title: "إدارة المستخدمين", url: "/users-admin" },
  { title: "الشركات", url: "/companies" },
  { title: "الأقسام الإدارية", url: "/departments" },
  { title: "المسميات الوظيفية", url: "/job-titles" },
  { title: "أنواع التوظيف", url: "/employment-types" },
  { title: "إدارة الأدوار", url: "/roles" },
  { title: "صلاحيات الفريق", url: "/team-permissions" },
  { title: "الإشعارات", url: "/notifications" },
  { title: "مركز المساعدة والدعم", url: "/support" },
  { title: "الإعلانات", url: "/ads" },
  { title: "العروض الترويجية", url: "/promotions" },
  { title: "الإعدادات", url: "/settings", protected: true },
  { title: "مركز تحكم المالك", url: "/owner-center", protected: true },
  { title: "إدارة النظام", url: "/admin", protected: true },
  { title: "سجل التدقيق", url: "/audit-logs", protected: true },
  { title: "سجل الدخول", url: "/login-history" },
  { title: "الحضور", url: "/hr/attendance" },
  { title: "الإجازات", url: "/hr/leaves" },
  { title: "المكافآت والحسميات", url: "/hr/compensation" },
  { title: "الرواتب", url: "/hr/payroll" },
  { title: "الملف الشخصي", url: "/profile" },
] as const;

const schema = z.object({
  name: z.string().trim().min(2, "الاسم قصير").max(100),
  currency: z.string().trim().min(1).max(5),
  tax_rate: z.coerce.number().min(0).max(100),
  logo_url: z.string().url().nullable().optional(),
});

function SettingsPage() {
  const { tenant, tenantId, role, membership } = useActiveTenant();
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
  const [navOverrides, setNavOverrides] = useState<Record<string, NavOverride>>({});
  const [newTabTitle, setNewTabTitle] = useState("");
  const [newTabUrl, setNewTabUrl] = useState("/dashboard");
  const [platformBrand, setPlatformBrand] = useState({ brand_name: "إدارة الوتيري بلس", phone: "", promotional_text: "", website_url: "", logo_url: "", enabled: true, placement: "footer" });
  const platformBrandQuery = useQuery({
    queryKey: ["platform-branding"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("platform_branding" as any) as any).select("*").eq("id", true).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: isSuperOwner,
  });
  useEffect(() => {
    if (platformBrandQuery.data) setPlatformBrand({
      brand_name: platformBrandQuery.data.brand_name ?? "إدارة الوتيري بلس",
      phone: platformBrandQuery.data.phone ?? "",
      promotional_text: platformBrandQuery.data.promotional_text ?? "",
      website_url: platformBrandQuery.data.website_url ?? "",
      logo_url: platformBrandQuery.data.logo_url ?? "",
      enabled: platformBrandQuery.data.enabled ?? true,
      placement: platformBrandQuery.data.placement ?? "footer",
    });
  }, [platformBrandQuery.data]);
  const savePlatformBrand = useMutation({
    mutationFn: async () => {
      const brandName = platformBrand.brand_name.trim();
      if (brandName.length < 2 || brandName.length > 100) {
        throw new Error("اسم العلامة التجارية يجب أن يكون بين حرفين و100 حرف.");
      }
      if (platformBrand.phone.trim().length > 30) throw new Error("رقم التواصل أطول من المسموح.");
      if (platformBrand.promotional_text.length > 240) throw new Error("العبارة التعريفية يجب ألا تتجاوز 240 حرفاً.");
      if (!["footer", "header", "both"].includes(platformBrand.placement)) throw new Error("موضع الظهور غير صالح.");

      for (const [field, value] of [["الموقع", platformBrand.website_url], ["الشعار", platformBrand.logo_url]] as const) {
        if (!value.trim()) continue;
        try {
          const parsed = new URL(value.trim());
          if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
        } catch {
          throw new Error(`رابط ${field} غير صالح؛ استخدم http أو https.`);
        }
      }

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error("انتهت جلسة الدخول؛ أعد تسجيل الدخول.");

      const { error } = await (supabase.from("platform_branding" as any) as any).upsert({
        id: true,
        brand_name: brandName,
        phone: platformBrand.phone.trim() || null,
        promotional_text: platformBrand.promotional_text.trim() || null,
        website_url: platformBrand.website_url.trim() || null,
        logo_url: platformBrand.logo_url.trim() || null,
        enabled: platformBrand.enabled,
        placement: platformBrand.placement,
        updated_by: authData.user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-branding"] });
      toast.success("تم حفظ هوية المنصة");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر حفظ الهوية"),
  });

  useEffect(() => {
    if (tenant) {
      setName(tenant.name);
      setCurrency(tenant.currency);
      setTax(String(tenant.tax_rate));
      setLogoUrl(tenant.logo_url ?? "");
    }
  }, [tenant]);

  useEffect(() => {
    setDesignDraft(design);
  }, [design]);

  useEffect(() => {
    try {
      const rawTabs = window.localStorage.getItem("ras-custom-sidebar-items-v1");
      const parsedTabs = rawTabs ? JSON.parse(rawTabs) : [];
      setCustomTabs(normalizeCustomShortcuts(parsedTabs));
      const rawOverrides = window.localStorage.getItem("ras-sidebar-overrides-v1");
      const parsedOverrides = rawOverrides ? JSON.parse(rawOverrides) : {};
      setNavOverrides(parsedOverrides && typeof parsedOverrides === "object" && !Array.isArray(parsedOverrides) ? parsedOverrides : {});
    } catch {
      setCustomTabs([]);
      setNavOverrides({});
    }
  }, []);

  const save = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("لا توجد شركة نشطة لحفظ الإعدادات.");
      const v = schema.parse({ name, currency, tax_rate: tax, logo_url: logoUrl.trim() || null });
      const { data, error } = await supabase.from("tenants")
        .update(v).eq("id", tenantId).select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("لم يتم حفظ الإعدادات؛ تحقق من صلاحية إدارة الشركة.");
    },
    onSuccess: () => {
      window.dispatchEvent(new CustomEvent("ras-workspace-form-saved", { detail: { path: window.location.pathname, formKey: "tenant-settings" } }));
      qc.invalidateQueries({ queryKey: ["tenant", tenantId] });
      toast.success("تم حفظ الإعدادات");
    },
    onError: (error) => {
      const msg = error instanceof z.ZodError ? error.issues[0].message : error instanceof Error ? error.message : "فشل الحفظ";
      toast.error(msg);
    },
  });

  const canEdit = isSuperOwner || (role === "owner" && !membership?.company_id);

  useEffect(() => {
    if (!tenant) return;
    const savedPlatformBrand = platformBrandQuery.data ? {
      brand_name: platformBrandQuery.data.brand_name ?? "إدارة الوتيري بلس",
      phone: platformBrandQuery.data.phone ?? "",
      promotional_text: platformBrandQuery.data.promotional_text ?? "",
      website_url: platformBrandQuery.data.website_url ?? "",
      logo_url: platformBrandQuery.data.logo_url ?? "",
      enabled: platformBrandQuery.data.enabled ?? true,
      placement: platformBrandQuery.data.placement ?? "footer",
    } : { brand_name: "إدارة الوتيري بلس", phone: "", promotional_text: "", website_url: "", logo_url: "", enabled: true, placement: "footer" };
    const platformBrandDirty = isSuperOwner && !platformBrandQuery.isLoading && !platformBrandQuery.isError &&
      JSON.stringify(platformBrand) !== JSON.stringify(savedPlatformBrand);
    const dirty = name !== tenant.name ||
      currency !== tenant.currency ||
      tax !== String(tenant.tax_rate) ||
      logoUrl !== (tenant.logo_url ?? "") ||
      JSON.stringify(designDraft) !== JSON.stringify(design) ||
      platformBrandDirty ||
      !!newTabTitle.trim() || newTabUrl !== "/dashboard" ||
      uploadingLogo || uploadingBackground;
    window.dispatchEvent(new CustomEvent("ras-workspace-dirty-change", {
      detail: { path: "/settings", dirty },
    }));
    return () => {
      window.dispatchEvent(new CustomEvent("ras-workspace-dirty-change", {
        detail: { path: "/settings", dirty: false },
      }));
    };
  }, [tenant, name, currency, tax, logoUrl, designDraft, design, platformBrand, platformBrandQuery.data, platformBrandQuery.isLoading, platformBrandQuery.isError, isSuperOwner, newTabTitle, newTabUrl, uploadingLogo, uploadingBackground]);

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
    const safeNext = normalizeCustomShortcuts(next);
    setCustomTabs(safeNext);
    try {
      window.localStorage.setItem("ras-custom-sidebar-items-v1", JSON.stringify(safeNext));
      window.dispatchEvent(new Event("ras-custom-tabs-updated"));
      toast.success("تم تحديث الاختصارات");
    } catch { toast.error("تعذر حفظ الاختصارات على هذا الجهاز"); }
  }

  function updateNavOverride(url: string, patch: Partial<NavOverride>) {
    const next = { ...navOverrides, [url]: { ...navOverrides[url], ...patch } };
    setNavOverrides(next);
    try {
      window.localStorage.setItem("ras-sidebar-overrides-v1", JSON.stringify(next));
      window.dispatchEvent(new Event("ras-sidebar-overrides-updated"));
    } catch {
      toast.error("تعذر حفظ إعدادات القائمة");
    }
  }

  function resetNavOverrides() {
    setNavOverrides({});
    try {
      window.localStorage.removeItem("ras-sidebar-overrides-v1");
      window.dispatchEvent(new Event("ras-sidebar-overrides-updated"));
      toast.success("تمت استعادة أسماء وظهور التبويبات الافتراضية");
    } catch {
      toast.error("تعذر استعادة القائمة");
    }
  }

  function addCustomTab() {
    const title = newTabTitle.trim();
    if (!title || title.length > 28 || !isAllowedCustomShortcutRoute(newTabUrl)) { toast.error("أدخل اسماً صالحاً واختر صفحة موجودة"); return; }
    if (customTabs.some((item) => item.url === newTabUrl)) { toast.error("هذا الاختصار مضاف بالفعل"); return; }
    if (customTabs.length >= 12) { toast.error("الحد الأقصى 12 اختصاراً"); return; }
    persistCustomTabs([...customTabs, { title, url: newTabUrl }]);
    setNewTabTitle("");
    setNewTabUrl("/dashboard");
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
      <PageHeader title="إعدادات النشاط التجاري" subtitle="بيانات النشاط والعملة والضريبة، مع إعدادات مستقلة لهوية المنصة." />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>البيانات الأساسية</CardTitle>
          <CardDescription>
            {canEdit ? "يمكنك تعديل هذه الإعدادات." : "المالك فقط يستطيع التعديل."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form id="workspace-tenant-settings" data-workspace-form-key="tenant-settings" className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <div className="space-y-2">
              <Label>شعار النشاط التجاري</Label>
              <div className="flex flex-wrap items-center gap-3">
                <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border bg-muted">
                  {logoUrl ? <img src={logoUrl} alt="شعار النشاط التجاري" className="h-full w-full object-contain" /> : <ImagePlus className="h-8 w-8 text-muted-foreground" />}
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
              <Label>اسم النشاط التجاري</Label>
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
            {!canEdit && (
              <p className="text-xs text-muted-foreground">
                * هذه الصفحة للعرض فقط بدورك الحالي.
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      {isSuperOwner && (
        <Card id="platform-branding">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" /> هوية المنصة</CardTitle>
            <CardDescription>بيانات العلامة التجارية التي تظهر في المطبوعات مستقلة عن هوية النشاط. إدارة الحملات الإعلانية والعروض الترويجية تتم في أقسامها المنفصلة.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {platformBrandQuery.isLoading && <p className="text-sm text-muted-foreground">جارٍ تحميل هوية المنصة...</p>}
            {platformBrandQuery.isError && (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <span className="text-destructive">تعذر تحميل بيانات الهوية؛ لم يتم تمكين الحفظ حتى لا تُستبدل بيانات غير محملة.</span>
                <Button type="button" size="sm" variant="outline" onClick={() => void platformBrandQuery.refetch()}>إعادة المحاولة</Button>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label>اسم العلامة التجارية</Label><Input value={platformBrand.brand_name} onChange={(e) => setPlatformBrand({ ...platformBrand, brand_name: e.target.value })} /></div>
              <div className="space-y-2"><Label>رقم التواصل</Label><Input dir="ltr" value={platformBrand.phone} onChange={(e) => setPlatformBrand({ ...platformBrand, phone: e.target.value })} /></div>
              <div className="space-y-2"><Label>رابط الموقع</Label><Input dir="ltr" value={platformBrand.website_url} onChange={(e) => setPlatformBrand({ ...platformBrand, website_url: e.target.value })} placeholder="https://" /></div>
              <div className="space-y-2"><Label>رابط شعار المنصة</Label><Input dir="ltr" value={platformBrand.logo_url} onChange={(e) => setPlatformBrand({ ...platformBrand, logo_url: e.target.value })} placeholder="https://" /></div>
            </div>
            <div className="space-y-2"><Label>عبارة تعريفية للمطبوعات</Label><Input value={platformBrand.promotional_text} onChange={(e) => setPlatformBrand({ ...platformBrand, promotional_text: e.target.value })} maxLength={240} /></div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={platformBrand.enabled} onChange={(e) => setPlatformBrand({ ...platformBrand, enabled: e.target.checked })} /> تفعيل هوية المنصة في المطبوعات</label>
              <div className="flex items-center gap-2 text-sm"><Label>موضع الظهور</Label><select className="h-9 rounded-md border bg-background px-2" value={platformBrand.placement} onChange={(e) => setPlatformBrand({ ...platformBrand, placement: e.target.value })}><option value="footer">أسفل الصفحة</option><option value="header">أعلى الصفحة</option><option value="both">أعلى وأسفل الصفحة</option></select></div>
            </div>
            <Button type="button" onClick={() => savePlatformBrand.mutate()} disabled={savePlatformBrand.isPending || platformBrandQuery.isLoading || platformBrandQuery.isError}>{savePlatformBrand.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ هوية النظام</Button>
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">تعديل أسماء التطبيقات وإظهارها</h3>
                <Button type="button" size="sm" variant="outline" onClick={resetNavOverrides}><RotateCcw className="ml-1 h-3 w-3" />إعادة ضبط لوحة التطبيقات</Button>
              </div>
              <p className="text-xs text-muted-foreground">يمكنك إعادة تسمية صفحات القائمة أو إخفاء الصفحات غير الأساسية. الإخفاء يزيل الاختصار من لوحة التطبيقات فقط؛ لا يحذف الصفحة أو بياناتها ولا يغير صلاحيات الوصول إليها. الصفحات الأساسية محمية.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {MANAGEABLE_NAV_ITEMS.map((item) => (
                  <div key={item.url} className="flex items-center gap-2 rounded-md border p-2">
                    <Input aria-label={`اسم تبويب ${item.title}`} value={navOverrides[item.url]?.title ?? item.title} onChange={(e) => updateNavOverride(item.url, { title: e.target.value.slice(0, 32) })} maxLength={32} className="h-9 min-w-0" />
                    <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <input type="checkbox" checked={navOverrides[item.url]?.hidden === true} disabled={"protected" in item && item.protected} onChange={(e) => updateNavOverride(item.url, { hidden: e.target.checked })} />
                      إخفاء
                    </label>
                  </div>
                ))}
              </div>
            </section>
            <section className="space-y-3 border-t pt-5">
              <h3 className="font-semibold">إدارة اختصارات التطبيقات</h3>
              <p className="text-xs text-muted-foreground">أضف اختصاراً باسم تختاره إلى لوحة التطبيقات لفتح صفحة موجودة. لا ينشئ هذا محرراً لصفحات أو وظائف جديدة؛ إضافة وحدات تشغيلية جديدة تحتاج تطويراً وبرمجة وصلاحيات مستقلة.</p>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input value={newTabTitle} onChange={(e) => setNewTabTitle(e.target.value)} placeholder="اسم الاختصار" maxLength={28} />
                <select value={newTabUrl} onChange={(e) => setNewTabUrl(e.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm">
                  <option value="/dashboard">لوحة التحكم</option>
                  <option value="/pos">نقطة البيع</option>
                  <option value="/sales">الفواتير</option>
                  <option value="/products">المنتجات</option>
                  <option value="/inventory">المخزون</option>
                  <option value="/purchases">المشتريات</option>
                  <option value="/reports">التقارير</option>
                  <option value="/tables">الطاولات</option>
                  <option value="/kitchen">شاشة المطبخ</option>
                  <option value="/promotions">العروض الترويجية</option>
                  <option value="/ads">الإعلانات</option>
                  <option value="/notifications">الإشعارات</option>
                  <option value="/support">مركز المساعدة</option>
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
