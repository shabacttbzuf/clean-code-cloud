import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, Users, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { ImageUploader } from "@/components/image-uploader";

export const Route = createFileRoute("/_authenticated/customers")({
  component: CustomersPage,
});

type Customer = {
  id: string; tenant_id: string; name: string;
  phone: string | null; email: string | null;
  avatar_url: string | null; address: string | null;
  notes: string | null; is_active: boolean;
};

const schema = z.object({
  name: z.string().trim().min(2, "الاسم قصير").max(100),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email("بريد غير صالح").max(120).optional().or(z.literal("")),
  address: z.string().trim().max(255).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  avatar_url: z.string().url().nullable().optional(),
  is_active: z.boolean(),
});

function CustomersPage() {
  const { tenantId, isAdmin } = useActiveTenant();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["customers", tenantId],
    queryFn: async (): Promise<Customer[]> => {
      const { data, error } = await supabase.from("customers").select("*").eq("tenant_id", tenantId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Customer[];
    },
    enabled: !!tenantId,
  });

  const filtered = useMemo(() => {
    const list = q.data ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter((c) =>
      c.name.toLowerCase().includes(s) ||
      (c.phone ?? "").toLowerCase().includes(s) ||
      (c.email ?? "").toLowerCase().includes(s)
    );
  }, [q.data, search]);

  const upsert = useMutation({
    mutationFn: async (v: z.infer<typeof schema>) => {
      const payload = {
        ...v,
        phone: v.phone || null, email: v.email || null,
        address: v.address || null, notes: v.notes || null,
        avatar_url: v.avatar_url ?? null,
        tenant_id: tenantId!,
      };
      if (editing) {
        const { error } = await supabase.from("customers").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers", tenantId] });
      toast.success("تم الحفظ");
      setOpen(false); setEditing(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers", tenantId] }); toast.success("تم الحذف"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل الحذف"),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="العملاء" subtitle="قاعدة بيانات العملاء الدائمين للفرع"
        action={isAdmin && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild><Button><Plus className="ml-2 h-4 w-4" />عميل جديد</Button></DialogTrigger>
            <CustomerDialog initial={editing} tenantId={tenantId!} onSubmit={(v) => upsert.mutate(v)} pending={upsert.isPending} />
          </Dialog>
        )}
      />

      <div className="relative">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="ابحث بالاسم أو الهاتف أو البريد..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
      </div>

      {q.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Users className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">{search ? "لا توجد نتائج" : "لا يوجد عملاء بعد"}</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4">
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {c.avatar_url ? (
                      <img src={c.avatar_url} alt={c.name} className="h-12 w-12 rounded-full object-cover" />
                    ) : (
                      <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary font-semibold">
                        {c.name.slice(0, 1)}
                      </div>
                    )}
                    <div>
                      <div className="font-semibold">{c.name}</div>
                      {c.phone && <div className="text-xs text-muted-foreground" dir="ltr">{c.phone}</div>}
                    </div>
                  </div>
                  {!c.is_active && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">متوقف</span>}
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  {c.email && <div dir="ltr">✉ {c.email}</div>}
                  {c.address && <div>📍 {c.address}</div>}
                  {c.notes && <div className="line-clamp-2 text-xs">📝 {c.notes}</div>}
                </div>
                {isAdmin && (
                  <div className="mt-3 flex gap-1 border-t pt-3">
                    <Button size="sm" variant="ghost" className="flex-1" onClick={() => { setEditing(c); setOpen(true); }}>
                      <Edit className="ml-2 h-3 w-3" />تعديل
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm(`حذف "${c.name}"؟`)) del.mutate(c.id); }}>
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

function CustomerDialog({ initial, tenantId, onSubmit, pending }: {
  initial: Customer | null; tenantId: string;
  onSubmit: (v: z.infer<typeof schema>) => void; pending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial?.avatar_url ?? null);
  const [active, setActive] = useState(initial?.is_active ?? true);

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{initial ? "تعديل عميل" : "عميل جديد"}</DialogTitle></DialogHeader>
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        try { onSubmit(schema.parse({ name, phone, email, address, notes, avatar_url: avatarUrl, is_active: active })); }
        catch (err) { if (err instanceof z.ZodError) toast.error(err.issues[0].message); }
      }}>
        <ImageUploader tenantId={tenantId} folder="customers" value={avatarUrl} onChange={setAvatarUrl} label="الصورة" />
        <div className="space-y-2"><Label>الاسم</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label>الهاتف</Label><Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="space-y-2"><Label>البريد</Label><Input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        </div>
        <div className="space-y-2"><Label>العنوان</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        <div className="space-y-2"><Label>ملاحظات</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <Label>العميل نشط</Label>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}