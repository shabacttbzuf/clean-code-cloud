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
import { Plus, Edit, Trash2, Loader2, Layers } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/expense-categories")({
  component: Page,
});

type Cat = { id: string; name: string; icon: string | null; color: string | null; sort_order: number };
const schema = z.object({ name: z.string().trim().min(2).max(60), icon: z.string().max(20).optional().or(z.literal("")), color: z.string().max(20).optional().or(z.literal("")) });

function Page() {
  const { tenantId, isAdmin } = useActiveTenant();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cat | null>(null);

  const q = useQuery({
    queryKey: ["expense-categories", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("expense_categories").select("*").eq("tenant_id", tenantId!).order("sort_order");
      if (error) throw error;
      return (data ?? []) as Cat[];
    },
    enabled: !!tenantId,
  });

  const upsert = useMutation({
    mutationFn: async (v: z.infer<typeof schema>) => {
      const payload = { name: v.name, icon: v.icon || null, color: v.color || null, tenant_id: tenantId! };
      if (editing) { const { error } = await supabase.from("expense_categories").update(payload).eq("id", editing.id); if (error) throw error; }
      else { const { error } = await supabase.from("expense_categories").insert(payload); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expense-categories"] }); toast.success("تم"); setOpen(false); setEditing(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("expense_categories").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expense-categories"] }); toast.success("تم الحذف"); },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="تصنيفات المصروفات" action={isAdmin && (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button><Plus className="ml-2 h-4 w-4" />جديد</Button></DialogTrigger>
          <CatDialog initial={editing} onSubmit={(v) => upsert.mutate(v)} pending={upsert.isPending} />
        </Dialog>
      )} />
      {q.isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      : !q.data || q.data.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Layers className="h-10 w-10 text-muted-foreground/50" /><p className="text-muted-foreground">لا توجد تصنيفات</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {q.data.map((c) => (
            <Card key={c.id}><CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent/20 text-lg">{c.icon ?? "💰"}</div>
                <div className="font-medium">{c.name}</div>
              </div>
              {isAdmin && (
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}><Edit className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => { if (confirm(`حذف "${c.name}"؟`)) del.mutate(c.id); }}><Trash2 className="h-3 w-3" /></Button>
                </div>
              )}
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CatDialog({ initial, onSubmit, pending }: { initial: Cat | null; onSubmit: (v: z.infer<typeof schema>) => void; pending: boolean }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "💰");
  const [color, setColor] = useState(initial?.color ?? "");
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{initial ? "تعديل" : "تصنيف جديد"}</DialogTitle></DialogHeader>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); try { onSubmit(schema.parse({ name, icon, color })); } catch (err) { if (err instanceof z.ZodError) toast.error(err.issues[0].message); } }}>
        <div className="space-y-2"><Label>الاسم</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label>الأيقونة</Label><Input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="💰" /></div>
          <div className="space-y-2"><Label>اللون (اختياري)</Label><Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#3b82f6" dir="ltr" /></div>
        </div>
        <DialogFooter><Button type="submit" disabled={pending}>{pending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
