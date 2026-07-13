import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ChefHat } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    return { userId: data.user.id };
  },
  component: OnboardingPage,
});

const nameSchema = z.string().trim().min(2, "الاسم قصير جداً").max(100);
const taxSchema = z.coerce.number().min(0).max(100);

function OnboardingPage() {
  const navigate = useNavigate();
  const { userId } = Route.useRouteContext();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("SAR");
  const [taxRate, setTaxRate] = useState("15");

  // If user already has a tenant, redirect
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("user_roles").select("tenant_id").eq("user_id", userId).limit(1);
      if (data && data.length > 0) {
        navigate({ to: "/dashboard" });
      }
    })();
  }, [userId, navigate]);

  const createTenant = useMutation({
    mutationFn: async () => {
      const nm = nameSchema.parse(name);
      const tr = taxSchema.parse(taxRate);

      const { data: tenant, error: te } = await supabase
        .from("tenants")
        .insert({ name: nm, currency, tax_rate: tr, owner_id: userId })
        .select()
        .single();
      if (te) throw te;

      const { error: re } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, tenant_id: tenant.id, role: "owner" });
      if (re) throw re;

      const { error: pe } = await supabase
        .from("profiles")
        .update({ tenant_id: tenant.id })
        .eq("id", userId);
      if (pe) throw pe;

      // Seed default categories
      const defaults = [
        { name: "مشروبات", icon: "coffee", sort_order: 1 },
        { name: "وجبات", icon: "utensils", sort_order: 2 },
        { name: "حلويات", icon: "cake", sort_order: 3 },
        { name: "إضافات", icon: "plus", sort_order: 4 },
      ];
      await supabase.from("categories").insert(defaults.map((c) => ({ ...c, tenant_id: tenant.id })));

      return tenant.id;
    },
    onSuccess: () => {
      toast.success("تم إنشاء المطعم بنجاح");
      navigate({ to: "/dashboard" });
    },
    onError: (err) => {
      const msg = err instanceof z.ZodError ? err.issues[0].message : err instanceof Error ? err.message : "فشلت العملية";
      toast.error(msg);
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary/5 to-background p-4">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <ChefHat className="h-7 w-7" />
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>أنشئ مطعمك الأول</CardTitle>
            <CardDescription>خطوة واحدة لبدء استخدام النظام</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                createTenant.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="name">اسم المطعم</Label>
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="مطعم الأصالة" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="currency">العملة</Label>
                  <Input id="currency" dir="ltr" required value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={5} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tax">نسبة الضريبة (%)</Label>
                  <Input
                    id="tax"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    required
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createTenant.isPending}>
                {createTenant.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
                إنشاء والمتابعة
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
