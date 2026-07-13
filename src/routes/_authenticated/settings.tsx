import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

const schema = z.object({
  name: z.string().trim().min(2, "الاسم قصير").max(100),
  currency: z.string().trim().min(1).max(5),
  tax_rate: z.coerce.number().min(0).max(100),
});

function SettingsPage() {
  const { tenant, tenantId, isAdmin, role } = useActiveTenant();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("SAR");
  const [tax, setTax] = useState("15");

  useEffect(() => {
    if (tenant) {
      setName(tenant.name);
      setCurrency(tenant.currency);
      setTax(String(tenant.tax_rate));
    }
  }, [tenant]);

  const save = useMutation({
    mutationFn: async () => {
      const v = schema.parse({ name, currency, tax_rate: tax });
      const { error } = await supabase.from("tenants").update(v).eq("id", tenantId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant", tenantId] });
      toast.success("تم حفظ الإعدادات");
    },
    onError: (e) => {
      const msg = e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : "فشل الحفظ";
      toast.error(msg);
    },
  });

  const canEdit = role === "owner";

  return (
    <div className="space-y-6">
      <PageHeader title="إعدادات المطعم" subtitle="الاسم والعملة ونسبة الضريبة العامة." />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>البيانات الأساسية</CardTitle>
          <CardDescription>
            {canEdit ? "يمكنك تعديل هذه الإعدادات." : "المالك فقط يستطيع التعديل."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <div className="space-y-2">
              <Label>اسم المطعم</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required disabled={!canEdit} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>العملة</Label>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={5} dir="ltr" required disabled={!canEdit} />
              </div>
              <div className="space-y-2">
                <Label>نسبة الضريبة (%)</Label>
                <Input type="number" min="0" max="100" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} required disabled={!canEdit} />
              </div>
            </div>
            <Button type="submit" disabled={!canEdit || save.isPending}>
              {save.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              حفظ التغييرات
            </Button>
            {!isAdmin && (
              <p className="text-xs text-muted-foreground">
                * هذه الصفحة للعرض فقط بدورك الحالي.
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
