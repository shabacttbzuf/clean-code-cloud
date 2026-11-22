import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, KeyRound, Upload, Eye, EyeOff, ShieldCheck, Briefcase, Building2, CalendarDays, Monitor, MapPin } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { updateMyProfile, updateUserPassword } from "@/lib/users.functions";
import { getMyPosAccessStatus, setMyPosPasscode } from "@/lib/pos-access.functions";
import { resolveAvatarUrl } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function formatProfileDate(value?: string | null, dateOnly = false) {
  if (!value) return "غير مسجل";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ar-YE", dateOnly ? { year: "numeric", month: "long", day: "numeric" } : undefined);
}

function accountStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "نشط",
    suspended: "موقوف",
    frozen: "مجمّد",
    pending_approval: "بانتظار الاعتماد",
    password_expired: "انتهت صلاحية كلمة المرور",
    archived: "مؤرشف",
  };
  return labels[status] ?? "غير معروف";
}

function ProfileInfo({ label, value, direction = "auto" }: { label: string; value?: string | null; direction?: "ltr" | "rtl" | "auto" }) {
  return (
    <div className="min-w-0 rounded-lg border p-3">
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div dir={direction} className="break-words text-sm font-semibold">{value || "غير مسجل"}</div>
    </div>
  );
}

function ProfilePage() {
  const { user } = useAuthSession();
  const { tenantId } = useActiveTenant();
  const qc = useQueryClient();
  const updateFn = useServerFn(updateMyProfile);
  const pwdFn = useServerFn(updateUserPassword);
  const getPosAccessStatus = useServerFn(getMyPosAccessStatus);
  const setPosPasscodeFn = useServerFn(setMyPosPasscode);
  const posAccessQuery = useQuery({
    queryKey: ["pos-access-status", tenantId, user?.id],
    queryFn: () => getPosAccessStatus({ data: { tenant_id: tenantId! } }),
    enabled: !!tenantId && !!user?.id,
    staleTime: 30_000,
  });

  const profileQuery = useQuery({
    queryKey: ["my-profile", user?.id, tenantId],
    queryFn: async () => {
      if (!user?.id) throw new Error("لا يوجد مستخدم مسجل الدخول.");
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, username, phone, email, avatar_url, last_login_at, last_device, last_ip, created_at, tenant_id, branch_id, company_id, department_id, job_title, employee_no, national_id, employment_date, status, is_active, must_change_password, approved_at, password_changed_at")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("لم يتم العثور على ملف المستخدم.");

      const [branchResult, companyResult, departmentResult] = await Promise.all([
        data.branch_id && data.tenant_id
          ? supabase.from("branches").select("name").eq("id", data.branch_id).eq("tenant_id", data.tenant_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        data.company_id && data.tenant_id
          ? supabase.from("companies").select("name").eq("id", data.company_id).eq("tenant_id", data.tenant_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        data.department_id && data.tenant_id
          ? supabase.from("departments").select("name").eq("id", data.department_id).eq("tenant_id", data.tenant_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      return {
        ...data,
        branch_name: branchResult.error ? null : branchResult.data?.name ?? null,
        company_name: companyResult.error ? null : companyResult.data?.name ?? null,
        department_name: departmentResult.error ? null : departmentResult.data?.name ?? null,
        assignment_lookup_incomplete: !!(branchResult.error || companyResult.error || departmentResult.error),
      };
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });
  const { data: profile, isLoading, isError, error: profileError } = profileQuery;

  const [form, setForm] = useState({ full_name: "", username: "", phone: "", avatar_url: "" });
  const [pwd, setPwd] = useState({ next: "", confirm: "" });
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showNationalId, setShowNationalId] = useState(false);
  const [posPasscode, setPosPasscode] = useState("");
  const [posPasscodeConfirm, setPosPasscodeConfirm] = useState("");
  const posPasscodeMut = useMutation({
    mutationFn: () => {
      if (!tenantId) throw new Error("لا توجد مؤسسة نشطة.");
      if (!posPasscode) throw new Error("أدخل كلمة مرور نقطة البيع.");
      if (posPasscode !== posPasscodeConfirm) throw new Error("كلمتا المرور غير متطابقتين.");
      return setPosPasscodeFn({ data: { tenant_id: tenantId, passcode: posPasscode } });
    },
    onSuccess: () => {
      setPosPasscode("");
      setPosPasscodeConfirm("");
      if (user?.id && tenantId) {
        try { window.sessionStorage.removeItem(`pos-access-unlocked-v1:${tenantId}:${user.id}`); } catch { /* storage may be disabled */ }
      }
      void qc.invalidateQueries({ queryKey: ["pos-access-status", tenantId, user?.id] });
      toast.success("تم حفظ كلمة مرور نقطة البيع الخاصة بحسابك.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذر حفظ كلمة المرور."),
  });

  async function uploadAvatar(file?: File) {
    const avatarTenantId = profile?.tenant_id ?? tenantId;
    if (!file || !user?.id || !avatarTenantId) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (!allowed.includes(file.type)) { toast.error("صيغة الصورة غير مدعومة"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("الحجم الأقصى للصورة 5MB"); return; }
    setUploadingAvatar(true);
    try {
      const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" } as Record<string, string>)[file.type];
      const path = `${avatarTenantId}/profiles/${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("restaurant-private-assets").upload(path, file, { upsert: false, contentType: file.type, cacheControl: "3600" });
      if (error) throw error;
      const { data, error: signedError } = await supabase.storage.from("restaurant-private-assets").createSignedUrl(path, 60 * 60 * 24);
      if (signedError) throw signedError;
      setForm((current) => ({ ...current, avatar_url: `private://${path}` }));
      setAvatarPreviewUrl(data.signedUrl);
      toast.success("تم رفع الصورة بشكل خاص. احفظ التغييرات لتثبيتها في ملفك.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر رفع الصورة");
    } finally { setUploadingAvatar(false); }
  }

  useEffect(() => {
    let cancelled = false;
    if (profile) {
      setForm({
        full_name: profile.full_name ?? "",
        username: profile.username ?? "",
        phone: profile.phone ?? "",
        avatar_url: profile.avatar_url ?? "",
      });
      void resolveAvatarUrl(profile.avatar_url).then((url) => {
        if (!cancelled) setAvatarPreviewUrl(url);
      }).catch(() => {
        if (!cancelled) setAvatarPreviewUrl(null);
      });
    } else {
      setAvatarPreviewUrl(null);
    }
    return () => { cancelled = true; };
  }, [profile]);

  const saveMut = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          full_name: form.full_name.trim() || undefined,
          username: form.username.trim() || null,
          phone: form.phone.trim() || null,
          avatar_url: form.avatar_url.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("تم حفظ الملف الشخصي");
      qc.invalidateQueries({ queryKey: ["my-profile", user?.id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل الحفظ"),
  });

  const pwdMut = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("لا يوجد مستخدم");
      if (pwd.next !== pwd.confirm) throw new Error("كلمتا المرور غير متطابقتين");
      if (pwd.next.length < 8) throw new Error("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
      return pwdFn({ data: { user_id: user.id, new_password: pwd.next } });
    },
    onSuccess: () => {
      toast.success("تم تغيير كلمة المرور");
      setPwd({ next: "", confirm: "" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل التغيير"),
  });

  if (isError) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <PageHeader title="ملفي الشخصي" subtitle="تعذر تحميل بيانات الحساب." />
        <Card><CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <p role="alert" className="text-sm text-destructive">{profileError instanceof Error ? profileError.message : "حدث خطأ أثناء تحميل الملف الشخصي."}</p>
          <Button variant="outline" onClick={() => void profileQuery.refetch()}>إعادة المحاولة</Button>
        </CardContent></Card>
      </div>
    );
  }

  if (isLoading || !profile) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const initial = (form.full_name || user?.email || "?").charAt(0).toUpperCase();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="ملفي الشخصي" subtitle="عدّل بياناتك الشخصية وكلمة المرور." />

      <Card>
        <CardHeader>
          <CardTitle>البيانات الشخصية</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar className="h-20 w-20">
              {avatarPreviewUrl && <AvatarImage src={avatarPreviewUrl} alt={form.full_name} />}
              <AvatarFallback className="text-2xl">{initial}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 space-y-2">
              <Label>الصورة الشخصية</Label>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
                {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploadingAvatar ? "جارٍ رفع الصورة..." : "رفع صورة من الجهاز"}
                <input className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={uploadingAvatar || !tenantId} onChange={(e) => { void uploadAvatar(e.target.files?.[0]); e.currentTarget.value = ""; }} />
              </label>
              <Input dir="ltr" placeholder="أو الصق رابط الصورة https://..." value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} />
              <p className="text-xs text-muted-foreground">JPG أو PNG أو WEBP أو AVIF — بحد أقصى 5MB.</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>الاسم الكامل</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div>
              <Label>اسم المستخدم</Label>
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>
            <div>
              <Label>الهاتف</Label>
              <Input
                dir="ltr"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <Label>البريد الإلكتروني</Label>
              <Input dir="ltr" value={user?.email ?? ""} disabled />
            </div>
          </div>

          {profile?.last_login_at && (
            <p className="text-xs text-muted-foreground">
              آخر تسجيل دخول: {new Date(profile.last_login_at).toLocaleString("ar-EG")}
            </p>
          )}

          <div className="flex justify-end">
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="ml-2 h-4 w-4" />
              )}
              حفظ التغييرات
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5 text-primary" /> بيانات العمل والنطاق</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ProfileInfo label="الرقم الوظيفي" value={profile.employee_no} />
          <ProfileInfo label="المسمى الوظيفي" value={profile.job_title} />
          <ProfileInfo label="القسم" value={profile.department_name} />
          <ProfileInfo label="الشركة" value={profile.company_name ?? (profile.company_id ? "غير متاح ضمن الصلاحيات" : "نطاق الشركة العام")} />
          <ProfileInfo label="الفرع" value={profile.branch_name ?? (profile.branch_id ? "غير متاح ضمن الصلاحيات" : "حسب نطاق الصلاحيات")} />
          <ProfileInfo label="تاريخ التوظيف" value={formatProfileDate(profile.employment_date, true)} />
          <div className="rounded-lg border p-3">
            <div className="mb-1 text-xs text-muted-foreground">رقم الهوية الوطنية</div>
            <div className="flex items-center justify-between gap-2">
              <span dir="ltr" className="font-medium">{profile.national_id ? (showNationalId ? profile.national_id : `••••••${profile.national_id.slice(-4)}`) : "غير مسجل"}</span>
              {profile.national_id && <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={showNationalId ? "إخفاء رقم الهوية" : "إظهار رقم الهوية"} onClick={() => setShowNationalId((value) => !value)}>{showNationalId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>}
            </div>
          </div>
          <ProfileInfo label="حالة الحساب" value={accountStatusLabel(profile.status)} />
          <ProfileInfo label="حالة التفعيل" value={profile.is_active ? "مفعّل" : "غير مفعّل"} />
        </CardContent>
        {profile.assignment_lookup_incomplete && <p className="px-6 pb-4 text-xs text-amber-700">تعذر تحميل اسم أحد عناصر النطاق؛ لا يؤثر ذلك في بيانات الحساب أو صلاحياته.</p>}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> معلومات الحساب والأمان</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ProfileInfo label="البريد الإلكتروني" value={user?.email ?? profile.email} direction="ltr" />
          <ProfileInfo label="تاريخ إنشاء الحساب" value={formatProfileDate(profile.created_at)} />
          <ProfileInfo label="آخر تسجيل دخول" value={formatProfileDate(profile.last_login_at)} />
          <ProfileInfo label="آخر جهاز مسجل" value={profile.last_device} />
          <ProfileInfo label="آخر عنوان IP" value={profile.last_ip} direction="ltr" />
          <ProfileInfo label="آخر تغيير لكلمة المرور" value={formatProfileDate(profile.password_changed_at)} />
          <ProfileInfo label="اعتماد الحساب" value={formatProfileDate(profile.approved_at)} />
          <ProfileInfo label="تغيير كلمة المرور مطلوب" value={profile.must_change_password ? "نعم — يلزم التغيير" : "لا"} />
        </CardContent>
      </Card>

      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /> كلمة مرور نقطة البيع</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            كلمة مرور مستقلة وخاصة بحسابك. تظهر نافذة التحقق فقط عندما تختار فتح نقطة البيع، وليس عند مجرد عرض تبويبها. ويمكنك استخدام أي كلمة مرور تختارها حتى 128 حرفاً.
          </p>
          {posAccessQuery.isLoading ? <p className="text-sm text-muted-foreground">جارٍ التحقق من إعداد كلمة المرور...</p> :
            posAccessQuery.isError ? <div role="alert" className="space-y-2 text-sm text-destructive">
              <p>تعذر التحقق من إعداد كلمة مرور نقطة البيع.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void posAccessQuery.refetch()}>إعادة المحاولة</Button>
            </div> :
            <p className="text-sm font-semibold">{posAccessQuery.data?.configured ? "تم إعداد كلمة مرور نقطة البيع لهذا الحساب." : "لم يتم إعداد كلمة مرور نقطة البيع بعد."}</p>}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="profile-pos-passcode">كلمة مرور نقطة البيع الجديدة</Label>
              <Input id="profile-pos-passcode" type="password" autoComplete="new-password" maxLength={128}
                value={posPasscode} onChange={(event) => setPosPasscode(event.target.value)} placeholder="اختر كلمة المرور التي تناسبك" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="profile-pos-passcode-confirm">تأكيد كلمة المرور</Label>
              <Input id="profile-pos-passcode-confirm" type="password" autoComplete="new-password" minLength={8} maxLength={128}
                value={posPasscodeConfirm} onChange={(event) => setPosPasscodeConfirm(event.target.value)} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={() => posPasscodeMut.mutate()}
              disabled={posPasscodeMut.isPending || !posPasscode || posPasscode !== posPasscodeConfirm}>
              {posPasscodeMut.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
              {posAccessQuery.data?.configured ? "تغيير كلمة مرور نقطة البيع" : "إنشاء كلمة مرور نقطة البيع"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">لا تُحفظ كلمة المرور كنص مكشوف؛ تُشتق لها بصمة تشفيرية على الخادم، مع تقييد المحاولات الخاطئة.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>تغيير كلمة المرور</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>كلمة المرور الجديدة</Label>
              <Input
                type="password"
                value={pwd.next}
                onChange={(e) => setPwd({ ...pwd, next: e.target.value })}
              />
            </div>
            <div>
              <Label>تأكيد كلمة المرور</Label>
              <Input
                type="password"
                value={pwd.confirm}
                onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => pwdMut.mutate()}
              disabled={pwdMut.isPending || !pwd.next}
              variant="secondary"
            >
              {pwdMut.isPending ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="ml-2 h-4 w-4" />
              )}
              تغيير كلمة المرور
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
