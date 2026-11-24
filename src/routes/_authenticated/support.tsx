import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, BookOpen, BarChart3, Building2, CheckCircle2, CircleHelp,
  Clock3, Copy, Database, Gift, Globe, LifeBuoy, Megaphone, Package, Receipt,
  RefreshCw, Search, Server, ShieldCheck, Wifi, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/support")({
  component: SupportPage,
});

type HealthState = "checking" | "healthy" | "degraded" | "down" | "unknown";
type ServiceCheck = { id: string; label: string; detail: string; state: HealthState; checkedAt?: string };
const initialServices: ServiceCheck[] = [
  { id: "internet", label: "اتصال الإنترنت", detail: "لم يتم الفحص بعد", state: "unknown" },
  { id: "host", label: "خادم/مضيف التطبيق", detail: "لم يتم الفحص بعد", state: "unknown" },
  { id: "database", label: "قاعدة بيانات Supabase", detail: "لم يتم الفحص بعد", state: "unknown" },
  { id: "auth", label: "خدمة تسجيل الدخول", detail: "لم يتم الفحص بعد", state: "unknown" },
];

const guides = [
  { category: "المبيعات ونقطة البيع", title: "إنشاء فاتورة صحيحة", description: "اختر الفرع وجلسة الصندوق، أضف المنتجات والكميات، راجع الضريبة والخصم والإجمالي، ثم اعتمد البيع.", steps: ["تأكد من اختيار الفرع الصحيح وجلسة صندوق مفتوحة.", "أضف الأصناف وتحقق من الكميات والأسعار.", "راجع الإجمالي والخصم والضريبة قبل الاعتماد.", "اطبع الإيصال بعد نجاح العملية، ولا تكرر الاعتماد عند بطء الشبكة قبل مراجعة الفاتورة."], to: "/pos", icon: Receipt },
  { category: "المخزون والمشتريات", title: "متابعة الرصيد والحركات", description: "راجع الرصيد حسب الفرع، وافتح سجل الحركات لمعرفة مصدر كل زيادة أو نقص.", steps: ["اختر الفرع الذي تريد مراجعته.", "راجع الرصيد وحد إعادة الطلب.", "افتح الحركات لمعرفة نوع العملية ومرجعها.", "سجّل الاستلام عبر المشتريات بدلاً من تعديل الأرقام خارج النظام."], to: "/inventory", icon: Package },
  { category: "العروض والإعلانات", title: "الفرق بين العرض الترويجي والإعلان", description: "العرض يغيّر شروط الخصم في نقطة البيع؛ الإعلان مساحة مرئية لها موضع وفترة نشر.", steps: ["أنشئ العرض وحدد نوع الخصم والمنتجات والفترة والنطاق.", "تحقق من الفرع والشركة قبل تفعيل العرض.", "أنشئ الإعلان منفصلاً وحدد موضعه وجدول ظهوره.", "اختبر العرض في نقطة البيع والإعلان في موضع العرض قبل الإعلان عنه."], to: "/promotions", icon: Gift },
  { category: "العروض والإعلانات", title: "إدارة الحملات الإعلانية", description: "راجع حالة الحملة وموضعها وفترة بدايتها ونهايتها ونطاق الشركة.", steps: ["افتح إدارة الإعلانات.", "حدد موضع العرض والصورة والرابط عند الحاجة.", "اضبط تاريخ البداية والنهاية وحالة الحملة.", "استخدم المعاينة للتأكد من المظهر والرابط قبل التفعيل."], to: "/ads", icon: Megaphone },
  { category: "التقارير والتحليلات", title: "قراءة تقارير الربحية والمخزون", description: "تعرض الربحية تكلفة الأصناف المحفوظة وقت البيع، وتوضح التنبيهات أي تكلفة تاريخية ناقصة.", steps: ["حدد الفترة والفرع المسموح لك بهما.", "راجع المبيعات والمرتجعات والمصروفات.", "لا تعتمد الربح إذا ظهرت رسالة نقص تكاليف تاريخية.", "قيمة المخزون الحالية تقديرية حسب تكلفة المنتج الحالية، وليست تكلفة تاريخية."], to: "/reports", icon: BarChart3 },
  { category: "الشركات والصلاحيات", title: "التحقق من نطاق الشركة والفرع", description: "تعتمد رؤية البيانات على عضوية الشركة والفرع والصلاحيات الممنوحة في الخادم.", steps: ["تأكد من اختيار الشركة والفرع الصحيحين.", "اطلب من مالك الشركة مراجعة دورك إذا غاب قسم مسموح لك به.", "لا تستخدم حساب شخص آخر لتجاوز الصلاحيات.", "لا تشارك كلمات المرور أو مفاتيح الربط أو أرقام البطاقات."], to: "/team-permissions", icon: ShieldCheck },
  { category: "الشركات والصلاحيات", title: "إدارة الفروع", description: "تأكد من ربط الفرع بالشركة الصحيحة قبل تنفيذ عمليات البيع والمخزون.", steps: ["افتح قائمة الفروع.", "راجع الشركة المالكة للفرع وحالته.", "تأكد من إسناد المستخدمين إلى نطاقاتهم الصحيحة.", "لا تنقل فرعاً أو بيانات مالية بين الشركات دون إجراء معتمد."], to: "/branches", icon: Building2 },
];

const faqs = [
  { q: "لماذا لا أستطيع تسجيل الدخول؟", a: "تحقق من اتصال الإنترنت أولاً، ثم من حالة خدمة تسجيل الدخول. إذا كانت الخدمة متاحة وما زالت المشكلة مستمرة، تحقق من بيانات الحساب أو تواصل مع مسؤول النظام." },
  { q: "هل انقطاع الإنترنت يعني أن قاعدة البيانات متوقفة؟", a: "لا. انقطاع الإنترنت من جهازك يمنع الوصول إلى الخدمات البعيدة، لكنه لا يثبت تعطل قاعدة البيانات. تعرض لوحة الحالة كل فحص بشكل مستقل." },
  { q: "ماذا أفعل إذا ظهرت حالة قاعدة البيانات غير متاحة؟", a: "لا تكرر العمليات المالية. احتفظ برقم العملية إن وجد، وانتظر عودة الخدمة ثم تحقق من سجل الفاتورة أو الحركة قبل إعادة المحاولة." },
  { q: "هل يعمل النظام دون اتصال؟", a: "قد تبقى بعض الواجهات والبيانات المخزنة مؤقتاً متاحة، لكن لا تعتبر العمليات محفوظة على الخادم حتى تؤكد المزامنة ونجاح العملية." },
];

function stateLabel(state: HealthState) {
  return ({ checking: "جارٍ الفحص", healthy: "متاح", degraded: "يحتاج تحققاً", down: "غير متاح", unknown: "لم يُفحص" })[state];
}
function StateIcon({ state }: { state: HealthState }) {
  if (state === "healthy") return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  if (state === "down") return <XCircle className="h-5 w-5 text-red-600" />;
  if (state === "degraded") return <AlertTriangle className="h-5 w-5 text-amber-600" />;
  if (state === "checking") return <RefreshCw className="h-5 w-5 animate-spin text-primary" />;
  return <Activity className="h-5 w-5 text-muted-foreground" />;
}

function SupportPage() {
  const [search, setSearch] = useState("");
  const [services, setServices] = useState<ServiceCheck[]>(initialServices);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const checkInProgress = useRef(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ar");
    if (!term) return guides;
    return guides.filter((guide) => [guide.category, guide.title, guide.description, ...guide.steps].some((value) => value.toLocaleLowerCase("ar").includes(term)));
  }, [search]);

  const checkServices = useCallback(async () => {
    if (checkInProgress.current) return;
    checkInProgress.current = true;
    setChecking(true);
    setServices((current) => current.map((service) => ({ ...service, state: "checking", detail: "جارٍ التحقق من الخدمة..." })));
    const now = () => new Date().toISOString();
    const results = new Map<string, ServiceCheck>();
    const online = typeof navigator === "undefined" ? false : navigator.onLine;
    results.set("internet", { id: "internet", label: "اتصال الإنترنت", state: online ? "checking" : "down", detail: online ? "يجري اختبار الوصول إلى نقطة مستقلة على الإنترنت." : "المتصفح يعلن عدم وجود اتصال بالشبكة.", checkedAt: now() });

    if (!online) {
      results.set("host", { id: "host", label: "خادم/مضيف التطبيق", state: "unknown", detail: "لم يُفحص بسبب انقطاع الاتصال.", checkedAt: now() });
      results.set("database", { id: "database", label: "قاعدة بيانات Supabase", state: "unknown", detail: "لا يمكن الحكم على قاعدة البيانات من دون اتصال؛ لم يُسجل ذلك كتعطل لها.", checkedAt: now() });
      results.set("auth", { id: "auth", label: "خدمة تسجيل الدخول", state: "unknown", detail: "لم تُفحص بسبب انقطاع الاتصال.", checkedAt: now() });
    } else {
      const timeoutFetch = async (url: string, init?: RequestInit) => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 8000);
        try { return await fetch(url, { ...init, cache: "no-store", signal: controller.signal }); }
        finally { window.clearTimeout(timer); }
      };
      try {
        const response = await timeoutFetch(window.location.origin, { method: "HEAD" });
        results.set("host", { id: "host", label: "خادم/مضيف التطبيق", state: response.ok ? "healthy" : response.status >= 500 ? "down" : "degraded", detail: response.ok ? "استجاب مضيف التطبيق لطلب الفحص." : `استجاب المضيف برمز HTTP ${response.status}.`, checkedAt: now() });
      } catch {
        results.set("host", { id: "host", label: "خادم/مضيف التطبيق", state: "down", detail: "تعذر الوصول إلى مضيف التطبيق أو انتهت مهلة الفحص.", checkedAt: now() });
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
      if (!supabaseUrl || !supabaseKey) {
        results.set("database", { id: "database", label: "قاعدة بيانات Supabase", state: "unknown", detail: "إعدادات الاتصال غير متاحة في بيئة المتصفح؛ لم يتم إعلان الخدمة سليمة.", checkedAt: now() });
        results.set("auth", { id: "auth", label: "خدمة تسجيل الدخول", state: "unknown", detail: "إعدادات الاتصال غير متاحة في بيئة المتصفح.", checkedAt: now() });
      } else {
        const headers = { apikey: supabaseKey, Accept: "application/json" };
        try {
          const { error } = await supabase.from("tenants").select("id", { head: true, count: "exact" }).limit(1);
          const status = (error as (typeof error & { status?: number }) | null)?.status;
          const dbState: HealthState = !error ? "healthy" : status && status >= 500 ? "down" : "degraded";
          results.set("database", { id: "database", label: "قاعدة بيانات Supabase", state: dbState, detail: !error ? "نجح استعلام قراءة فعلي على جدول المؤسسات مع احترام صلاحيات الحساب." : status && status >= 500 ? `فشل اتصال قاعدة البيانات أو خدمتها (HTTP ${status}).` : "وصل الطلب إلى الخدمة لكن تعذر إتمام استعلام القراءة؛ تحقق من الصلاحيات والإعدادات.", checkedAt: now() });
        } catch {
          results.set("database", { id: "database", label: "قاعدة بيانات Supabase", state: "down", detail: "تعذر تنفيذ استعلام قاعدة البيانات؛ تحقق من الشبكة وخدمة Supabase.", checkedAt: now() });
        }
        try {
          const response = await timeoutFetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/health`, { method: "GET", headers });
          results.set("auth", { id: "auth", label: "خدمة تسجيل الدخول", state: response.ok ? "healthy" : response.status >= 500 ? "down" : "degraded", detail: response.ok ? "استجابت نقطة فحص خدمة المصادقة." : `استجابت خدمة المصادقة برمز HTTP ${response.status}.`, checkedAt: now() });
        } catch {
          results.set("auth", { id: "auth", label: "خدمة تسجيل الدخول", state: "down", detail: "تعذر الوصول إلى خدمة المصادقة أو انتهت مهلة الفحص.", checkedAt: now() });
        }
      }
    }
    setServices(initialServices.map((service) => results.get(service.id) ?? service));
    setLastChecked(now());
    checkInProgress.current = false;
    setChecking(false);
  }, []);

  useEffect(() => {
    void checkServices();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void checkServices(); }, 60_000);
    const onOnline = () => void checkServices();
    const onOffline = () => void checkServices();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.clearInterval(timer); window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, [checkServices]);

  async function copyDiagnostics() {
    const details = ["نظام إدارة المطاعم — معلومات تشخيص غير حساسة", `الوقت: ${new Date().toISOString()}`, `المسار: ${pathname}`, `المتصفح: ${navigator.userAgent}`, `اللغة: ${navigator.language}`, `حجم الشاشة: ${window.innerWidth}×${window.innerHeight}`, ...services.map((service) => `${service.label}: ${stateLabel(service.state)} — ${service.detail}`)].join("\n");
    try { await navigator.clipboard.writeText(details); toast.success("تم نسخ معلومات التشخيص غير الحساسة."); }
    catch { toast.error("تعذر النسخ. تحقق من سماح المتصفح بالوصول إلى الحافظة."); }
  }

  const hasIssue = services.some((service) => service.state === "down" || service.state === "degraded");
  const unknownCount = services.filter((service) => service.state === "unknown").length;

  return (
    <div className="space-y-6">
      <PageHeader title="مركز الدعم والمساعدة وحالة النظام" subtitle="الدليل والإرشادات ومراقبة فعلية لاتصال التطبيق وخدماته الأساسية." />
      <Card className="border-primary/20 bg-gradient-to-l from-primary/5 to-card">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><LifeBuoy className="h-6 w-6" /></span>
            <div><h2 className="font-bold">الدعم الفني ومركز المساعدة</h2><p className="mt-1 text-sm text-muted-foreground">ابحث في الأدلة، راجع الأسئلة الشائعة، أو انسخ تقريراً تشخيصياً آمناً لمشاركته مع مسؤول النظام.</p></div>
          </div>
          <Button variant="outline" onClick={() => void copyDiagnostics()}><Copy className="ml-2 h-4 w-4" />نسخ تقرير التشخيص</Button>
        </CardContent>
      </Card>

      <section aria-labelledby="health-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 id="health-heading" className="text-lg font-bold">حالة النظام والخدمات</h2><p className="text-sm text-muted-foreground">يتم إجراء الفحوص عند فتح الصفحة وكل دقيقة أثناء عرضها.</p></div>
          <Button onClick={() => void checkServices()} disabled={checking} variant="outline" size="sm"><RefreshCw className={`ml-2 h-4 w-4 ${checking ? "animate-spin" : ""}`} />تحديث الفحص</Button>
        </div>
        {hasIssue && <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /><div><strong>تنبيه: توجد خدمة تحتاج إلى الانتباه.</strong><p className="mt-1 text-muted-foreground">راجع حالة كل خدمة أدناه. لا يعني تعذر الوصول إلى الإنترنت أن قاعدة البيانات متوقفة.</p></div></div>}
        {unknownCount > 0 && !hasIssue && <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">بعض الخدمات لم يتم التحقق منها بعد؛ لن نعرضها على أنها تعمل بصورة طبيعية.</div>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {services.map((service) => {
            const Icon = service.id === "internet" ? Wifi : service.id === "host" ? Server : service.id === "database" ? Database : ShieldCheck;
            return <Card key={service.id}><CardContent className="space-y-3 p-4"><div className="flex items-center justify-between gap-2"><span className="grid h-9 w-9 place-items-center rounded-lg bg-muted"><Icon className="h-5 w-5 text-primary" /></span><StateIcon state={service.state} /></div><div><h3 className="font-bold">{service.label}</h3><p className="mt-1 text-sm font-semibold">{stateLabel(service.state)}</p><p className="mt-1 min-h-10 text-xs leading-5 text-muted-foreground">{service.detail}</p></div></CardContent></Card>;
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />آخر فحص: {lastChecked ? new Date(lastChecked).toLocaleString("ar-YE") : "لم يتم بعد"}</span><span>النتائج لا تتضمن فحص جميع وظائف النظام أو سلامة البيانات.</span></div>
      </section>

      <section className="space-y-3">
        <div><h2 className="text-lg font-bold">دليل الاستخدام وإرشادات الأقسام</h2><p className="text-sm text-muted-foreground">خطوات عملية مختصرة للوصول إلى الوظائف واستخدامها بأمان.</p></div>
        <div className="relative"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن المبيعات أو المخزون أو الصلاحيات..." className="pr-9" aria-label="البحث في أدلة المساعدة" /></div>
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((guide) => { const Icon = guide.icon; return <Card key={guide.title} className="h-full"><CardContent className="space-y-3 p-5"><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><div><div className="text-[11px] font-semibold text-primary">{guide.category}</div><h3 className="mt-1 font-bold">{guide.title}</h3></div></div><BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" /></div><p className="text-sm text-muted-foreground">{guide.description}</p><ol className="list-decimal space-y-1.5 pr-5 text-sm leading-6">{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol><Button asChild variant="outline" size="sm" className="w-full"><Link to={guide.to as any}>فتح القسم المرتبط</Link></Button></CardContent></Card>; })}
          {filtered.length === 0 && <Card className="lg:col-span-2"><CardContent className="p-10 text-center text-sm text-muted-foreground">لا توجد إرشادات تطابق عبارة البحث.</CardContent></Card>}
        </div>
      </section>

      <section className="space-y-3">
        <div><h2 className="text-lg font-bold">الأسئلة الشائعة</h2><p className="text-sm text-muted-foreground">إجابات سريعة للمشكلات والاستفسارات المتكررة.</p></div>
        <div className="grid gap-3 md:grid-cols-2">{faqs.map((faq) => <Card key={faq.q}><CardContent className="p-4"><h3 className="flex items-start gap-2 font-bold"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{faq.q}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{faq.a}</p></CardContent></Card>)}</div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><LifeBuoy className="h-5 w-5 text-primary" />التواصل مع الدعم الفني</CardTitle><CardDescription>قنوات التواصل المعتمدة من إدارة المؤسسة.</CardDescription></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground"><p>للحصول على مساعدة مباشرة، تواصل مع مسؤول النظام أو مدير المؤسسة عبر قناة الدعم المعتمدة لديكم.</p><p>لم يتم إدراج رقم هاتف أو بريد غير موثق داخل النظام.</p><Button variant="outline" className="w-full" onClick={() => void copyDiagnostics()}>نسخ بيانات البلاغ الفني</Button></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Globe className="h-5 w-5 text-primary" />إرشادات عند الإبلاغ عن مشكلة</CardTitle><CardDescription>ساعد فريق الدعم على تحديد السبب بسرعة.</CardDescription></CardHeader><CardContent><ul className="list-disc space-y-2 pr-5 text-sm leading-6 text-muted-foreground"><li>اذكر اسم الصفحة والفرع والوقت التقريبي والخطوات التي سبقت المشكلة.</li><li>أرفق رسالة الخطأ وتقرير التشخيص غير الحساس.</li><li>لا ترسل كلمة المرور أو رمز التحقق أو مفاتيح Supabase أو بيانات البطاقات البنكية.</li><li>إذا تعلقت المشكلة بفاتورة أو مخزون، لا تكرر العملية قبل مراجعة سجلها وحالتها.</li></ul></CardContent></Card>
      </section>
    </div>
  );
}
