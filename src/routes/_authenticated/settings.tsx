import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

const schema = z.object({
  name: z.string().trim().min(2, "الاسم قصير").max(100),
  currency: z.string().trim().min(1).max(5),
  tax_rate: z.coerce.number().min(0).max(100),
  logo_url: z.string().url().nullable().optional(),
});

function SettingsPage() {
  const { tenant, tenantId, isAdmin, role } = useActiveTenant();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("SAR");
  const [tax, setTax] = useState("15");
  const [logoUrl, setLogoUrl] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    if (tenant) {
      setName(tenant.name);
      setCurrency(tenant.currency);
      setTax(String(tenant.tax_rate));
      setLogoUrl(tenant.logo_url ?? "");
    }
  }, [tenant]);

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
    </div>
  );
}
