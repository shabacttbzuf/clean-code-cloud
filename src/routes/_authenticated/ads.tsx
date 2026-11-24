import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { useSuperOwner } from "@/hooks/use-super-owner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Image, Loader2, Megaphone, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ads")({ component: AdsPage });

type Campaign = {
  id: string;
  company_id: string | null;
  title: string;
  description: string;
  image_url: string | null;
  target_url: string | null;
  placement: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
  target_branch_ids: string[];
};

type AdPlacement = { id: string; placement_key: string; name_ar: string; description: string; is_enabled: boolean; sort_order: number };

const PLACEMENT_LABELS: Record<string, string> = {
  welcome: "مساحة الترحيب", main: "المساحة الرئيسية", sidebar: "المساحة الجانبية",
  offers: "مساحة إعلانات العروض", in_page: "المساحات داخل الصفحات",
  dashboard_banner: "شريط لوحة التحكم", dashboard_card: "بطاقات لوحة التحكم", pos_promo: "مساحة نقطة البيع",
};

export function AdsPage() {
  const { tenantId, userId, role, membership } = useActiveTenant();
  const { isSuperOwner } = useSuperOwner();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [placement, setPlacement] = useState("dashboard_banner");
  const [targetBranchIds, setTargetBranchIds] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState("0");
  const [showPreview, setShowPreview] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [formTouched, setFormTouched] = useState(false);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("ras-workspace-dirty-change", {
      detail: { path: "/ads", dirty: formTouched },
    }));
    return () => { window.dispatchEvent(new CustomEvent("ras-workspace-dirty-change", {
      detail: { path: "/ads", dirty: false },
    })); };
  }, [formTouched]);

  const isTenantOwner = role === "owner" && !membership?.company_id;
  const permissions = useQuery({
    queryKey: ["marketing-management-permissions", tenantId, userId],
    queryFn: async () => {
      if (!tenantId) return [] as string[];
      const { data, error } = await supabase.rpc("get_my_permissions", { _tenant_id: tenantId });
      if (error) throw error;
      return (data ?? []) as string[];
    },
    enabled: !!tenantId && !isSuperOwner && !isTenantOwner,
    staleTime: 30_000,
  });
  const canManage = isSuperOwner || isTenantOwner ||
    ((role === "owner" || role === "manager") && !!membership?.company_id &&
      permissions.data?.includes("ads.manage") === true);

  const branches = useQuery({
    queryKey: ["ads-target-branches", tenantId, membership?.company_id, membership?.branch_id],
    queryFn: async () => {
      let query = supabase.from("branches").select("id,name,company_id").eq("tenant_id", tenantId!);
      if (!isSuperOwner && !isTenantOwner) {
        if (!membership?.company_id) return [] as Array<{ id: string; name: string; company_id: string | null }>;
        query = query.eq("company_id", membership.company_id);
        if (membership.branch_id) query = query.eq("id", membership.branch_id);
      }
      const { data, error } = await query.order("name");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; company_id: string | null }>;
    },
    enabled: !!tenantId && canManage,
  });

  const placements = useQuery({
    queryKey: ["marketing-ad-placements", tenantId, membership?.company_id ?? "tenant"],
    queryFn: async (): Promise<AdPlacement[]> => {
      let query = (supabase.from("marketing_ad_placements" as any) as any)
        .select("id,placement_key,name_ar,description,is_enabled,sort_order")
        .eq("tenant_id", tenantId!).order("sort_order");
      if (!isSuperOwner && !isTenantOwner) {
        if (!membership?.company_id) return [];
        query = query.eq("company_id", membership.company_id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AdPlacement[];
    },
    enabled: !!tenantId && canManage,
  });

  const updatePlacement = useMutation({
    mutationFn: async ({ id, is_enabled }: { id: string; is_enabled: boolean }) => {
      const { data, error } = await (supabase.from("marketing_ad_placements" as any) as any)
        .update({ is_enabled }).eq("id", id).eq("tenant_id", tenantId!).select("id").maybeSingle();
      if (error) throw error;
      if (!data?.id) throw new Error("تعذر تحديث المساحة ضمن نطاق الصلاحيات الحالي.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["marketing-ad-placements", tenantId] }),
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر تحديث المساحة الإعلانية"),
  });

  const campaigns = useQuery({
    queryKey: ["marketing-campaigns", tenantId, membership?.company_id ?? "tenant"],
    queryFn: async (): Promise<Campaign[]> => {
      let query = supabase.from("marketing_campaigns")
        .select("id,company_id,title,description,image_url,target_url,placement,status,starts_at,ends_at,sort_order,target_branch_ids")
        .eq("tenant_id", tenantId!)
        .order("sort_order")
        .order("created_at", { ascending: false });
      if (!isSuperOwner && !isTenantOwner) {
        if (!membership?.company_id) return [];
        query = query.eq("company_id", membership.company_id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Campaign[];
    },
    enabled: !!tenantId && canManage,
  });

  const analytics = useQuery({
    queryKey: ["marketing-campaign-analytics", tenantId, membership?.company_id ?? "tenant"],
    queryFn: async (): Promise<Array<{ campaign_id: string; impressions: number; clicks: number }>> => {
      const { data, error } = await (supabase.rpc as any)("get_marketing_campaign_analytics", { _tenant_id: tenantId! });
      if (error) throw error;
      return (data ?? []) as Array<{ campaign_id: string; impressions: number; clicks: number }>;
    },
    enabled: !!tenantId && canManage,
    staleTime: 30_000,
  });
  const analyticsByCampaign = new Map(
    (analytics.data ?? []).map((row) => [row.campaign_id, row]),
  );

  const saveCampaign = useMutation({
    mutationFn: async () => {
      const cleanTitle = title.trim();
      if (cleanTitle.length < 2 || cleanTitle.length > 120) throw new Error("عنوان الإعلان يجب أن يكون بين حرفين و120 حرفاً");
      if (description.length > 500) throw new Error("الوصف أطول من 500 حرف");
      if (targetUrl) {
        try {
          const parsedTarget = new URL(targetUrl);
          if (parsedTarget.protocol !== "https:" && parsedTarget.protocol !== "http:") throw new Error("invalid protocol");
        } catch {
          throw new Error("رابط الوجهة يجب أن يكون صالحاً ويبدأ بـ https:// أو http://");
        }
      }
      if (startsAt && Number.isNaN(new Date(startsAt).getTime())) throw new Error("تاريخ بداية الإعلان غير صالح");
      if (endsAt && Number.isNaN(new Date(endsAt).getTime())) throw new Error("تاريخ نهاية الإعلان غير صالح");
      if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) throw new Error("تاريخ النهاية يجب أن يكون بعد البداية");
      const normalizedSortOrder = Number(sortOrder);
      if (!Number.isInteger(normalizedSortOrder) || normalizedSortOrder < 0 || normalizedSortOrder > 10000) throw new Error("ترتيب الإعلان يجب أن يكون رقماً صحيحاً بين 0 و10000");
      const payload = {
        company_id: editingId ? editingCompanyId : (membership?.company_id ?? null),
        title: cleanTitle,
        description: description.trim(),
        image_url: imageUrl || null,
        target_url: targetUrl.trim() || null,
        placement,
        target_branch_ids: targetBranchIds,
        sort_order: normalizedSortOrder,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      };
      let updateQuery = supabase.from("marketing_campaigns").update(payload as any)
        .eq("id", editingId ?? "")
        .eq("tenant_id", tenantId!);
      if (editingId && !isSuperOwner && !isTenantOwner) {
        if (!membership?.company_id) throw new Error("لا يوجد نطاق شركة مصرح به لتعديل هذه الحملة.");
        updateQuery = updateQuery.eq("company_id", membership.company_id);
      }
      const result = editingId
        ? await updateQuery.select("id").maybeSingle()
        : await supabase.from("marketing_campaigns").insert({ ...payload, tenant_id: tenantId!, created_by: userId, status: "draft" } as any).select("id").single();
      if (result.error) throw result.error;
      if (!result.data?.id) throw new Error("لم يتم العثور على الحملة ضمن نطاق الشركة الحالي؛ لم يُنفّذ الحفظ.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-campaigns", tenantId] });
      resetForm();
      toast.success("تم حفظ الحملة الإعلانية كمسودة");
    },
    onError: (error) => {
      const dbError = error as { code?: string; message?: string; details?: string; hint?: string };
      const raw = [dbError.message, dbError.details, dbError.hint].filter(Boolean).join(" — ");
      if (dbError.code === "42501" || /row-level security|permission denied/i.test(raw)) {
        toast.error("رفضت قاعدة البيانات حفظ الحملة بسبب الصلاحيات. تحقق من صلاحية إدارة الإعلانات ونطاق الشركة، ثم أعد المحاولة.");
        console.error("Marketing campaign RLS failure", { code: dbError.code, message: raw });
        return;
      }
      toast.error(raw ? `تعذر حفظ الحملة: ${raw}` : "تعذر حفظ الحملة الإعلانية. تحقق من البيانات ثم أعد المحاولة.");
      console.error("Marketing campaign save failed", error);
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      let query = supabase.from("marketing_campaigns").update({ status }).eq("id", id).eq("tenant_id", tenantId!);
      if (!isSuperOwner && !isTenantOwner) {
        if (!membership?.company_id) throw new Error("لا يوجد نطاق شركة مصرح به لإدارة هذه الحملة.");
        query = query.eq("company_id", membership.company_id);
      }
      const { data, error } = await query.select("id").maybeSingle();
      if (error) throw error;
      if (!data?.id) throw new Error("لم يتم العثور على الحملة ضمن نطاق الشركة المصرح به.");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["marketing-campaigns", tenantId] }),
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر تحديث حالة الحملة"),
  });

  const deleteCampaign = useMutation({
    mutationFn: async (id: string) => {
      let query = supabase.from("marketing_campaigns").delete().eq("id", id).eq("tenant_id", tenantId!);
      if (!isSuperOwner && !isTenantOwner) {
        if (!membership?.company_id) throw new Error("لا يوجد نطاق شركة مصرح به لإدارة هذه الحملة.");
        query = query.eq("company_id", membership.company_id);
      }
      const { data, error } = await query.select("id").maybeSingle();
      if (error) throw error;
      if (!data?.id) throw new Error("لم يتم العثور على الحملة أو لا تملك صلاحية حذفها.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-campaigns", tenantId] });
      toast.success("تم حذف الحملة");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر حذف الحملة"),
  });

  function resetForm() {
    setFormTouched(false);
    setEditingId(null);
    setEditingCompanyId(null);
    setTitle("");
    setDescription("");
    setImageUrl("");
    setTargetUrl("");
    setPlacement("dashboard_banner");
    setTargetBranchIds([]);
    setSortOrder("0");
    setShowPreview(false);
    setStartsAt("");
    setEndsAt("");
  }

  async function uploadImage(file?: File) {
    if (!file || !tenantId || !canManage) return;
    const extensions: Record<string, string> = {
      "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif",
    };
    const extension = extensions[file.type];
    if (!extension) { toast.error("صيغة الصورة غير مدعومة"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("الحجم الأقصى للصورة 5MB"); return; }
    setUploading(true);
    try {
      const path = membership?.company_id
        ? `${tenantId}/companies/${membership.company_id}/marketing/${crypto.randomUUID()}.${extension}`
        : `${tenantId}/marketing/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from("restaurant-assets").upload(path, file, {
        upsert: false, contentType: file.type, cacheControl: "31536000",
      });
      if (error) throw error;
      setImageUrl(supabase.storage.from("restaurant-assets").getPublicUrl(path).data.publicUrl);
      setFormTouched(true);
      toast.success("تم رفع صورة الإعلان");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر رفع الصورة");
    } finally {
      setUploading(false);
    }
  }

  function editCampaign(campaign: Campaign) {
    setFormTouched(false);
    setEditingId(campaign.id);
    setEditingCompanyId(campaign.company_id);
    setTitle(campaign.title);
    setDescription(campaign.description);
    setImageUrl(campaign.image_url ?? "");
    setTargetUrl(campaign.target_url ?? "");
    setPlacement(campaign.placement);
    setTargetBranchIds(campaign.target_branch_ids ?? []);
    setSortOrder(String(campaign.sort_order ?? 0));
    setShowPreview(false);
    const toLocalInput = (value: string | null) => {
      if (!value) return "";
      const date = new Date(value);
      return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    };
    setStartsAt(toLocalInput(campaign.starts_at));
    setEndsAt(toLocalInput(campaign.ends_at));
  }

  if (!canManage && !permissions.isLoading) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">لا تملك صلاحية إدارة الحملات الإعلانية. تتطلب إدارة حملات الشركة صلاحية إدارة الإعلانات المستقلة عن إعدادات النظام.</CardContent></Card>;
  }

  return (
    <div className="space-y-5">
      <PageHeader title="الإعلانات والمساحات الإعلانية" subtitle="إدارة مستقلة للحملات والمساحات والمواد الإعلانية والاستهداف حسب الفروع، دون ربطها بإعدادات النظام أو سجلات العروض." />
      <Card>
        <CardHeader><CardTitle>إدارة المساحات الإعلانية</CardTitle><CardDescription>فعّل أو أوقف كل موضع إعلاني بصورة مستقلة. لا يؤدي إيقاف المساحة إلى حذف الحملات أو تغيير العروض الترويجية.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {placements.isLoading ? <div className="text-sm text-muted-foreground">جارٍ تحميل المساحات...</div> : placements.isError ? <div className="text-sm text-destructive">تعذر تحميل المساحات الإعلانية.</div> : placements.data?.map((slot) => (
            <div key={slot.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0"><div className="font-medium">{slot.name_ar}</div><p className="text-xs text-muted-foreground">{slot.description}</p><p className="mt-1 text-xs">{slot.is_enabled ? "مفعّلة" : "متوقفة"}</p></div>
              <Button type="button" size="sm" variant={slot.is_enabled ? "outline" : "default"} disabled={updatePlacement.isPending} onClick={() => updatePlacement.mutate({ id: slot.id, is_enabled: !slot.is_enabled })}>{slot.is_enabled ? "إيقاف" : "تفعيل"}</Button>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" /> {editingId ? "تعديل حملة إعلانية" : "إنشاء حملة إعلانية"}</CardTitle>
          <CardDescription>تُحفظ الحملة كمسودة أولاً. راجع تفاصيلها ثم فعّلها من قائمة الحملات.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2"><Label>عنوان الإعلان</Label><Input value={title} onChange={(event) => { setTitle(event.target.value); setFormTouched(true); }} maxLength={120} placeholder="مثال: عروض نهاية الأسبوع" /></div>
            <div className="space-y-2"><Label>المساحة الإعلانية</Label>
              <select value={placement} onChange={(event) => { setPlacement(event.target.value); setFormTouched(true); }} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                {(placements.data ?? []).filter((slot) => slot.is_enabled).map((slot) => <option key={slot.placement_key} value={slot.placement_key}>{slot.name_ar}</option>)}
              </select>
            </div>
            <div className="space-y-2"><Label>ترتيب الظهور (الأقل أولاً)</Label><Input type="number" min="0" max="10000" step="1" value={sortOrder} onChange={(event) => { setSortOrder(event.target.value); setFormTouched(true); }} /></div>
            <div className="space-y-2 md:col-span-2"><Label>وصف الإعلان</Label><Input value={description} onChange={(event) => { setDescription(event.target.value); setFormTouched(true); }} maxLength={500} placeholder="اكتب تفاصيل الإعلان" /></div>
            <div className="space-y-2 md:col-span-2"><Label>الفروع المستهدفة</Label><p className="text-xs text-muted-foreground">اترك الاختيار فارغاً لعرض الإعلان في جميع الفروع المسموح بها. يمكنك تحديد فرع أو أكثر.</p><div className="grid max-h-36 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">{branches.data?.map((branch) => <label key={branch.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={targetBranchIds.includes(branch.id)} onChange={(event) => { setTargetBranchIds((current) => event.target.checked ? [...current, branch.id] : current.filter((id) => id !== branch.id)); setFormTouched(true); }} />{branch.name}</label>)}{!branches.data?.length && <span className="text-xs text-muted-foreground">لا توجد فروع متاحة ضمن نطاق صلاحياتك.</span>}</div></div>
            <div className="space-y-2"><Label>رابط الوجهة (اختياري)</Label><Input dir="ltr" value={targetUrl} onChange={(event) => { setTargetUrl(event.target.value); setFormTouched(true); }} placeholder="https://example.com" /></div>
            <div className="space-y-2"><Label>صورة الإعلان</Label><div className="flex items-center gap-3">
              <div className="grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">{imageUrl ? <img src={imageUrl} alt="معاينة الإعلان" className="h-full w-full object-cover" /> : <Image className="h-5 w-5 text-muted-foreground" />}</div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{uploading ? "جارٍ الرفع..." : "اختيار صورة"}<input className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={uploading} onChange={(event) => { void uploadImage(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
            </div></div>
            <div className="space-y-2"><Label>تاريخ ووقت البداية</Label><Input type="datetime-local" value={startsAt} onChange={(event) => { setStartsAt(event.target.value); setFormTouched(true); }} /></div>
            <div className="space-y-2"><Label>تاريخ ووقت النهاية</Label><Input type="datetime-local" value={endsAt} onChange={(event) => { setEndsAt(event.target.value); setFormTouched(true); }} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setShowPreview((current) => !current)}>{showPreview ? "إخفاء المعاينة" : "معاينة الإعلان"}</Button>
            <Button type="button" onClick={() => saveCampaign.mutate()} disabled={saveCampaign.isPending || !title.trim()}>{saveCampaign.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}<Plus className="ml-1 h-4 w-4" />{editingId ? "حفظ التعديلات" : "حفظ كمسودة"}</Button>
            {editingId && <Button type="button" variant="outline" onClick={resetForm}>إلغاء التعديل</Button>}
          </div>
          {showPreview && (
            <div className="overflow-hidden rounded-xl border bg-card" aria-label="معاينة الإعلان">
              {imageUrl ? <img src={imageUrl} alt="صورة معاينة الإعلان" className="h-44 w-full object-cover" /> : <div className="grid h-32 place-items-center bg-muted text-sm text-muted-foreground">لا توجد صورة مرفقة</div>}
              <div className="space-y-2 p-4">
                <div className="text-xs font-medium text-primary">معاينة {PLACEMENT_LABELS[placement] ?? placement}</div>
                <h3 className="text-lg font-bold">{title.trim() || "عنوان الإعلان"}</h3>
                <p className="text-sm text-muted-foreground">{description.trim() || "سيظهر وصف الإعلان هنا."}</p>
                {targetUrl.trim() && <div dir="ltr" className="truncate text-xs text-muted-foreground">{targetUrl.trim()}</div>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>الحملات الإعلانية المحفوظة</CardTitle><CardDescription>تظهر الحملات وفق الشركة والفرع وسياسات الوصول المطبقة في قاعدة البيانات.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {campaigns.isLoading || permissions.isLoading ? <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div> :
            campaigns.isError ? <div className="text-sm text-destructive">تعذر تحميل الحملات. <Button type="button" variant="link" onClick={() => void campaigns.refetch()}>إعادة المحاولة</Button></div> :
            campaigns.data?.length ? campaigns.data.map((campaign) => {
              const canEdit = isSuperOwner || isTenantOwner || (!!membership?.company_id && campaign.company_id === membership.company_id && canManage);
              return <div key={campaign.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                {campaign.image_url && <img src={campaign.image_url} alt="" className="h-14 w-20 rounded object-cover" />}
                <div className="min-w-0 flex-1"><div className="font-medium">{campaign.title}</div><div className="text-xs text-muted-foreground">{PLACEMENT_LABELS[campaign.placement] ?? campaign.placement} · {campaign.status === "active" ? "نشط" : campaign.status === "paused" ? "متوقف" : campaign.status === "archived" ? "مؤرشف" : "مسودة"}{campaign.starts_at ? ` · يبدأ ${new Date(campaign.starts_at).toLocaleString("ar")}` : ""}{campaign.ends_at ? ` · ينتهي ${new Date(campaign.ends_at).toLocaleString("ar")}` : ""}</div>
                  <div className="mt-1 text-xs text-muted-foreground" aria-label="إحصاءات الحملة">
                    {analytics.isLoading ? "جارٍ تحميل الإحصاءات..." : analytics.isError ? "تعذر تحميل الإحصاءات" : (() => {
                      const stats = analyticsByCampaign.get(campaign.id);
                      return `المشاهدات الفريدة يومياً: ${stats?.impressions ?? 0} · النقرات الفريدة يومياً: ${stats?.clicks ?? 0}`;
                    })()}
                  </div></div>
                <Button type="button" size="sm" variant="ghost" disabled={!canEdit} onClick={() => editCampaign(campaign)}>تعديل</Button>
                <Button type="button" size="sm" variant="outline" disabled={!canEdit || updateStatus.isPending} onClick={() => updateStatus.mutate({
                  id: campaign.id,
                  status: campaign.status === "active" ? "paused" : campaign.status === "archived" ? "draft" : "active",
                })}>
                  {campaign.status === "active" ? "إيقاف" : campaign.status === "archived" ? "استعادة كمسودة" : "تفعيل"}
                </Button>
                {campaign.status !== "archived" && (
                  <Button type="button" size="sm" variant="ghost" disabled={!canEdit || updateStatus.isPending}
                    onClick={() => {
                      if (window.confirm("ستُوقف هذه الحملة وتُنقل إلى الأرشيف. هل تريد المتابعة؟")) {
                        updateStatus.mutate({ id: campaign.id, status: "archived" });
                      }
                    }}>
                    أرشفة
                  </Button>
                )}
                <Button type="button" size="icon" variant="ghost" aria-label={"حذف " + campaign.title} disabled={!canEdit || deleteCampaign.isPending} onClick={() => { if (window.confirm("هل تريد حذف هذه الحملة نهائياً؟")) deleteCampaign.mutate(campaign.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>;
            }) : <p className="text-sm text-muted-foreground">لا توجد حملات إعلانية حتى الآن.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
