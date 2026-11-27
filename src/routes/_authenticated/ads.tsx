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
  branch_id: string | null;
  advertising_space_id: string | null;
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

const PLACEMENT_LABELS: Record<string, string> = {
  dashboard_banner: "الشريط الرئيسي في لوحة التحكم",
  dashboard_card: "بطاقة إعلانية في لوحة التحكم",
  pos_promo: "المساحة الترويجية في نقطة البيع",
  welcome: "مساحة الترحيب",
  main: "المساحة الرئيسية",
  sidebar: "المساحة الجانبية",
  offers: "مساحة إعلانات العروض",
  in_page: "المساحات داخل الصفحات",
};

const PLACEMENT_FORMATS: Record<string, "banner" | "card" | "inline" | "pos"> = {
  dashboard_banner: "banner",
  dashboard_card: "card",
  pos_promo: "pos",
  welcome: "banner",
  main: "banner",
  sidebar: "inline",
  offers: "card",
  in_page: "inline",
};

export function AdsPage() {
  const { tenantId, userId, role, membership, hasPermission } = useActiveTenant();
  const { isSuperOwner } = useSuperOwner();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [placement, setPlacement] = useState("dashboard_banner");
  const [branchId, setBranchId] = useState("");
  const [targetBranchIds, setTargetBranchIds] = useState<string[]>([]);
  const [adSpaceId, setAdSpaceId] = useState("");
  const [newSpaceName, setNewSpaceName] = useState("");
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
  const canViewAds = isSuperOwner || isTenantOwner || hasPermission("ads.view") || hasPermission("ads.manage");
  const canCreateAds = isSuperOwner || isTenantOwner || hasPermission("ads.create") || hasPermission("ads.manage");
  const canEditAds = isSuperOwner || isTenantOwner || hasPermission("ads.edit") || hasPermission("ads.manage");
  const canApproveAds = isSuperOwner || isTenantOwner || hasPermission("ads.approve") || hasPermission("ads.manage");
  const canDeleteAds = isSuperOwner || isTenantOwner || hasPermission("ads.delete") || hasPermission("ads.manage");
  // Campaign analytics and ad-space configuration remain limited to legacy management capability.
  const canManageAnalytics = isSuperOwner || isTenantOwner || hasPermission("ads.manage");
  const canManageAdSpaces = canManageAnalytics;

  useEffect(() => {
    if (membership?.branch_id) setBranchId(membership.branch_id);
  }, [membership?.branch_id]);

  const branches = useQuery({
    queryKey: ["marketing-branches", tenantId, userId, membership?.company_id, membership?.branch_id],
    queryFn: async () => {
      let query = supabase.from("branches").select("id,name,company_id")
        .eq("tenant_id", tenantId!).eq("is_active", true).order("name");
      if (membership?.company_id) query = query.eq("company_id", membership.company_id);
      if (membership?.branch_id && role !== "owner" && role !== "manager") {
        query = query.eq("id", membership.branch_id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId && canViewAds,
  });

  const adSpaces = useQuery({
    queryKey: ["marketing-ad-spaces", tenantId, userId, membership?.company_id, membership?.branch_id ?? "all", branchId],
    queryFn: async () => {
      let query = supabase.from("marketing_ad_spaces")
        .select("id,tenant_id,company_id,branch_id,space_key,name,format,is_active,sort_order")
        .eq("tenant_id", tenantId!).order("sort_order").order("name");
      if (membership?.company_id) query = query.eq("company_id", membership.company_id);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId && canViewAds,
  });

  const availableAdSpaces = (adSpaces.data ?? []).filter((space) =>
    space.is_active && (targetBranchIds.length > 0
      ? space.branch_id === null
      : space.branch_id === null || space.branch_id === (branchId || null))
  );

  const createAdSpace = useMutation({
    mutationFn: async () => {
      if (!canManageAdSpaces) throw new Error("لا تملك صلاحية إدارة المساحات الإعلانية.");
      const cleanName = newSpaceName.trim();
      if (cleanName.length < 2 || cleanName.length > 120) throw new Error("اسم المساحة يجب أن يكون بين حرفين و120 حرفاً");
      const selectedBranch = (branches.data ?? []).find((item) => item.id === branchId);
      const companyId = selectedBranch?.company_id ?? membership?.company_id ?? null;
      const format = PLACEMENT_FORMATS[placement] ?? "inline";
      const { data, error } = await supabase.from("marketing_ad_spaces").insert({
        tenant_id: tenantId!,
        company_id: companyId,
        branch_id: branchId || null,
        space_key: placement,
        name: cleanName,
        format,
        created_by: userId,
      }).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      setAdSpaceId(id);
      setNewSpaceName("");
      void queryClient.invalidateQueries({ queryKey: ["marketing-ad-spaces", tenantId] });
      toast.success("تم إنشاء المساحة الإعلانية وربطها بالنطاق المحدد");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر إنشاء المساحة الإعلانية"),
  });

  const toggleAdSpace = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      if (!canManageAdSpaces) throw new Error("لا تملك صلاحية إدارة المساحات الإعلانية.");
      let query = supabase.from("marketing_ad_spaces")
        .update({ is_active: !active, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", tenantId!);
      if (!isSuperOwner && !isTenantOwner) {
        if (!membership?.company_id) throw new Error("لا يوجد نطاق شركة مصرح به لإدارة هذه المساحة.");
        query = query.eq("company_id", membership.company_id);
      }
      const { data, error } = await query.select("id").maybeSingle();
      if (error) throw error;
      if (!data?.id) throw new Error("لم يتم العثور على المساحة ضمن نطاق الشركة والفرع المصرح به.");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["marketing-ad-spaces", tenantId] });
      toast.success("تم تحديث حالة المساحة الإعلانية");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر تحديث حالة المساحة الإعلانية"),
  });

  const campaigns = useQuery({
    queryKey: ["marketing-campaigns", tenantId, userId, membership?.company_id ?? "tenant", membership?.branch_id ?? "all"],
    queryFn: async (): Promise<Campaign[]> => {
      let query = supabase.from("marketing_campaigns")
        .select("id,company_id,branch_id,advertising_space_id,title,description,image_url,target_url,placement,status,starts_at,ends_at,sort_order,target_branch_ids")
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
    enabled: !!tenantId && canViewAds,
  });

  const analytics = useQuery({
    queryKey: ["marketing-campaign-analytics", tenantId, userId, membership?.company_id ?? "tenant", membership?.branch_id ?? "all"],
    queryFn: async (): Promise<Array<{ campaign_id: string; impressions: number; clicks: number }>> => {
      const { data, error } = await (supabase.rpc as any)("get_marketing_campaign_analytics", { _tenant_id: tenantId! });
      if (error) throw error;
      return (data ?? []) as Array<{ campaign_id: string; impressions: number; clicks: number }>;
    },
    enabled: !!tenantId && canManageAnalytics,
    staleTime: 30_000,
  });
  const analyticsByCampaign = new Map(
    (analytics.data ?? []).map((row) => [row.campaign_id, row]),
  );

  const saveCampaign = useMutation({
    mutationFn: async () => {
      if (editingId ? !canEditAds : !canCreateAds) throw new Error("لا تملك صلاحية إنشاء أو تعديل الحملات الإعلانية.");
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
      if (branchId && targetBranchIds.length) {
        throw new Error("اختر فرعاً واحداً من القائمة أو عدة فروع من قائمة الاستهداف، وليس الاثنين معاً.");
      }
      if (targetBranchIds.length > 1000) throw new Error("لا يمكن استهداف أكثر من 1000 فرع في الحملة الواحدة.");
      const selectedBranch = (branches.data ?? []).find((item) => item.id === branchId);
      const selectedTargetBranches = (branches.data ?? []).filter((item) => targetBranchIds.includes(item.id));
      if (selectedTargetBranches.length !== targetBranchIds.length) {
        throw new Error("توجد فروع مستهدفة خارج نطاق صلاحياتك أو لم تعد متاحة.");
      }
      const targetCompanyIds = [...new Set(selectedTargetBranches.map((item) => item.company_id).filter(Boolean))];
      if (membership?.company_id && targetCompanyIds.some((id) => id !== membership.company_id)) {
        throw new Error("لا يمكن استهداف فروع خارج الشركة النشطة.");
      }
      const campaignCompanyId = selectedBranch?.company_id ?? (targetBranchIds.length
        ? (membership?.company_id ?? (targetCompanyIds.length === 1 ? targetCompanyIds[0] : null))
        : (editingId ? editingCompanyId : (membership?.company_id ?? null)));
      if (targetBranchIds.length && adSpaceId) {
        const selectedSpace = (adSpaces.data ?? []).find((space) => space.id === adSpaceId);
        if (!selectedSpace || selectedSpace.branch_id !== null || selectedSpace.company_id !== campaignCompanyId) {
          throw new Error("عند استهداف عدة فروع يجب اختيار مساحة إعلانية عامة ضمن نطاق الشركة نفسها.");
        }
      }
      const payload = {
        company_id: campaignCompanyId,
        branch_id: targetBranchIds.length ? null : (branchId || null),
        target_branch_ids: [...new Set(targetBranchIds)],
        advertising_space_id: adSpaceId || null,
        title: cleanTitle,
        description: description.trim(),
        image_url: imageUrl || null,
        target_url: targetUrl.trim() || null,
        placement,
        sort_order: normalizedSortOrder,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      };
      let updateQuery = supabase.from("marketing_campaigns").update(payload)
        .eq("id", editingId ?? "")
        .eq("tenant_id", tenantId!);
      if (editingId && !isSuperOwner && !isTenantOwner) {
        if (!membership?.company_id) throw new Error("لا يوجد نطاق شركة مصرح به لتعديل هذه الحملة.");
        updateQuery = updateQuery.eq("company_id", membership.company_id);
      }
      const result = editingId
        ? await updateQuery.select("id").maybeSingle()
        : await supabase.from("marketing_campaigns").insert({ ...payload, tenant_id: tenantId!, created_by: userId, status: "draft" }).select("id").single();
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
      if (!canApproveAds) throw new Error("لا تملك صلاحية اعتماد أو تغيير حالة الإعلان.");
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
      if (!canDeleteAds) throw new Error("لا تملك صلاحية حذف الإعلانات.");
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
    setBranchId(membership?.branch_id ?? "");
    setTargetBranchIds([]);
    setAdSpaceId("");
    setSortOrder("0");
    setShowPreview(false);
    setStartsAt("");
    setEndsAt("");
  }

  async function uploadImage(file?: File) {
    if (!file || !tenantId || !(editingId ? canEditAds : canCreateAds)) return;
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
    setBranchId(campaign.branch_id ?? "");
    setTargetBranchIds(campaign.target_branch_ids ?? []);
    setAdSpaceId(campaign.advertising_space_id ?? "");
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

  if (!canViewAds) {
    return <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">لا تملك صلاحية إدارة الحملات الإعلانية. تتطلب إدارة حملات الشركة صلاحية إدارة الإعلانات المستقلة عن إعدادات النظام.</CardContent></Card>;
  }

  return (
    <div className="space-y-5">
      <PageHeader title="الإعلانات والمساحات الإعلانية" subtitle="إدارة الحملات الإعلانية وصورها وروابطها ومواقع ظهورها وجدولتها بصورة مستقلة عن إعدادات النظام والعروض الترويجية." />
      <Card>
        <CardHeader>
          <CardTitle>إدارة المساحات الإعلانية</CardTitle>
          <CardDescription>أنشئ مساحات مستقلة على مستوى الشركة أو فرع محدد، ثم اربط الحملات بها.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            {canManageAdSpaces && <Input value={newSpaceName} onChange={(event) => setNewSpaceName(event.target.value)} maxLength={120} placeholder="اسم المساحة الجديدة" />}
            {canManageAdSpaces && <Button type="button" variant="outline" disabled={!newSpaceName.trim() || createAdSpace.isPending} onClick={() => createAdSpace.mutate()}>
              {createAdSpace.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Plus className="ml-2 h-4 w-4" />} إنشاء مساحة حسب نوع الإعلان والفرع المحدد
            </Button>}
          </div>
          <div className="flex flex-wrap gap-2">
            {(adSpaces.data ?? []).map((space) => (
              <div key={space.id} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
                <span>{space.name} · {space.branch_id ? "فرعي" : "عام"} · {space.is_active ? "نشط" : "متوقف"}</span>
                {canManageAdSpaces && <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={toggleAdSpace.isPending}
                  onClick={() => toggleAdSpace.mutate({ id: space.id, active: space.is_active })}
                >
                  {space.is_active ? "إيقاف" : "تفعيل"}
                </Button>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      {(canCreateAds || (editingId && canEditAds)) && <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" /> {editingId ? "تعديل حملة إعلانية" : "إنشاء حملة إعلانية"}</CardTitle>
          <CardDescription>تُحفظ الحملة كمسودة أولاً. راجع تفاصيلها ثم فعّلها من قائمة الحملات.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2"><Label>عنوان الإعلان</Label><Input value={title} onChange={(event) => { setTitle(event.target.value); setFormTouched(true); }} maxLength={120} placeholder="مثال: عروض نهاية الأسبوع" /></div>
            <div className="space-y-2"><Label>نطاق الفرع</Label>
              <select value={branchId} onChange={(event) => { setBranchId(event.target.value); setTargetBranchIds([]); setAdSpaceId(""); setFormTouched(true); }} className="h-10 w-full rounded-md border bg-background px-3 text-sm" disabled={!!membership?.branch_id && role !== "owner" && role !== "manager"}>
                <option value="">جميع فروع النطاق</option>
                {(branches.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2"><Label>استهداف عدة فروع</Label><p className="text-xs text-muted-foreground">اختيار فروع متعددة يلغي اختيار الفرع المفرد أعلاه. اترك القائمة فارغة لاستخدام نطاق الفرع أو الشركة الحالي.</p><div className="grid max-h-36 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2">{(branches.data ?? []).map((item) => <label key={item.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={targetBranchIds.includes(item.id)} disabled={!!branchId} onChange={(event) => { setTargetBranchIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id)); setAdSpaceId(""); setFormTouched(true); }} />{item.name}</label>)}{!branches.data?.length && <span className="text-xs text-muted-foreground">لا توجد فروع متاحة ضمن نطاق صلاحياتك.</span>}</div></div>
            <div className="space-y-2"><Label>المساحة الإعلانية المُدارة</Label>
              <select value={adSpaceId} onChange={(event) => { setAdSpaceId(event.target.value); setFormTouched(true); }} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="">استخدم نوع المساحة فقط (توافق قديم)</option>
                {availableAdSpaces.filter((space) => space.space_key === placement).map((space) => <option key={space.id} value={space.id}>{space.name}{space.branch_id ? " · فرع محدد" : " · عامة"}</option>)}
              </select>
            </div>
            <div className="space-y-2"><Label>نوع المساحة الإعلانية</Label>
              <select value={placement} onChange={(event) => { setPlacement(event.target.value); setFormTouched(true); }} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                {Object.entries(PLACEMENT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
            <div className="space-y-2"><Label>ترتيب الظهور (الأقل أولاً)</Label><Input type="number" min="0" max="10000" step="1" value={sortOrder} onChange={(event) => { setSortOrder(event.target.value); setFormTouched(true); }} /></div>
            <div className="space-y-2 md:col-span-2"><Label>وصف الإعلان</Label><Input value={description} onChange={(event) => { setDescription(event.target.value); setFormTouched(true); }} maxLength={500} placeholder="اكتب تفاصيل الإعلان" /></div>
            <div className="space-y-2"><Label>رابط الوجهة (اختياري)</Label><Input dir="ltr" value={targetUrl} onChange={(event) => { setTargetUrl(event.target.value); setFormTouched(true); }} placeholder="https://example.com" /></div>
            <div className="space-y-2"><Label>صورة الإعلان</Label><div className="flex items-center gap-3">
              <div className="grid h-14 w-20 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">{imageUrl ? <img src={imageUrl} alt="معاينة الإعلان" className="h-full w-full object-cover" /> : <Image className="h-5 w-5 text-muted-foreground" />}</div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{uploading ? "جارٍ الرفع..." : "اختيار صورة"}<input className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={uploading || !(editingId ? canEditAds : canCreateAds)} onChange={(event) => { void uploadImage(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>
            </div></div>
            <div className="space-y-2"><Label>تاريخ ووقت البداية</Label><Input type="datetime-local" value={startsAt} onChange={(event) => { setStartsAt(event.target.value); setFormTouched(true); }} /></div>
            <div className="space-y-2"><Label>تاريخ ووقت النهاية</Label><Input type="datetime-local" value={endsAt} onChange={(event) => { setEndsAt(event.target.value); setFormTouched(true); }} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setShowPreview((current) => !current)}>{showPreview ? "إخفاء المعاينة" : "معاينة الإعلان"}</Button>
            <Button type="button" onClick={() => saveCampaign.mutate()} disabled={saveCampaign.isPending || !title.trim() || (editingId ? !canEditAds : !canCreateAds)}>{saveCampaign.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}<Plus className="ml-1 h-4 w-4" />{editingId ? "حفظ التعديلات" : "حفظ كمسودة"}</Button>
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
      </Card>}
      <Card>
        <CardHeader><CardTitle>الحملات الإعلانية المحفوظة</CardTitle><CardDescription>تظهر الحملات وفق الشركة والفرع وسياسات الوصول المطبقة في قاعدة البيانات.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {campaigns.isLoading ? <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div> :
            campaigns.isError ? <div className="text-sm text-destructive">تعذر تحميل الحملات. <Button type="button" variant="link" onClick={() => void campaigns.refetch()}>إعادة المحاولة</Button></div> :
            campaigns.data?.length ? campaigns.data.map((campaign) => {
              const inCampaignScope = isSuperOwner || isTenantOwner || (!!membership?.company_id && campaign.company_id === membership.company_id);
              const canEditCampaign = canEditAds && inCampaignScope;
              const canApproveCampaign = canApproveAds && inCampaignScope;
              const canDeleteCampaign = canDeleteAds && inCampaignScope;
              return <div key={campaign.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                {campaign.image_url && <img src={campaign.image_url} alt="" className="h-14 w-20 rounded object-cover" />}
                <div className="min-w-0 flex-1"><div className="font-medium">{campaign.title}</div><div className="text-xs text-muted-foreground">{PLACEMENT_LABELS[campaign.placement] ?? campaign.placement}{campaign.target_branch_ids?.length ? ` · ${campaign.target_branch_ids.length} فروع مستهدفة` : campaign.branch_id ? " · حملة مخصصة لفرع" : " · جميع الفروع"} · {campaign.status === "active" ? "نشط" : campaign.status === "paused" ? "متوقف" : campaign.status === "archived" ? "مؤرشف" : "مسودة"}{campaign.starts_at ? ` · يبدأ ${new Date(campaign.starts_at).toLocaleString("ar")}` : ""}{campaign.ends_at ? ` · ينتهي ${new Date(campaign.ends_at).toLocaleString("ar")}` : ""}</div>
                  {canManageAnalytics && <div className="mt-1 text-xs text-muted-foreground" aria-label="إحصاءات الحملة">
                    {analytics.isLoading ? "جارٍ تحميل الإحصاءات..." : analytics.isError ? "تعذر تحميل الإحصاءات" : (() => {
                      const stats = analyticsByCampaign.get(campaign.id);
                      return `المشاهدات الفريدة يومياً: ${stats?.impressions ?? 0} · النقرات الفريدة يومياً: ${stats?.clicks ?? 0}`;
                    })()}
                  </div>}</div>
                <Button type="button" size="sm" variant="ghost" disabled={!canEditCampaign} onClick={() => editCampaign(campaign)}>تعديل</Button>
                <Button type="button" size="sm" variant="outline" disabled={!canApproveCampaign || updateStatus.isPending} onClick={() => updateStatus.mutate({
                  id: campaign.id,
                  status: campaign.status === "active" ? "paused" : campaign.status === "archived" ? "draft" : "active",
                })}>
                  {campaign.status === "active" ? "إيقاف" : campaign.status === "archived" ? "استعادة كمسودة" : "تفعيل"}
                </Button>
                {campaign.status !== "archived" && (
                  <Button type="button" size="sm" variant="ghost" disabled={!canApproveCampaign || updateStatus.isPending}
                    onClick={() => {
                      if (window.confirm("ستُوقف هذه الحملة وتُنقل إلى الأرشيف. هل تريد المتابعة؟")) {
                        updateStatus.mutate({ id: campaign.id, status: "archived" });
                      }
                    }}>
                    أرشفة
                  </Button>
                )}
                <Button type="button" size="icon" variant="ghost" aria-label={"حذف " + campaign.title} disabled={!canDeleteCampaign || deleteCampaign.isPending} onClick={() => { if (window.confirm("هل تريد حذف هذه الحملة نهائياً؟")) deleteCampaign.mutate(campaign.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>;
            }) : <p className="text-sm text-muted-foreground">لا توجد حملات إعلانية حتى الآن.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
