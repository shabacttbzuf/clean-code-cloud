import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ChefHat, ShieldCheck, BarChart3, Package, Users, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: Landing,
});

const features = [
  { icon: Building2, title: "إدارة الفروع", desc: "أدر فروعاً متعددة بإعدادات مستقلة لكل فرع" },
  { icon: Package, title: "إدارة المنتجات", desc: "أقسام ومنتجات مع صور وأسعار وحد أدنى للمخزون" },
  { icon: Users, title: "صلاحيات دقيقة", desc: "6 أدوار (مالك، مدير، محاسب، كاشير، مخزن، نادل)" },
  { icon: BarChart3, title: "تقارير احترافية", desc: "مبيعات، أرباح، مخزون، أداء الموظفين" },
  { icon: ShieldCheck, title: "أمان مؤسسي", desc: "عزل كامل بين المطاعم مع تشفير كامل للبيانات" },
  { icon: ChefHat, title: "مصمم للمطاعم", desc: "POS، صندوق، ورديات، فواتير، وموردون" },
];

function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <ChefHat className="h-5 w-5" />
            </div>
            <span className="font-bold">نظام محاسبة المطاعم</span>
          </div>
          <Button asChild>
            <Link to="/auth">تسجيل الدخول</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-16">
        <section className="text-center">
          <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-primary" />
            الإصدار الأول — الأساس المتكامل
          </div>
          <h1 className="text-balance text-4xl font-bold tracking-tight md:text-6xl">
            نظام محاسبي احترافي
            <br />
            <span className="text-primary">لإدارة مطاعمك</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            حل متكامل لإدارة المطاعم والفروع والمنتجات والموظفين، مع أمان مؤسسي وواجهة عربية أصيلة.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link to="/auth">ابدأ الآن مجاناً</Link>
            </Button>
          </div>
        </section>

        <section className="mt-24 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-6 shadow-sm transition hover:shadow-md">
              <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Restaurant Accounting System — نظام محاسبة المطاعم
      </footer>
    </div>
  );
}
