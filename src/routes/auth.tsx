import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ChefHat, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: AuthPage,
});

const emailSchema = z.string().trim().email({ message: "بريد إلكتروني غير صالح" }).max(255);
const passwordSchema = z
  .string()
  .min(8, { message: "كلمة السر يجب أن تكون 8 أحرف على الأقل" })
  .max(72, { message: "كلمة السر طويلة جداً" });
const nameSchema = z.string().trim().min(2, { message: "الاسم قصير جداً" }).max(100);

function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const email = emailSchema.parse(loginEmail);
      const password = passwordSchema.parse(loginPassword);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("مرحباً بك من جديد");
      navigate({ to: "/dashboard" });
    } catch (err) {
      const msg = err instanceof z.ZodError ? err.issues[0].message : err instanceof Error ? err.message : "فشل تسجيل الدخول";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const email = emailSchema.parse(signupEmail);
      const password = passwordSchema.parse(signupPassword);
      const full_name = nameSchema.parse(signupName);
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name },
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (error) throw error;
      toast.success("تم إنشاء الحساب بنجاح");
      navigate({ to: "/onboarding" });
    } catch (err) {
      const msg = err instanceof z.ZodError ? err.issues[0].message : err instanceof Error ? err.message : "فشل إنشاء الحساب";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary/5 to-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <ChefHat className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold">نظام محاسبة المطاعم</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>مرحباً</CardTitle>
            <CardDescription>سجّل الدخول أو أنشئ حساباً جديداً للبدء</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">تسجيل الدخول</TabsTrigger>
                <TabsTrigger value="signup">حساب جديد</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="l-email">البريد الإلكتروني</Label>
                    <Input
                      id="l-email"
                      type="email"
                      required
                      dir="ltr"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="l-password">كلمة السر</Label>
                    <Input
                      id="l-password"
                      type="password"
                      required
                      dir="ltr"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                    />
                  </div>
                  <Button className="w-full" type="submit" disabled={busy}>
                    {busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
                    دخول
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="s-name">الاسم الكامل</Label>
                    <Input
                      id="s-name"
                      required
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      placeholder="محمد أحمد"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="s-email">البريد الإلكتروني</Label>
                    <Input
                      id="s-email"
                      type="email"
                      required
                      dir="ltr"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="s-password">كلمة السر</Label>
                    <Input
                      id="s-password"
                      type="password"
                      required
                      dir="ltr"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      placeholder="8 أحرف على الأقل"
                    />
                  </div>
                  <Button className="w-full" type="submit" disabled={busy}>
                    {busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
                    إنشاء حساب
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
