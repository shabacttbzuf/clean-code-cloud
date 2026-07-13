import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit, Trash2, Building2, Loader2, Clock, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { ImageUploader } from "@/components/image-uploader";

export const Route = createFileRoute("/_authenticated/branches")({
  component: BranchesPage,
});

type Branch = {
  id: string;
  tenant_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  tax_number: string | null;
  currency: string;
  logo_url: string | null;
  image_url: string | null;
  description: string | null;
  working_hours: { open?: string; close?: string } | null;
  manager_id: string | null;
  is_active: boolean;
};

type ProfileLite = { id: string; full_name: string | null };

const schema = z.object({
  name: z.string().trim().min(2, "الاسم قصير").max(100),
  address: z.string().trim().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  tax_number: z.string().trim().max(50).optional().or(z.literal("")),
  currency: z.string().trim().min(1).max(5),
  is_active: z.boolean(),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  image_url: z.string().url().nullable().optional(),
  manager_id: z.string().uuid().nullable(),
  open_time: z.string().max(10).optional().or(z.literal("")),
  close_time: z.string().max(10).optional().or(z.literal("")),
});

function BranchesPage() {
  const { tenantId, isAdmin } = useActiveTenant();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);

  const { data: branches, isLoading } = useQuery({
    queryKey: ["branches", tenantId],
    queryFn: async (): Promise<Branch[]> => {
      const { data, error } = await supabase
        .from("branches")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Branch[];
    },
    enabled: !!tenantId,
  });

  const managers = useQuery({
    queryKey: ["tenant-profiles", tenantId],
    queryFn: async (): Promise<ProfileLite[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as ProfileLite[];
    },
    enabled: !!tenantId && isAdmin,
  });
  const managerMap = new Map((managers.data ?? []).map((p) => [p.id, p.full_name ?? "—"]));

  const upsert = useMutation({
    mutationFn: async (input: z.infer<typeof schema>) => {
      const { open_time, close_time, ...rest } = input;
      const working_hours = open_time || close_time ? { open: open_time || null, close: close_time || null } : null;
      const payload = {
        ...rest,
        address: rest.address || null,
        phone: rest.phone || null,
        tax_number: rest.tax_number || null,
        description: rest.description || null,
        image_url: rest.image_url ?? null,
        manager_id: rest.manager_id,
        working_hours,
        tenant_id: tenantId!,
      };
      if (editing) {
        const { error } = await supabase.from("branches").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("branches").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches", tenantId] });
      toast.success(editing ? "تم التعديل" : "تم إنشاء الفرع");
      setOpen(false);
      setEditing(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشلت العملية"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("branches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches", tenantId] });
      toast.success("تم الحذف");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل الحذف"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="الفروع"
        subtitle="أدر فروع مطعمك — كل فرع لديه إعدادات وعملة ورقم ضريبي مستقلين."
        action={
          isAdmin && (
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
              <DialogTrigger asChild>
                <Button><Plus className="ml-2 h-4 w-4" />إضافة فرع</Button>
              </DialogTrigger>
              <BranchDialog
                initial={editing}
                tenantId={tenantId!}
                managers={managers.data ?? []}
                onSubmit={(v) => upsert.mutate(v)}
                pending={upsert.isPending}
              />
            </Dialog>
          )
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !branches || branches.length === 0 ? (
        <EmptyState onAdd={isAdmin ? () => setOpen(true) : undefined} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {branches.map((b) => (
            <Card key={b.id} className="overflow-hidden">
              {b.image_url && (
                <div className="aspect-video w-full overflow-hidden bg-muted">
                  <img src={b.image_url} alt={b.name} className="h-full w-full object-cover" />
                </div>
              )}
              <CardContent className="p-5">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-semibold">{b.name}</div>
                      <div className="text-xs text-muted-foreground">{b.currency}</div>
                    </div>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      b.is_active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {b.is_active ? "نشط" : "متوقف"}
                  </span>
                </div>
                {b.description && <p className="mb-2 text-sm text-muted-foreground line-clamp-2">{b.description}</p>}
                <div className="space-y-1 text-sm text-muted-foreground">
                  {b.address && <div>📍 {b.address}</div>}
                  {b.phone && <div dir="ltr">📞 {b.phone}</div>}
                  {b.tax_number && <div>الرقم الضريبي: <span dir="ltr">{b.tax_number}</span></div>}
                  {b.working_hours && (b.working_hours.open || b.working_hours.close) && (
                    <div className="flex items-center gap-1"><Clock className="h-3 w-3" /><span dir="ltr">{b.working_hours.open ?? "—"} - {b.working_hours.close ?? "—"}</span></div>
                  )}
                  {b.manager_id && (
                    <div className="flex items-center gap-1"><UserIcon className="h-3 w-3" />{managerMap.get(b.manager_id) ?? "—"}</div>
                  )}
                </div>
                {isAdmin && (
                  <div className="mt-4 flex gap-2 border-t pt-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1"
                      onClick={() => { setEditing(b); setOpen(true); }}
                    >
                      <Edit className="ml-2 h-3 w-3" />تعديل
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`حذف الفرع "${b.name}"؟`)) del.mutate(b.id);
                      }}
                    >
                      <Trash2 className="ml-2 h-3 w-3" />حذف
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

function EmptyState({ onAdd }: { onAdd?: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <Building2 className="h-10 w-10 text-muted-foreground/50" />
        <p className="text-muted-foreground">لا توجد فروع بعد</p>
        {onAdd && <Button onClick={onAdd}><Plus className="ml-2 h-4 w-4" />أنشئ الفرع الأول</Button>}
      </CardContent>
    </Card>
  );
}

function BranchDialog({
  initial,
  tenantId,
  managers,
  onSubmit,
  pending,
}: {
  initial: Branch | null;
  tenantId: string;
  managers: ProfileLite[];
  onSubmit: (v: z.infer<typeof schema>) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [tax, setTax] = useState(initial?.tax_number ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "SAR");
  const [active, setActive] = useState(initial?.is_active ?? true);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.image_url ?? null);
  const [managerId, setManagerId] = useState<string>(initial?.manager_id ?? "none");
  const [openTime, setOpenTime] = useState(initial?.working_hours?.open ?? "");
  const [closeTime, setCloseTime] = useState(initial?.working_hours?.close ?? "");

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{initial ? "تعديل فرع" : "إضافة فرع جديد"}</DialogTitle>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const parsed = schema.parse({
              name,
              address,
              phone,
              tax_number: tax,
              currency,
              is_active: active,
              description,
              image_url: imageUrl,
              manager_id: managerId === "none" ? null : managerId,
              open_time: openTime,
              close_time: closeTime,
            });
            onSubmit(parsed);
          } catch (err) {
            if (err instanceof z.ZodError) toast.error(err.issues[0].message);
          }
        }}
        className="space-y-4"
      >
        <ImageUploader tenantId={tenantId} folder="branches" value={imageUrl} onChange={setImageUrl} aspect="wide" />
        <div className="space-y-2">
          <Label htmlFor="b-name">اسم الفرع</Label>
          <Input id="b-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="b-desc">وصف قصير</Label>
          <Textarea id="b-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="b-address">العنوان</Label>
          <Input id="b-address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="b-phone">الهاتف</Label>
            <Input id="b-phone" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="b-currency">العملة</Label>
            <Input id="b-currency" dir="ltr" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={5} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="b-tax">الرقم الضريبي</Label>
          <Input id="b-tax" dir="ltr" value={tax} onChange={(e) => setTax(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="b-open">وقت الفتح</Label>
            <Input id="b-open" type="time" dir="ltr" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="b-close">وقت الإغلاق</Label>
            <Input id="b-close" type="time" dir="ltr" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>مدير الفرع</Label>
          <Select value={managerId} onValueChange={setManagerId}>
            <SelectTrigger><SelectValue placeholder="بدون مدير" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">بدون مدير</SelectItem>
              {managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name ?? "—"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <Label htmlFor="b-active">الفرع نشط</Label>
          <Switch id="b-active" checked={active} onCheckedChange={setActive} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            {initial ? "حفظ التعديلات" : "إضافة"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
