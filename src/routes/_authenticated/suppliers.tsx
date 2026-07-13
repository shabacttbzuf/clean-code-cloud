import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, Truck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { ImageUploader } from "@/components/image-uploader";

export const Route = createFileRoute("/_authenticated/suppliers")({
  component: SuppliersPage,
});

type Supplier = {
  id: string; tenant_id: string; name: string;
  phone: string | null; email: string | null; address: string | null;
  notes: string | null; is_active: boolean; logo_url: string | null;
};

const schema = z.object({
  name: z.string().trim().min(2, "الاسم قصير").max(100),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email("بريد غير صالح").max(120).optional().or(z.literal("")),
  address: z.string().trim().max(255).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  logo_url: z.string().url().nullable().optional(),
});

function SuppliersPage() {
  const { tenantId, isAdmin } = useActiveTenant();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);

  const q = useQuery({
    queryKey: ["suppliers", tenantId],
    queryFn: async (): Promise<Supplier[]> => {
      const { data, error } = await supabase.from("suppliers").select("*").eq("tenant_id", tenantId!).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Supplier[];
    },
    enabled: !!tenantId,
  });

  const upsert = useMutation({
    mutationFn: async (v: z.infer<typeof schema>) => {
      const payload = {
        ...v,
        phone: v.phone || null, email: v.email || null,
        address: v.address || null, notes: v.notes || null,
        logo_url: v.logo_url ?? null,
        tenant_id: tenantId!,
      };
      if (editing) {
        const { error } = await supabase.from("suppliers").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("suppliers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("تم الحفظ");
      setOpen(false); setEditing(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["suppliers"] }); toast.success("تم الحذف"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل الحذف"),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="الموردون" subtitle="قائمة الموردين لفواتير الشراء"
        action={isAdmin && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild><Button><Plus className="ml-2 h-4 w-4" />مورد جديد</Button></DialogTrigger>
            <SupplierDialog initial={editing} tenantId={tenantId!} onSubmit={(v) => upsert.mutate(v)} pending={upsert.isPending} />
          </Dialog>
        )}
      />

      {q.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !q.data || q.data.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Truck className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">لا يوجد موردون</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {q.data.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-4">
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {s.logo_url ? (
                      <img src={s.logo_url} alt={s.name} className="h-10 w-10 rounded-lg object-cover" />
                    ) : (
                      <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent/20 text-accent-foreground"><Truck className="h-5 w-5" /></div>
                    )}
                    <div>
                      <div className="font-semibold">{s.name}</div>
                      {s.phone && <div className="text-xs text-muted-foreground" dir="ltr">{s.phone}</div>}
                    </div>
                  </div>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  {s.email && <div dir="ltr">✉ {s.email}</div>}
                  {s.address && <div>📍 {s.address}</div>}
                </div>
                {isAdmin && (
                  <div className="mt-3 flex gap-1 border-t pt-3">
                    <Button size="sm" variant="ghost" className="flex-1" onClick={() => { setEditing(s); setOpen(true); }}>
                      <Edit className="ml-2 h-3 w-3" />تعديل
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm(`حذف "${s.name}"؟`)) del.mutate(s.id); }}>
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

function SupplierDialog({ initial, tenantId, onSubmit, pending }: {
  initial: Supplier | null; tenantId: string; onSubmit: (v: z.infer<typeof schema>) => void; pending: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [logoUrl, setLogoUrl] = useState<string | null>(initial?.logo_url ?? null);

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{initial ? "تعديل مورد" : "مورد جديد"}</DialogTitle></DialogHeader>
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        try { onSubmit(schema.parse({ name, phone, email, address, notes, logo_url: logoUrl })); }
        catch (err) { if (err instanceof z.ZodError) toast.error(err.issues[0].message); }
      }}>
        <ImageUploader tenantId={tenantId} folder="suppliers" value={logoUrl} onChange={setLogoUrl} label="الشعار" />
        <div className="space-y-2"><Label>الاسم</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label>الهاتف</Label><Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="space-y-2"><Label>البريد</Label><Input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        </div>
        <div className="space-y-2"><Label>العنوان</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        <div className="space-y-2"><Label>ملاحظات</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
