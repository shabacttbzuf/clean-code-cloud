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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Edit, Archive, RotateCcw, Truck, Loader2, AlertCircle, Wallet, History } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { ImageUploader } from "@/components/image-uploader";
import { formatMoney, formatDateTime } from "@/lib/format";

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
  const { tenantId, userId, isAdmin, membership, tenant } = useActiveTenant();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [paymentSupplier, setPaymentSupplier] = useState<Supplier | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentBranchId, setPaymentBranchId] = useState(membership?.branch_id ?? "");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const q = useQuery({
    queryKey: ["suppliers", tenantId],
    queryFn: async (): Promise<Supplier[]> => {
      const rows: Supplier[] = [];
      const pageSize = 500;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase.from("suppliers").select("*")
          .eq("tenant_id", tenantId!)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const page = (data ?? []) as Supplier[];
        rows.push(...page);
        if (page.length < pageSize) return rows;
      }
    },
    enabled: !!tenantId,
  });

  const branches = useQuery({
    queryKey: ["supplier-payment-branches", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("id, name, is_active")
        .eq("tenant_id", tenantId!).eq("is_active", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId && isAdmin,
  });

  const ledger = useQuery({
    queryKey: ["supplier-ledger", tenantId],
    queryFn: async () => {
      const page = async <T,>(base: any): Promise<T[]> => {
        const all: T[] = [];
        for (let from = 0; ; from += 500) {
          const { data, error } = await base.range(from, from + 499);
          if (error) throw error;
          const rows = (data ?? []) as T[];
          all.push(...rows);
          if (rows.length < 500) return all;
        }
      };
      const [purchases, returns, payments] = await Promise.all([
        page<{ id: string; supplier_id: string | null; total: number }>(supabase.from("purchases").select("id, supplier_id, total").eq("tenant_id", tenantId!).eq("status", "received").order("created_at").order("id")),
        page<{ purchase_id: string; total: number }>(supabase.from("purchase_returns").select("purchase_id, total").eq("tenant_id", tenantId!).order("created_at").order("id")),
        page<{ id: string; supplier_id: string; amount: number; payment_method: string; reference: string | null; paid_at: string; branch_id: string }>(supabase.from("supplier_payments").select("id, supplier_id, amount, payment_method, reference, paid_at, branch_id").eq("tenant_id", tenantId!).order("paid_at", { ascending: false }).order("id", { ascending: false })),
      ]);
      const purchaseSupplier = new Map(purchases.filter((p) => p.supplier_id).map((p) => [p.id, p.supplier_id!]));
      const totals = new Map<string, { purchases: number; returns: number; paid: number }>();
      const get = (id: string) => {
        const value = totals.get(id) ?? { purchases: 0, returns: 0, paid: 0 };
        totals.set(id, value);
        return value;
      };
      for (const purchase of purchases) if (purchase.supplier_id) get(purchase.supplier_id).purchases += Number(purchase.total);
      for (const ret of returns) {
        const supplierId = purchaseSupplier.get(ret.purchase_id);
        if (supplierId) get(supplierId).returns += Number(ret.total);
      }
      for (const payment of payments) get(payment.supplier_id).paid += Number(payment.amount);
      return { totals, payments };
    },
    enabled: !!tenantId,
  });

  const addPayment = useMutation({
    mutationFn: async () => {
      const amount = Number(paymentAmount);
      if (!paymentSupplier || !tenantId || !userId || !paymentBranchId || !Number.isFinite(amount) || amount <= 0) {
        throw new Error("أدخل مبلغاً صحيحاً وحدد الفرع");
      }
      const { error } = await supabase.from("supplier_payments").insert({
        tenant_id: tenantId, branch_id: paymentBranchId, supplier_id: paymentSupplier.id,
        amount, payment_method: paymentMethod, reference: paymentReference.trim() || null,
        notes: paymentNotes.trim() || null, created_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier-ledger", tenantId] });
      toast.success("تم تسجيل دفعة المورد وحفظها في كشف الحساب");
      setPaymentSupplier(null); setPaymentAmount(""); setPaymentReference(""); setPaymentNotes("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر تسجيل الدفعة"),
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

  // Suppliers may be referenced by historical purchase invoices; archive instead of deleting.
  const setActive = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from("suppliers").update({ is_active: isActive }).eq("id", id).eq("tenant_id", tenantId!);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["suppliers", tenantId] });
      qc.invalidateQueries({ queryKey: ["purchases", tenantId] });
      toast.success(variables.isActive ? "تمت إعادة تفعيل المورد" : "تم إيقاف المورد مع الاحتفاظ بسجلاته");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذر تغيير حالة المورد"),
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
      ) : q.isError ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">تعذر تحميل قائمة الموردين. لم يتم اعتبار فشل الاتصال قائمة فارغة.</p>
          <Button variant="outline" onClick={() => q.refetch()}>إعادة المحاولة</Button>
        </CardContent></Card>
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
                      <div className={s.is_active ? "text-xs text-emerald-600" : "text-xs text-muted-foreground"}>{s.is_active ? "مورد نشط" : "مورد موقوف"}</div>
                      {s.phone && <div className="text-xs text-muted-foreground" dir="ltr">{s.phone}</div>}
                    </div>
                  </div>
                </div>
                {ledger.isLoading ? <div className="mt-3 text-xs text-muted-foreground">جارٍ حساب الرصيد...</div> : ledger.isError ? <div className="mt-3 text-xs text-destructive">تعذر تحميل كشف الحساب</div> : (() => {
                  const totals = ledger.data?.totals.get(s.id) ?? { purchases: 0, returns: 0, paid: 0 };
                  const balance = totals.purchases - totals.returns - totals.paid;
                  return <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
                    <div className="flex justify-between"><span>صافي المشتريات</span><strong>{formatMoney(totals.purchases - totals.returns, tenant?.currency)}</strong></div>
                    <div className="flex justify-between"><span>المدفوع</span><strong>{formatMoney(totals.paid, tenant?.currency)}</strong></div>
                    <div className="flex justify-between border-t pt-1 font-bold"><span>{balance >= 0 ? "المتبقي للمورد" : "رصيد دائن للمطعم"}</span><strong className={balance > 0 ? "text-destructive" : "text-emerald-600"}>{formatMoney(Math.abs(balance), tenant?.currency)}</strong></div>
                  </div>;
                })()}
                <div className="space-y-1 text-sm text-muted-foreground">
                  {s.email && <div dir="ltr">✉ {s.email}</div>}
                  {s.address && <div>📍 {s.address}</div>}
                </div>
                {isAdmin && (
                  <div className="mt-3 flex flex-wrap gap-1 border-t pt-3">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => { setPaymentSupplier(s); setPaymentBranchId(membership?.branch_id ?? branches.data?.[0]?.id ?? ""); }} disabled={!branches.data?.length || branches.isLoading}>
                      <Wallet className="ml-2 h-3 w-3" />تسجيل دفعة
                    </Button>
                    <Button size="sm" variant="ghost" className="flex-1" onClick={() => { setEditing(s); setOpen(true); }}>
                      <Edit className="ml-2 h-3 w-3" />تعديل
                    </Button>
                    <Button size="sm" variant="ghost" className={s.is_active ? "text-amber-600" : "text-emerald-600"} disabled={setActive.isPending} onClick={() => {
                      const action = s.is_active ? "إيقاف" : "إعادة تفعيل";
                      if (confirm(`${action} المورد "${s.name}"؟ ستبقى جميع فواتيره وسجلاته محفوظة.`)) {
                        setActive.mutate({ id: s.id, isActive: !s.is_active });
                      }
                    }}>
                      {s.is_active ? <Archive className="h-3 w-3" /> : <RotateCcw className="h-3 w-3" />}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!paymentSupplier} onOpenChange={(value) => { if (!value) setPaymentSupplier(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto overscroll-contain">
          <DialogHeader><DialogTitle>تسجيل دفعة للمورد {paymentSupplier?.name}</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); addPayment.mutate(); }}>
            <div className="space-y-2"><Label>الفرع</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={paymentBranchId} onChange={(e) => setPaymentBranchId(e.target.value)} required>
              <option value="">اختر الفرع</option>{(branches.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></div>
            <div className="space-y-2"><Label>المبلغ</Label><Input type="number" inputMode="decimal" min="0.01" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} required /></div>
            <div className="space-y-2"><Label>طريقة الدفع</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="cash">نقداً</option><option value="card">بطاقة</option><option value="transfer">تحويل بنكي</option><option value="cheque">شيك</option><option value="other">أخرى</option>
            </select></div>
            <div className="space-y-2"><Label>رقم المرجع (اختياري)</Label><Input maxLength={120} value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} /></div>
            <div className="space-y-2"><Label>ملاحظات</Label><Textarea maxLength={1000} rows={2} value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} /></div>
            <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-muted-foreground">يُسجل هذا القيد في كشف المورد فقط، ولا يغيّر رصيد درج النقد أو وردية الصندوق تلقائياً.</p>
            <DialogFooter><Button type="submit" disabled={addPayment.isPending || !paymentBranchId}>{addPayment.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}حفظ الدفعة</Button></DialogFooter>
          </form>
          <div className="border-t pt-3"><div className="mb-2 flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" />آخر الدفعات المسجلة</div>
            {ledger.data?.payments.filter((p) => p.supplier_id === paymentSupplier?.id).slice(0, 8).map((p) => <div key={p.id} className="flex justify-between border-b py-2 text-xs"><span>{formatDateTime(p.paid_at)} · {p.payment_method === "cash" ? "نقداً" : p.payment_method === "transfer" ? "تحويل" : p.payment_method === "card" ? "بطاقة" : p.payment_method === "cheque" ? "شيك" : "أخرى"}</span><strong>{formatMoney(p.amount, tenant?.currency)}</strong></div>)}
            {!ledger.data?.payments.some((p) => p.supplier_id === paymentSupplier?.id) && <p className="text-xs text-muted-foreground">لا توجد دفعات مسجلة لهذا المورد.</p>}
          </div>
        </DialogContent>
      </Dialog>
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
