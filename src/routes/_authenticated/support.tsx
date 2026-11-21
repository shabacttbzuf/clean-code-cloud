import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BookOpen, BarChart3, Building2, Copy, Gift, Megaphone, Package, Receipt, Search, ShieldCheck, CircleHelp } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/support")({
  component: SupportPage,
});

const guides = [
  {
    category: "المبيعات ونقطة البيع",
    title: "إنشاء فاتورة صحيحة",
    description: "اختر الفرع وجلسة الصندوق، أضف المنتجات والكميات، راجع الضريبة والخصم والإجمالي، ثم اعتمد البيع.",
    steps: ["تأكد من اختيار الفرع الصحيح وجلسة صندوق مفتوحة.", "أضف الأصناف وتحقق من الكميات والأسعار.", "راجع الإجمالي والخصم والضريبة قبل الاعتماد.", "اطبع الإيصال بعد نجاح العملية، ولا تكرر الاعتماد عند بطء الشبكة قبل مراجعة الفاتورة."],
    to: "/pos",
    icon: Receipt,
  },
  {
    category: "المخزون والمشتريات",
    title: "متابعة الرصيد والحركات",
    description: "راجع الرصيد حسب الفرع، وافتح سجل الحركات لمعرفة مصدر كل زيادة أو نقص.",
    steps: ["اختر الفرع الذي تريد مراجعته.", "راجع الرصيد وحد إعادة الطلب.", "افتح الحركات لمعرفة نوع العملية ومرجعها.", "سجّل الاستلام عبر المشتريات بدلاً من تعديل الأرقام خارج النظام."],
    to: "/inventory",
    icon: Package,
  },
  {
    category: "العروض والإعلانات",
    title: "الفرق بين العرض الترويجي والإعلان",
    description: "العرض يغيّر شروط الخصم في نقطة البيع؛ الإعلان مساحة مرئية لها موضع وفترة نشر.",
    steps: ["أنشئ العرض وحدد نوع الخصم والمنتجات والفترة والنطاق.", "تحقق من الفرع والشركة قبل تفعيل العرض.", "أنشئ الإعلان منفصلاً وحدد موضعه وجدول ظهوره.", "اختبر العرض في نقطة البيع والإعلان في موضع العرض قبل الإعلان عنه."],
    to: "/promotions",
    icon: Gift,
  },
  {
    category: "العروض والإعلانات",
    title: "إدارة الحملات الإعلانية",
    description: "راجع حالة الحملة وموضعها وفترة بدايتها ونهايتها ونطاق الشركة.",
    steps: ["افتح إدارة الإعلانات.", "حدد موضع العرض والصورة والرابط عند الحاجة.", "اضبط تاريخ البداية والنهاية وحالة الحملة.", "استخدم المعاينة للتأكد من المظهر والرابط قبل التفعيل."],
    to: "/ads",
    icon: Megaphone,
  },
  {
    category: "التقارير والتحليلات",
    title: "قراءة تقارير الربحية والمخزون",
    description: "تعرض الربحية تكلفة الأصناف المحفوظة وقت البيع، وتوضح التنبيهات أي تكلفة تاريخية ناقصة.",
    steps: ["حدد الفترة والفرع المسموح لك بهما.", "راجع المبيعات والمرتجعات والمصروفات.", "لا تعتمد الربح إذا ظهرت رسالة نقص تكاليف تاريخية.", "قيمة المخزون الحالية تقديرية حسب تكلفة المنتج الحالية، وليست تكلفة تاريخية."],
    to: "/reports",
    icon: BarChart3,
  },
  {
    category: "الشركات والصلاحيات",
    title: "التحقق من نطاق الشركة والفرع",
    description: "تعتمد رؤية البيانات على عضوية الشركة والفرع والصلاحيات الممنوحة في الخادم.",
    steps: ["تأكد من اختيار الشركة والفرع الصحيحين.", "اطلب من مالك الشركة مراجعة دورك إذا غاب قسم مسموح لك به.", "لا تستخدم حساب شخص آخر لتجاوز الصلاحيات.", "لا تشارك كلمات المرور أو مفاتيح الربط أو أرقام البطاقات."],
    to: "/team-permissions",
    icon: ShieldCheck,
  },
  {
    category: "الشركات والصلاحيات",
    title: "إدارة الفروع",
    description: "تأكد من ربط الفرع بالشركة الصحيحة قبل تنفيذ عمليات البيع والمخزون.",
    steps: ["افتح قائمة الفروع.", "راجع الشركة المالكة للفرع وحالته.", "تأكد من إسناد المستخدمين إلى نطاقاتهم الصحيحة.", "لا تنقل فرعاً أو بيانات مالية بين الشركات دون إجراء معتمد."],
    to: "/branches",
    icon: Building2,
  },
];

function SupportPage() {
  const [search, setSearch] = useState("");
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ar");
    if (!term) return guides;
    return guides.filter((guide) =>
      [guide.category, guide.title, guide.description, ...guide.steps]
        .some((value) => value.toLocaleLowerCase("ar").includes(term)),
    );
  }, [search]);

  async function copyDiagnostics() {
    const details = [
      "نظام إدارة المطاعم — معلومات تشخيص غير حساسة",
      `الوقت: ${new Date().toISOString()}`,
      `المسار: ${pathname}`,
      `المتصفح: ${navigator.userAgent}`,
      `اللغة: ${navigator.language}`,
      `حجم الشاشة: ${window.innerWidth}×${window.innerHeight}`,
      `الاتصال: ${navigator.onLine ? "متصل" : "غير متصل"}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(details);
      toast.success("تم نسخ معلومات التشخيص غير الحساسة.");
    } catch {
      toast.error("تعذر النسخ. تحقق من سماح المتصفح بالوصول إلى الحافظة.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="مركز المساعدة والدعم" subtitle="إرشادات عملية لاستخدام النظام وحل المشكلات الشائعة بأمان." />
      <Card className="border-primary/20 bg-gradient-to-l from-primary/5 to-card">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><CircleHelp className="h-6 w-6" /></span>
            <div>
              <h2 className="font-bold">كيف يمكننا مساعدتك؟</h2>
              <p className="mt-1 text-sm text-muted-foreground">ابحث في الأدلة أو افتح القسم المرتبط بالمشكلة. تظهر الأقسام وفق صلاحيات حسابك.</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => void copyDiagnostics()}><Copy className="ml-2 h-4 w-4" />نسخ معلومات التشخيص</Button>
        </CardContent>
      </Card>

      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن المبيعات أو المخزون أو الصلاحيات..." className="pr-9" aria-label="البحث في أدلة المساعدة" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {filtered.map((guide) => {
          const Icon = guide.icon;
          return (
            <Card key={guide.title} className="h-full">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
                    <div>
                      <div className="text-[11px] font-semibold text-primary">{guide.category}</div>
                      <h3 className="mt-1 font-bold">{guide.title}</h3>
                    </div>
                  </div>
                  <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">{guide.description}</p>
                <ol className="list-decimal space-y-1.5 pr-5 text-sm leading-6">
                  {guide.steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link to={guide.to as any}>فتح القسم المرتبط</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
        {filtered.length === 0 && <Card className="lg:col-span-2"><CardContent className="p-10 text-center text-sm text-muted-foreground">لا توجد إرشادات تطابق عبارة البحث.</CardContent></Card>}
      </div>

      <Card>
        <CardContent className="space-y-2 p-5 text-sm">
          <h2 className="font-bold">إرشادات عند الإبلاغ عن مشكلة</h2>
          <ul className="list-disc space-y-1.5 pr-5 text-muted-foreground">
            <li>اذكر اسم الصفحة والفرع والوقت التقريبي والخطوات التي سبقت المشكلة.</li>
            <li>أرفق رسالة الخطأ ومعلومات التشخيص غير الحساسة عند التواصل مع مسؤول النظام.</li>
            <li>لا ترسل كلمة المرور أو رمز التحقق أو مفاتيح Supabase أو بيانات البطاقات البنكية.</li>
            <li>إذا تعلقت المشكلة بفاتورة أو مخزون، لا تكرر العملية قبل مراجعة سجلها وحالتها.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
