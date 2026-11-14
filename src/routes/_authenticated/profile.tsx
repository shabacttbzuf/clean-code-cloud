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
import { Loader2, Save, KeyRound, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { updateMyProfile, updateUserPassword } from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuthSession();
  const { tenantId } = useActiveTenant();
  const qc = useQueryClient();
  const updateFn = useServerFn(updateMyProfile);
  const pwdFn = useServerFn(updateUserPassword);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, username, phone, avatar_url, last_login_at, tenant_id, branch_id")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const [form, setForm] = useState({ full_name: "", username: "", phone: "", avatar_url: "" });
  const [pwd, setPwd] = useState({ next: "", confirm: "" });
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  async function uploadAvatar(file?: File) {
    if (!file || !user?.id || !tenantId) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (!allowed.includes(file.type)) { toast.error("صيغة الصورة غير مدعومة"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("الحجم الأقصى للصورة 5MB"); return; }
    setUploadingAvatar(true);
    try {
      const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" } as Record<string, string>)[file.type];
      const path = `${tenantId}/profiles/${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("restaurant-assets").upload(path, file, { upsert: false, contentType: file.type, cacheControl: "31536000" });
      if (error) throw error;
      const { data } = supabase.storage.from("restaurant-assets").getPublicUrl(path);
      setForm((current) => ({ ...current, avatar_url: data.publicUrl }));
      toast.success("تم رفع الصورة. احفظ التغييرات لتثبيتها في ملفك.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر رفع الصورة");
    } finally { setUploadingAvatar(false); }
  }

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name ?? "",
        username: profile.username ?? "",
        phone: profile.phone ?? "",
        avatar_url: profile.avatar_url ?? "",
      });
    }
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

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
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
              {form.avatar_url && <AvatarImage src={form.avatar_url} alt={form.full_name} />}
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
