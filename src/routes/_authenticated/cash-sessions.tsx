import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Wallet, LockOpen, Lock } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { formatMoney, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/cash-sessions")({
  component: CashSessionsPage,
});

type Session = {
  id: string;
  branch_id: string;
  cashier_id: string;
  status: "open" | "closed";
  opening_balance: number;
  closing_balance: number | null;
  expected_cash: number | null;
  cash_difference: number | null;
  opened_at: string;
  closed_at: string | null;
};
type ProfileMap = Record<string, string>;
type BranchMap = Record<string, string>;

function CashSessionsPage() {
  const { tenantId, userId, isAdmin } = useActiveTenant();
  const qc = useQueryClient();
  const [closingId, setClosingId] = useState<Session | null>(null);
  const [closingCash, setClosingCash] = useState("0");

  const sessions = useQuery({
    queryKey: ["cash-sessions", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_sessions")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("opened_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const list = (data ?? []) as Session[];

      const userIds = Array.from(new Set(list.map((s) => s.cashier_id)));
      const branchIds = Array.from(new Set(list.map((s) => s.branch_id)));
      const [profRes, brRes] = await Promise.all([
        userIds.length > 0 ? supabase.from("profiles").select("id, full_name").in("id", userIds) : Promise.resolve({ data: [] }),
        branchIds.length > 0 ? supabase.from("branches").select("id, name").in("id", branchIds) : Promise.resolve({ data: [] }),
      ]);
      const profMap: ProfileMap = {};
      (profRes.data ?? []).forEach((p) => { profMap[(p as { id: string }).id] = (p as { full_name?: string }).full_name ?? "—"; });
      const brMap: BranchMap = {};
      (brRes.data ?? []).forEach((b) => { brMap[(b as { id: string }).id] = (b as { name: string }).name; });
      return { list, profMap, brMap };
    },
    enabled: !!tenantId,
  });

  // Preload expected cash when opening dialog
  const expectedCashQuery = useQuery({
    queryKey: ["session-expected-cash", closingId?.id],
    queryFn: async (): Promise<number> => {
      if (!closingId) return 0;
      const { data } = await supabase
        .from("sales")
        .select("total")
        .eq("session_id", closingId.id)
        .eq("payment_method", "cash");
      const salesCash = (data ?? []).reduce((s, r) => s + Number((r as { total: number }).total), 0);
      return Number(closingId.opening_balance) + salesCash;
    },
    enabled: !!closingId,
  });

  const closeSess = useMutation({
    mutationFn: async () => {
      if (!closingId) throw new Error("No session");
      const cb = Number(closingCash);
      const expected = expectedCashQuery.data ?? 0;
      const diff = +(cb - expected).toFixed(2);
      const { error } = await supabase
        .from("cash_sessions")
        .update({
          status: "closed",
          closing_balance: cb,
          expected_cash: expected,
          cash_difference: diff,
          closed_at: new Date().toISOString(),
        })
        .eq("id", closingId.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash-sessions"] });
      qc.invalidateQueries({ queryKey: ["open-session"] });
      toast.success("تم إغلاق الوردية");
      setClosingId(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "فشل الإغلاق"),
  });

  const list = sessions.data?.list ?? [];
  const profMap = sessions.data?.profMap ?? {};
  const brMap = sessions.data?.brMap ?? {};

  const stats = useMemo(() => {
    const open = list.filter((s) => s.status === "open").length;
    const closed = list.filter((s) => s.status === "closed").length;
    return { open, closed };
  }, [list]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="ورديات الصندوق"
        subtitle={`${stats.open} مفتوحة • ${stats.closed} مغلقة`}
      />

      {sessions.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : list.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Wallet className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-muted-foreground">لا توجد ورديات</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-right">
                  <tr>
                    <th className="p-3 font-medium">الحالة</th>
                    <th className="p-3 font-medium">الكاشير</th>
                    <th className="p-3 font-medium">الفرع</th>
                    <th className="p-3 font-medium">فُتحت</th>
                    <th className="p-3 font-medium">أُغلقت</th>
                    <th className="p-3 font-medium">رصيد البداية</th>
                    <th className="p-3 font-medium">النهاية</th>
                    <th className="p-3 font-medium">الفرق</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((s) => {
                    const canClose = s.status === "open" && (s.cashier_id === userId || isAdmin);
                    return (
                      <tr key={s.id} className="border-t hover:bg-muted/30">
                        <td className="p-3">
                          {s.status === "open" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
                              <LockOpen className="h-3 w-3" />مفتوحة
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                              <Lock className="h-3 w-3" />مغلقة
                            </span>
                          )}
                        </td>
                        <td className="p-3">{profMap[s.cashier_id] ?? "—"}</td>
                        <td className="p-3 text-muted-foreground">{brMap[s.branch_id] ?? "—"}</td>
                        <td className="p-3 text-xs text-muted-foreground">{formatDateTime(s.opened_at)}</td>
                        <td className="p-3 text-xs text-muted-foreground">{s.closed_at ? formatDateTime(s.closed_at) : "—"}</td>
                        <td className="p-3 num">{formatMoney(s.opening_balance)}</td>
                        <td className="p-3 num">{s.closing_balance !== null ? formatMoney(s.closing_balance) : "—"}</td>
                        <td className={`p-3 num ${s.cash_difference && Number(s.cash_difference) !== 0 ? (Number(s.cash_difference) < 0 ? "text-destructive" : "text-warning") : ""}`}>
                          {s.cash_difference !== null ? formatMoney(s.cash_difference) : "—"}
                        </td>
                        <td className="p-3">
                          {canClose && (
                            <Button size="sm" variant="outline" onClick={() => { setClosingId(s); setClosingCash("0"); }}>
                              إغلاق
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!closingId} onOpenChange={(v) => { if (!v) setClosingId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>إغلاق الوردية</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">رصيد البداية</div>
                <div className="mt-1 text-lg font-bold num">{formatMoney(closingId?.opening_balance ?? 0)}</div>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">النقد المتوقع</div>
                <div className="mt-1 text-lg font-bold num text-primary">
                  {expectedCashQuery.isLoading ? "..." : formatMoney(expectedCashQuery.data ?? 0)}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>النقد الفعلي في الصندوق</Label>
              <Input type="number" min="0" step="0.01" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} autoFocus />
              <div className="text-xs text-muted-foreground">
                الفرق: <span className="num font-medium">{formatMoney(Number(closingCash) - (expectedCashQuery.data ?? 0))}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClosingId(null)}>إلغاء</Button>
            <Button onClick={() => closeSess.mutate()} disabled={closeSess.isPending}>
              {closeSess.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              تأكيد الإغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
