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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Plus, DollarSign, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { formatMoney, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/expenses")({ component: Page });

type Expense = { id: string; amount: number; description: string | null; paid_at: string; category_id: string | null; branch_id: string | null };

function Page() {
  const { tenantId, userId, tenant, isAdmin } = useActiveTenant();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const cats = useQuery({
    queryKey: ["expense-categories-min", tenantId],
    queryFn: async () => { const { data } = await supabase.from("expense_categories").select("id, name, icon").eq("tenant_id", tenantId!); return (data ?? []) as Array<{ id: string; name: string; icon: string | null }>; },
    enabled: !!tenantId,
  });
  const branches = useQuery({
    queryKey: ["branches-exp", tenantId],
    queryFn: async () => { const { data } = await supabase.from("branches").select("id, name").eq("tenant_id", tenantId!); return (data ?? []) as Array<{ id: string; name: string }>; },
    enabled: !!tenantId,
  });
  const q = useQuery({
    queryKey: ["expenses", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("id, amount, description, paid_at, category_id, branch_id").eq("tenant_id", tenantId!).order("paid_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
    enabled: !!tenantId,
  });

  const catMap = useMemo(() => new Map((cats.data ?? []).map((c) => [c.id, c])), [cats.data]);
  const brMap = useMemo(() => new Map((branches.data ?? []).map((b) => [b.id, b.name])), [branches.data]);
  const total = (q.data ?? []).reduce((s, e) => s + Number(e.amount), 0);

  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string>("none");
  const [branchId, setBranchId] = useState<string>("none");
  const [description, setDescription] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));

  const create = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("مبلغ غير صالح");
      const { error } = await supabase.from("expenses").insert({
        tenant_id: tenantId!,
        user_id: userId!,
        amount: amt,
        category_id: categoryId === "none" ? null : categoryId,
        branch_id: branchId === "none" ? null : branchId,
        description: description || null,
        paid_at: paidAt,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("تم"); setOpen(false);
      setAmount(""); setDescription(""); setCategoryId("none"); setBranchId("none");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("expenses").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["expenses"] }); toast.success("تم الحذف"); },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="المصروفات" subtitle={`إجمالي ${formatMoney(total)} ${tenant?.currency ?? ""}`} action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="ml-2 h-4 w-4" />مصروف جديد</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>مصروف جديد</DialogTitle></DialogHeader>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>المبلغ</Label><Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
                <div className="space-y-2"><Label>التاريخ</Label><Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>التصنيف</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون</SelectItem>
                      {(cats.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.icon ?? "💰"} {c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>الفرع</Label>
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">عام</SelectItem>
                      {(branches.data ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2"><Label>الوصف</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
              <DialogFooter><Button type="submit" disabled={create.isPending}>{create.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      } />

      {q.isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      : !q.data || q.data.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <DollarSign className="h-10 w-10 text-muted-foreground/50" /><p className="text-muted-foreground">لا توجد مصروفات</p>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0"><div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-right"><tr>
              <th className="p-3 font-medium">التاريخ</th>
              <th className="p-3 font-medium">التصنيف</th>
              <th className="p-3 font-medium">الفرع</th>
              <th className="p-3 font-medium">الوصف</th>
              <th className="p-3 font-medium">المبلغ</th>
              <th className="p-3"></th>
            </tr></thead>
            <tbody>
              {q.data.map((e) => {
                const cat = e.category_id ? catMap.get(e.category_id) : null;
                return (
                  <tr key={e.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 text-muted-foreground">{formatDate(e.paid_at)}</td>
                    <td className="p-3">{cat ? `${cat.icon ?? "💰"} ${cat.name}` : "—"}</td>
                    <td className="p-3 text-muted-foreground">{e.branch_id ? (brMap.get(e.branch_id) ?? "—") : "عام"}</td>
                    <td className="p-3">{e.description ?? "—"}</td>
                    <td className="p-3 num font-bold text-destructive">{formatMoney(e.amount)}</td>
                    <td className="p-3">{isAdmin && (
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => { if (confirm("حذف؟")) del.mutate(e.id); }}><Trash2 className="h-3 w-3" /></Button>
                    )}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div></CardContent></Card>
      )}
    </div>
  );
}
