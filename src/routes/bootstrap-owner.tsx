import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldCheck } from "lucide-react";

const INITIAL_OWNER_ID = "bc6e84c8-9f68-473e-b51f-6fef900b779d";

export const Route = createFileRoute("/bootstrap-owner")({
  ssr: false,
  component: BootstrapOwnerPage,
});

function BootstrapOwnerPage() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("سجّل الدخول بالحساب الأول ثم اضغط الزر لإكمال تعيين المالك الأعلى.");

  async function configureOwner() {
    setBusy(true);
    setMessage("");
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const user = sessionData.session?.user;
      if (!user) throw new Error("يجب تسجيل الدخول أولاً.");
      if (user.id !== INITIAL_OWNER_ID) throw new Error("هذا الحساب غير مخوّل بتهيئة المالك الأعلى.");

      const { data, error } = await supabase.functions.invoke("bootstrap-first-super-owner", {
        method: "POST",
      });
      if (error) {
        const details = data && typeof data === "object" && "error" in data
          ? String((data as { error: unknown }).error)
          : error.message;
        throw new Error(details || "تعذر إكمال التهيئة.");
      }
      setMessage("تم تعيين حسابك مالكاً أعلى بنجاح. حدّث الصفحة أو سجّل الخروج ثم الدخول.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "حدث خطأ غير متوقع.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4" dir="rtl">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <CardTitle>تهيئة المالك الأعلى</CardTitle>
          <CardDescription>عملية أولية لمرة واحدة، ومقيّدة بحساب المالك المعتمد على الخادم.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-7" role="status">{message}</p>
          <Button className="w-full" onClick={configureOwner} disabled={busy}>
            {busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="ml-2 h-4 w-4" />}
            تأكيد تعييني مالكاً أعلى
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
