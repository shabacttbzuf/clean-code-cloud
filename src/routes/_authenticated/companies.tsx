import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { upsertCompany, deleteCompany } from "@/lib/enterprise.functions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/companies")({ component: CompaniesPage });

function CompaniesPage() {
  const { tenantId, role, loading } = useActiveTenant();
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertCompany);
  const delFn = useServerFn(deleteCompany);
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);

  const canAccess = role === "owner" || role === "manager";

  const q = useQuery({
    queryKey: ["companies-list", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("companies")
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!tenantId && canAccess,
  });

  const save = useMutation({
    mutationFn: (v: any) => upsertFn({ data: { ...v, tenant_id: tenantId! } }),
    onSuccess: () => {
      toast.success("تم الحفظ");
      qc.invalidateQueries({ queryKey: ["companies-list", tenantId] });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id, tenant_id: tenantId! } }),
    onSuccess: () => {
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["companies-list", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return <Loader2 className="mx-auto my-12 h-6 w-6 animate-spin text-primary" />;
  if (!canAccess)
    return (
      <div className="space-y-6">
        <PageHeader title="الشركات" />
        <Card>
          <CardContent className="flex items-center gap-3 p-8 text-muted-foreground">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            هذه الصفحة متاحة للمالك أو المدير فقط.
          </CardContent>
        </Card>
      </div>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="الشركات"
        subtitle="هيكلة مؤسسية للشركات (قابلة للتوسع لعدد غير محدود)."
        actions={
          <Button
            onClick={() => {
              setEditing({});
              setOpen(true);
            }}
          >
            <Plus className="ml-2 h-4 w-4" /> شركة جديدة
          </Button>
        }
      />
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {(q.data ?? []).map((c: any) => (
          <Card key={c.id}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{c.name}</div>
                  {c.legal_name && <div className="text-xs text-muted-foreground">{c.legal_name}</div>}
                </div>
                <Badge variant={c.is_active ? "default" : "secondary"}>{c.is_active ? "نشطة" : "موقوفة"}</Badge>
              </div>
              {c.tax_number && <div className="text-xs" dir="ltr">RN: {c.tax_number}</div>}
              {c.description && <div className="text-xs text-muted-foreground line-clamp-2">{c.description}</div>}
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => confirm("حذف؟") && del.mutate(c.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "تعديل شركة" : "شركة جديدة"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>الاسم</Label>
                <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div>
                <Label>الاسم القانوني</Label>
                <Input value={editing.legal_name ?? ""} onChange={(e) => setEditing({ ...editing, legal_name: e.target.value })} />
              </div>
              <div>
                <Label>الرقم الضريبي</Label>
                <Input dir="ltr" value={editing.tax_number ?? ""} onChange={(e) => setEditing({ ...editing, tax_number: e.target.value })} />
              </div>
              <div>
                <Label>الشعار (URL)</Label>
                <Input dir="ltr" value={editing.logo_url ?? ""} onChange={(e) => setEditing({ ...editing, logo_url: e.target.value })} />
              </div>
              <div>
                <Label>الوصف</Label>
                <Textarea value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button
              disabled={save.isPending}
              onClick={() =>
                save.mutate({
                  id: editing?.id,
                  name: editing?.name,
                  legal_name: editing?.legal_name || null,
                  tax_number: editing?.tax_number || null,
                  logo_url: editing?.logo_url || null,
                  description: editing?.description || null,
                })
              }
            >
              {save.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
