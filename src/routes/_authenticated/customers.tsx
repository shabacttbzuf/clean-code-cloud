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
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/customers")({
  component: CustomersPage,
});

type Customer = {
  id: string; tenant_id: string; name: string;
  phone: string | null; email: string | null;
  avatar_url: string | null; address: string | null;
  notes: string | null; is_active: boolean; credit_limit: number;
};

const schema = z.object({
  name: z.string().trim().min(2, "الاسم قصير").max(100),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email("بريد غير صالح").max(120).optional().or(z.literal("")),
  address: z.string().trim().max(255).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  avatar_url: z.string().url().nullable().optional(),
  is_active: z.boolean(),
  credit_limit: z.number().finite().min(0).max(999999999999),
});

function CustomersPage() {
  const { tenantId, isAdmin } = useActiveTenant();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [search, setSearch] = useState("");
  const [accountCustomer, setAccountCustomer] = useState<Customer | null>(null);
  const balances = useQuery({
    queryKey: ["customer-account-balances", tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("customer_account_balances" as any) as any).select("*").eq("tenant_id", tenantId!);
      if (error) throw error;
      return (data ?? []) as Array<{ customer_id: string; invoice_count: number; invoiced_total: number; paid_total: number; refunded_total: number; outstanding_balance: number }>;
    },
    enabled: !!tenantId,
  });
  const balanceByCustomer = useMemo(() => new Map((balances.data ?? []).map((row) => [row.customer_id, row])), [balances.data]);

  const q = useQuery({
    queryKey: ["customers", tenantId],
    queryFn: async (): Promise<Customer[]> => {
      const { data, error } = await (supabase.from("customers" as any) as any).select("*").eq("tenant_id", tenantId!).order("created_at", { ascending: false });
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
        credit_limit: v.credit_limit,
        tenant_id: tenantId!,
      };
      if (editing) {
        const { error } = await (supabase.from("customers" as any) as any).update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("customers" as any) as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers", tenantId] });
      qc.invalidateQueries({ queryKey: ["customer-account-balances", tenantId] });
      toast.success("تم الحفظ");
      setOpen(false); setEditing(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("customers" as any) as any).update({ is_active: false }).eq("id", id).eq("tenant_id", tenantId!);
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
                  <div className="mt-2 grid grid-cols-2 gap-2 rounded-md bg-muted/40 p-2 text-xs">
                    <div><div className="text-muted-foreground">الرصيد المستحق</div><div className="font-bold text-destructive num">{formatMoney(Number(balanceByCustomer.get(c.id)?.outstanding_balance ?? 0))}</div></div>
                    <div><div className="text-muted-foreground">سقف المديونية</div><div className="font-bold num">{formatMoney(Number(c.credit_limit ?? 0))}</div></div>
                  </div>
                  <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => setAccountCustomer(c)}>الحساب والفواتير</Button>
                  {c.notes && <div className="line-clamp-2 text-xs">📝 {c.notes}</div>}
                </div>
                {isAdmin && (
                  <div className="mt-3 flex gap-1 border-t pt-3">
                    <Button size="sm" variant="ghost" className="flex-1" onClick={() => { setEditing(c); setOpen(true); }}>
                      <Edit className="ml-2 h-3 w-3" />تعديل
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm(`إيقاف العميل "${c.name}"؟ سيبقى سجل حسابه وفواتيره محفوظاً.`)) del.mutate(c.id); }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Dialog open={!!accountCustomer} onOpenChange={(value) => { if (!value) setAccountCustomer(null); }}>
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>حساب العميل: {accountCustomer?.name}</DialogTitle></DialogHeader>
          {accountCustomer && <CustomerAccount customer={accountCustomer} tenantId={tenantId!} />}
          <DialogFooter><Button variant="outline" onClick={() => setAccountCustomer(null)}>إغلاق</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CustomerAccount({ customer, tenantId }: { customer: Customer; tenantId: string }) {
  const accountSummary = useQuery({
    queryKey: ["customer-account-summary", tenantId, customer.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from("customer_account_balances" as any) as any).select("*").eq("tenant_id", tenantId).eq("customer_id", customer.id).maybeSingle();
      if (error) throw error;
      return data as { invoice_count: number; invoiced_total: number; paid_total: number; refunded_total: number; outstanding_balance: number } | null;
    },
  });
  const invoices = useQuery({
    queryKey: ["customer-invoices", tenantId, customer.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from("sales" as any) as any).select("id,invoice_no,created_at,total,status,branch_id").eq("tenant_id", tenantId).eq("customer_id", customer.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const [saleId, setSaleId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "card" | "transfer">("cash");
  const [reference, setReference] = useState("");
  const [cashSessionId, setCashSessionId] = useState("");
  const [pending, setPending] = useState(false);
  const selectedSale = invoices.data?.find((sale: any) => sale.id === saleId);
  const sessions = useQuery({
    queryKey: ["customer-open-cash-sessions", tenantId, selectedSale?.branch_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("cash_sessions").select("id,branch_id,cashier_id").eq("tenant_id", tenantId).eq("branch_id", selectedSale.branch_id).eq("status", "open");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedSale && method === "cash",
  });
  const payments = useQuery({
    queryKey: ["customer-invoice-payment-details", tenantId, saleId],
    queryFn: async () => {
      const [initial, later, refunds] = await Promise.all([
        (supabase.from("payments" as any) as any).select("amount").eq("sale_id", saleId),
        (supabase.from("customer_payments" as any) as any).select("amount").eq("sale_id", saleId),
        (supabase.from("sale_refunds" as any) as any).select("total").eq("sale_id", saleId),
      ]);
      if (initial.error) throw initial.error;
      if (later.error) throw later.error;
      if (refunds.error) throw refunds.error;
      const paid = [...(initial.data ?? []), ...(later.data ?? [])].reduce((sum: number, row: any) => sum + Number(row.amount), 0);
      const refunded = (refunds.data ?? []).reduce((sum: number, row: any) => sum + Number(row.total), 0);
      return Math.max(0, Number(selectedSale?.total ?? 0) - paid - refunded);
    },
    enabled: !!selectedSale,
  });
  const collect = async () => {
    if (!selectedSale || !Number.isFinite(Number(amount)) || Number(amount) <= 0) { toast.error("أدخل مبلغاً صحيحاً"); return; }
    if (method === "cash" && !cashSessionId) { toast.error("اختر وردية نقدية مفتوحة"); return; }
    setPending(true);
    try {
      const { error } = await (supabase.rpc as any)("record_customer_payment", {
        _tenant_id: tenantId, _sale_id: saleId, _amount: Number(amount), _method: method,
        _cash_session_id: method === "cash" ? cashSessionId : null,
        _reference: reference || null, _notes: null, _idempotency_key: crypto.randomUUID(),
      });
      if (error) throw error;
      toast.success("تم تسجيل التحصيل");
      setAmount(""); setReference("");
      await Promise.all([invoices.refetch(), payments.refetch()]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "تعذر تسجيل التحصيل"); }
    finally { setPending(false); }
  };
  return <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-3">
      <div><div className="text-muted-foreground">إجمالي الفواتير</div><b>{formatMoney(Number(accountSummary.data?.invoiced_total ?? 0))}</b></div>
      <div><div className="text-muted-foreground">إجمالي المدفوع</div><b className="text-success">{formatMoney(Number(accountSummary.data?.paid_total ?? 0))}</b></div>
      <div><div className="text-muted-foreground">الرصيد المستحق</div><b className="text-destructive">{formatMoney(Number(accountSummary.data?.outstanding_balance ?? 0))}</b></div>
      <div><div className="text-muted-foreground">سقف المديونية</div><b>{formatMoney(Number(customer.credit_limit))}</b></div>
      <div><div className="text-muted-foreground">عدد الفواتير</div><b>{invoices.data?.length ?? 0}</b></div>
      <div><div className="text-muted-foreground">المرتجعات</div><b>{formatMoney(Number(accountSummary.data?.refunded_total ?? 0))}</b></div>
    </div>
    <div className="space-y-2">
      <Label>الفاتورة المراد تحصيلها</Label>
      <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={saleId} onChange={(e) => { setSaleId(e.target.value); setAmount(""); }}>
        <option value="">اختر فاتورة</option>
        {(invoices.data ?? []).map((sale: any) => <option key={sale.id} value={sale.id}>#{sale.invoice_no} — {formatMoney(Number(sale.total))} — {sale.status}</option>)}
      </select>
      {selectedSale && <div className="rounded border p-2 text-sm">المتبقي حسب السجلات: <b className="text-destructive">{formatMoney(Number(payments.data ?? 0))}</b></div>}
      <div className="grid grid-cols-2 gap-2">
        <div><Label>مبلغ التحصيل</Label><Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><Label>طريقة الدفع</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}><option value="cash">نقدي</option><option value="transfer">محفظة / تحويل</option><option value="card">بطاقة</option></select></div>
      </div>
      {method === "cash" && <div><Label>الوردية النقدية المفتوحة</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={cashSessionId} onChange={(e) => setCashSessionId(e.target.value)}><option value="">اختر الوردية</option>{(sessions.data ?? []).map((session: any) => <option key={session.id} value={session.id}>وردية المستخدم {session.cashier_id.slice(0, 8)}</option>)}</select></div>}
      <div><Label>مرجع التحويل / ملاحظات</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
      <Button className="w-full" disabled={pending || !selectedSale || Number(payments.data ?? 0) <= 0} onClick={collect}>{pending ? "جارٍ التسجيل..." : "تسجيل التحصيل"}</Button>
    </div>
  </div>;
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
  const [creditLimit, setCreditLimit] = useState(String(initial?.credit_limit ?? 0));

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{initial ? "تعديل عميل" : "عميل جديد"}</DialogTitle></DialogHeader>
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        try { onSubmit(schema.parse({ name, phone, email, address, notes, avatar_url: avatarUrl, is_active: active, credit_limit: Number(creditLimit) })); }
        catch (err) { if (err instanceof z.ZodError) toast.error(err.issues[0].message); }
      }}>
        <ImageUploader tenantId={tenantId} folder="customers" value={avatarUrl} onChange={setAvatarUrl} label="الصورة" />
        <div className="space-y-2"><Label>الاسم</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label>الهاتف</Label><Input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="space-y-2"><Label>البريد</Label><Input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        </div>
        <div className="space-y-2"><Label>العنوان</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        <div className="space-y-2"><Label>سقف المديونية ({/* currency is displayed by account */}الحد الأقصى للبيع الآجل)</Label><Input type="number" min="0" step="0.01" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} required /><p className="text-xs text-muted-foreground">الصفر يعني منع البيع الآجل لهذا العميل.</p></div>
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