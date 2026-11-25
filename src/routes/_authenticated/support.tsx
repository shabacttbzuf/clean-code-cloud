import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { useActiveTenant } from "@/hooks/use-active-tenant";
import { useSuperOwner } from "@/hooks/use-super-owner";
import { aggregateHealth, canViewTechnicalDetails, classifyHttpStatus, classifyProbeFailure, safeDiagnosticSummary } from "@/lib/support-health.mjs";

export const Route = createFileRoute("/_authenticated/support")({
  component: SupportPage,
});

type HealthState = "checking" | "healthy" | "degraded" | "down" | "unknown";
type ServiceCheck = { id: string; label: string; detail: string; state: HealthState; checkedAt?: string; statusCode?: number };
const MIN_RETRY_INTERVAL_MS = 5_000;
const SERVICE_DEFINITIONS: ServiceCheck[] = [
  { id: "internet", label: "اتصال الإنترنت", detail: "لم يتم الفحص بعد", state: "unknown" },
  { id: "host", label: "خادم التطبيق", detail: "لم يتم الفحص بعد", state: "unknown" },
  { id: "database", label: "قاعدة البيانات وREST API", detail: "لم يتم الفحص بعد", state: "unknown" },
  { id: "auth", label: "خدمة المصادقة", detail: "لم يتم الفحص بعد", state: "unknown" },
  { id: "session", label: "الجلسة الحالية", detail: "لم يتم التحقق من الجلسة بعد", state: "unknown" },
  { id: "storage", label: "خدمة التخزين", detail: "لم يتم الفحص بعد", state: "unknown" },
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
  const [services, setServices] = useState<ServiceCheck[]>(SERVICE_DEFINITIONS);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const checkInProgress = useRef(false);
  const lastAttemptAtRef = useRef(0);
  const mountedRef = useRef(false);
  const activeControllersRef = useRef<Set<AbortController>>(new Set());
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { tenantId, userId } = useActiveTenant();
  const { isSuperOwner, loading: ownerLoading } = useSuperOwner();

  const technicalPermissionsQuery = useQuery({
    queryKey: ["support-technical-permissions", tenantId, userId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase.rpc("get_my_permissions", { _tenant_id: tenantId });
      if (error) throw error;
      return (data ?? []) as string[];
    },
    enabled: !!tenantId && !!userId && !isSuperOwner,
    staleTime: 30_000,
    retry: 1,
  });
  const canSeeTechnicalDetails = canViewTechnicalDetails(isSuperOwner, technicalPermissionsQuery.data ?? []);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("ar");
    if (!term) return guides;
    return guides.filter((guide) => [guide.category, guide.title, guide.description, ...guide.steps].some((value) => value.toLocaleLowerCase("ar").includes(term)));
  }, [search]);

  const checkServices = useCallback(async (force = false) => {
    if (checkInProgress.current) return;
    const attemptAt = Date.now();
    if (!force && attemptAt - lastAttemptAtRef.current < MIN_RETRY_INTERVAL_MS) return;
    if (force && attemptAt - lastAttemptAtRef.current < MIN_RETRY_INTERVAL_MS) {
      toast.info("يرجى الانتظار قليلاً قبل إعادة الفحص لتجنب تكرار الطلبات.");
      return;
    }
    lastAttemptAtRef.current = attemptAt;
    checkInProgress.current = true;
    setChecking(true);
    setServices((current) => current.map((service) => ({ ...service, state: "checking", detail: "جارٍ إعادة التحقق؛ النتيجة السابقة لا تزال محفوظة حتى اكتمال الفحص." })));

    const timestamp = () => new Date().toISOString();
    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

    const fetchWithTimeout = async (url: string, init: RequestInit = {}) => {
      const controller = new AbortController();
      activeControllersRef.current.add(controller);
      const timer = window.setTimeout(() => controller.abort(), 7_000);
      try {
        return await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
      } finally {
        window.clearTimeout(timer);
        activeControllersRef.current.delete(controller);
      }
    };

    const checkInternet = async (): Promise<ServiceCheck> => {
      try {
        const response = await fetchWithTimeout("https://www.cloudflare.com/cdn-cgi/trace", { method: "GET", mode: "no-cors" });
        const state = response.type === "opaque" ? "healthy" : classifyHttpStatus(response.status);
        return { id: "internet", label: "اتصال الإنترنت", state, detail: state === "healthy" ? "نجح الوصول إلى نقطة اختبار مستقلة خارج التطبيق." : "استجابت نقطة الاختبار بنتيجة غير متوقعة؛ قد يكون الاتصال محدوداً.", statusCode: response.status || undefined, checkedAt: timestamp() };
      } catch {
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        return { id: "internet", label: "اتصال الإنترنت", state: offline ? "down" : classifyProbeFailure(), detail: offline ? "الجهاز يعلن انقطاع الشبكة وتعذر الوصول إلى نقطة الاختبار الخارجية." : "تعذر الوصول إلى نقطة الاختبار الخارجية؛ قد يكون الاتصال متقطعاً أو نقطة الفحص محجوبة، ولا يثبت ذلك تعطل قاعدة البيانات.", checkedAt: timestamp() };
      }
    };

    const checkHost = async (): Promise<ServiceCheck> => {
      try {
        const response = await fetchWithTimeout(window.location.origin, { method: "HEAD" });
        const state = classifyHttpStatus(response.status);
        return { id: "host", label: "خادم التطبيق", state, detail: state === "healthy" ? "استجاب مضيف التطبيق. استجابة 4xx تعني أن المضيف قابل للوصول لكنها ليست فشلاً في الاتصال." : state === "down" ? "أعاد مضيف التطبيق خطأ خادم (5xx)." : "المضيف قابل للوصول لكن نتيجة الفحص تحتاج مراجعة.", statusCode: response.status, checkedAt: timestamp() };
      } catch {
        return { id: "host", label: "خادم التطبيق", state: classifyProbeFailure(), detail: "تعذر الوصول إلى المضيف أو انتهت مهلة الفحص؛ قد يكون عطلاً مؤقتاً في الشبكة.", checkedAt: timestamp() };
      }
    };

    const checkDatabase = async (): Promise<ServiceCheck> => {
      if (!supabaseUrl || !supabaseKey) return { id: "database", label: "قاعدة البيانات وREST API", state: "unknown", detail: "إعدادات Supabase العامة غير متاحة في بيئة التشغيل؛ لم يتم إعلان قاعدة البيانات سليمة.", checkedAt: timestamp() };
      try {
        const apiResponse = await fetchWithTimeout(`${supabaseUrl}/rest/v1/`, { headers: { apikey: supabaseKey, Accept: "application/openapi+json" } });
        if (apiResponse.status >= 500) return { id: "database", label: "قاعدة البيانات وREST API", state: "down", detail: "واجهة قاعدة البيانات أعادت خطأ خادم.", statusCode: apiResponse.status, checkedAt: timestamp() };
        if (!apiResponse.ok) return { id: "database", label: "قاعدة البيانات وREST API", state: "degraded", detail: "واجهة REST استجابت لكن رفضت طلب الفحص؛ تحقق من إعدادات الوصول.", statusCode: apiResponse.status, checkedAt: timestamp() };

        const controller = new AbortController();
        activeControllersRef.current.add(controller);
        const timer = window.setTimeout(() => controller.abort(), 7_000);
        try {
          const result = await supabase.from("tenants").select("id", { head: true }).limit(1).abortSignal(controller.signal);
          if (!result.error) return { id: "database", label: "قاعدة البيانات وREST API", state: "healthy", detail: "نجح استعلام قراءة فعلي عبر جلسة المستخدم مع احترام سياسات RLS.", statusCode: result.status, checkedAt: timestamp() };
          const status = result.status;
          const state = status >= 500 ? "down" : "degraded";
          return { id: "database", label: "قاعدة البيانات وREST API", state, detail: state === "down" ? "وصل الطلب إلى قاعدة البيانات لكن الخدمة أعادت خطأ خادم." : "واجهة قاعدة البيانات متاحة، لكن استعلام المستخدم تعذر بسبب الصلاحية أو إعداد الطلب أو اتصال مؤقت.", statusCode: status || undefined, checkedAt: timestamp() };
        } finally {
          window.clearTimeout(timer);
          activeControllersRef.current.delete(controller);
        }
      } catch {
        return { id: "database", label: "قاعدة البيانات وREST API", state: classifyProbeFailure(), detail: "تعذر إكمال فحص قاعدة البيانات؛ لا يمكن تأكيد تعطلها من خطأ اتصال منفرد.", checkedAt: timestamp() };
      }
    };

    const checkAuth = async (): Promise<ServiceCheck> => {
      if (!supabaseUrl || !supabaseKey) return { id: "auth", label: "خدمة المصادقة", state: "unknown", detail: "إعدادات خدمة المصادقة غير متاحة للفحص.", checkedAt: timestamp() };
      try {
        const response = await fetchWithTimeout(`${supabaseUrl}/auth/v1/health`, { headers: { apikey: supabaseKey, Accept: "application/json" } });
        const state = classifyHttpStatus(response.status);
        return { id: "auth", label: "خدمة المصادقة", state, detail: state === "healthy" ? "استجابت نقطة فحص خدمة المصادقة." : state === "down" ? "أعادت خدمة المصادقة خطأ خادم (5xx)." : "خدمة المصادقة استجابت برمز يحتاج مراجعة.", statusCode: response.status, checkedAt: timestamp() };
      } catch {
        return { id: "auth", label: "خدمة المصادقة", state: classifyProbeFailure(), detail: "تعذر الوصول إلى المصادقة أو انتهت مهلة الطلب؛ يرجح فشل اتصال مؤقت حتى يثبت غير ذلك.", checkedAt: timestamp() };
      }
    };

    const checkSession = async (): Promise<ServiceCheck> => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) return { id: "session", label: "الجلسة الحالية", state: "degraded", detail: "تعذر قراءة الجلسة المحلية؛ أعد تسجيل الدخول إذا استمرت المشكلة.", checkedAt: timestamp() };
        const session = data.session;
        if (!session) return { id: "session", label: "الجلسة الحالية", state: "degraded", detail: "لا توجد جلسة دخول محفوظة في هذا المتصفح. سجّل الدخول للمتابعة.", checkedAt: timestamp() };
        if (session.expires_at && session.expires_at * 1000 <= Date.now()) return { id: "session", label: "الجلسة الحالية", state: "degraded", detail: "انتهت صلاحية الجلسة محلياً؛ أعد تسجيل الدخول.", checkedAt: timestamp() };
        if (!supabaseUrl || !supabaseKey) return { id: "session", label: "الجلسة الحالية", state: "unknown", detail: "الجلسة موجودة محلياً لكن تعذر التحقق منها لدى خادم المصادقة بسبب نقص الإعدادات.", checkedAt: timestamp() };
        const response = await fetchWithTimeout(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${session.access_token}`, Accept: "application/json" } });
        const state = response.status === 401 || response.status === 403 ? "degraded" : classifyHttpStatus(response.status);
        return { id: "session", label: "الجلسة الحالية", state, detail: state === "healthy" ? "الجلسة صالحة وتم التحقق منها لدى خادم المصادقة." : state === "down" ? "خادم المصادقة أعاد خطأ خادم أثناء التحقق من الجلسة." : "الجلسة موجودة محلياً لكن الخادم لم يؤكد صلاحيتها؛ قد تحتاج إلى تسجيل الدخول مجدداً.", statusCode: response.status, checkedAt: timestamp() };
      } catch {
        return { id: "session", label: "الجلسة الحالية", state: classifyProbeFailure(), detail: "تعذر التحقق من الجلسة عن بُعد؛ لم يتم اعتبارها منتهية بسبب خطأ الشبكة وحده.", checkedAt: timestamp() };
      }
    };

    const checkStorage = async (): Promise<ServiceCheck> => {
      if (!supabaseUrl || !supabaseKey) return { id: "storage", label: "خدمة التخزين", state: "unknown", detail: "إعدادات Supabase العامة غير متاحة للفحص.", checkedAt: timestamp() };
      try {
        const response = await fetchWithTimeout(`${supabaseUrl}/storage/v1/status`, { headers: { apikey: supabaseKey, Accept: "application/json" } });
        const state = classifyHttpStatus(response.status);
        return { id: "storage", label: "خدمة التخزين", state, detail: state === "healthy" ? "استجابت نقطة فحص خدمة التخزين." : state === "down" ? "أعادت خدمة التخزين خطأ خادم (5xx)." : "تعذر تأكيد جاهزية التخزين من استجابة الخدمة؛ راجع إعداداتها.", statusCode: response.status, checkedAt: timestamp() };
      } catch {
        return { id: "storage", label: "خدمة التخزين", state: classifyProbeFailure(), detail: "تعذر الوصول إلى خدمة التخزين أو انتهت مهلة الفحص؛ قد يكون فشلاً مؤقتاً.", checkedAt: timestamp() };
      }
    };

    const probes = [checkInternet, checkHost, checkDatabase, checkAuth, checkSession, checkStorage];
    try {
      const settled = await Promise.allSettled(probes.map((probe) => probe()));
      const nextServices = settled.map((result, index) => result.status === "fulfilled"
        ? result.value
        : { ...SERVICE_DEFINITIONS[index], state: classifyProbeFailure(), detail: "تعذر إكمال هذا الفحص بسبب خطأ غير متوقع؛ أعد المحاولة لاحقاً.", checkedAt: timestamp() } as ServiceCheck);
      if (mountedRef.current) {
        setServices(nextServices);
        setLastChecked(timestamp());
      }
    } finally {
      checkInProgress.current = false;
      if (mountedRef.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void checkServices();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void checkServices();
    }, 60_000);
    let eventTimer: number | undefined;
    const scheduleCheck = () => {
      if (eventTimer) window.clearTimeout(eventTimer);
      eventTimer = window.setTimeout(() => void checkServices(), 1_000);
    };
    const onVisibility = () => { if (document.visibilityState === "visible") scheduleCheck(); };
    window.addEventListener("online", scheduleCheck);
    window.addEventListener("offline", scheduleCheck);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
      if (eventTimer) window.clearTimeout(eventTimer);
      window.removeEventListener("online", scheduleCheck);
      window.removeEventListener("offline", scheduleCheck);
      document.removeEventListener("visibilitychange", onVisibility);
      activeControllersRef.current.forEach((controller) => controller.abort());
      activeControllersRef.current.clear();
    };
  }, [checkServices]);

  async function copyDiagnostics() {
    const details = [
      "نظام إدارة المطاعم — ملخص تشخيص غير حساس",
      `وقت آخر فحص: ${lastChecked ?? "لم يتم بعد"}`,
      ...safeDiagnosticSummary(services).map((service) => `${service.label}: ${stateLabel(service.state)} — ${service.checkedAt ?? "لم يُفحص"}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(details);
      toast.success("تم نسخ ملخص التشخيص الآمن دون رموز أو بيانات جلسة.");
    } catch {
      toast.error("تعذر النسخ. تحقق من سماح المتصفح بالوصول إلى الحافظة.");
    }
  }

  const overall = aggregateHealth(services);
  const hasIssue = overall === "down" || overall === "degraded";
  const overallLabel = overall === "healthy" ? "كل الفحوص المطلوبة نجحت" : overall === "down" ? "تم رصد تعطل في مكوّن واحد أو أكثر" : overall === "degraded" ? "الحالة جزئية أو تحتاج تحققاً" : "الحالة غير معروفة";
  const serviceIcon = (id: string) => id === "internet" ? Wifi : id === "host" ? Server : id === "database" ? Database : id === "storage" ? Package : id === "session" ? ShieldCheck : ShieldCheck;

  return (
    <div className="space-y-6">
      <PageHeader title="مركز الدعم والمساعدة وحالة النظام" subtitle="الدليل والإرشادات ومراقبة فعلية لاتصال التطبيق وخدماته الأساسية." />
      <Card className="border-primary/20 bg-gradient-to-l from-primary/5 to-card">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><LifeBuoy className="h-6 w-6" /></span>
            <div className="min-w-0"><h2 className="font-bold">الدعم الفني ومركز المساعدة</h2><p className="mt-1 text-sm text-muted-foreground">ابحث في الأدلة، راجع الأسئلة الشائعة، أو انسخ ملخصاً تشخيصياً آمناً لمشاركته مع مسؤول النظام.</p></div>
          </div>
          <Button variant="outline" className="w-full shrink-0 sm:w-auto" onClick={() => void copyDiagnostics()}><Copy className="ml-2 h-4 w-4" />نسخ ملخص التشخيص</Button>
        </CardContent>
      </Card>

      <section aria-labelledby="health-heading" className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 id="health-heading" className="text-lg font-bold">حالة النظام والخدمات</h2><p className="text-sm text-muted-foreground">فحوص مستقلة ومتوازية عند فتح الصفحة، وكل دقيقة أثناء عرضها، وعند عودة الاتصال.</p></div>
          <Button onClick={() => void checkServices(true)} disabled={checking} variant="outline" size="sm" className="w-full sm:w-auto"><RefreshCw className={`ml-2 h-4 w-4 ${checking ? "animate-spin" : ""}`} />{checking ? "جارٍ الفحص..." : "إعادة فحص الخدمات"}</Button>
        </div>
        <div className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${overall === "healthy" ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/10"}`} role="status" aria-live="polite">
          {overall === "healthy" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />}
          <div><strong>{overallLabel}</strong><p className="mt-1 text-muted-foreground">{overall === "healthy" ? "نجحت جميع الفحوص المعروضة في آخر دورة تحقق فقط؛ هذا لا يثبت سلامة كل وظائف النظام." : "لا تعتبر الخدمات غير المفحوصة أو التي فشل اتصالها سليمة. افحص التفاصيل لكل مكوّن."}</p></div>
        </div>
        {hasIssue && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm"><strong>إرشاد مهم:</strong> إذا تعذر فحص خدمة، لا تكرر عملية بيع أو مخزون. تحقق من حالة العملية بعد عودة الاتصال قبل إعادة تنفيذها.</div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => {
            const Icon = serviceIcon(service.id);
            return <Card key={service.id} className="min-w-0">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2"><span className="grid h-9 w-9 place-items-center rounded-lg bg-muted"><Icon className="h-5 w-5 text-primary" /></span><div className="flex items-center gap-2"><span className="text-xs font-semibold">{stateLabel(service.state)}</span><StateIcon state={service.state} /></div></div>
                <div><h3 className="font-bold">{service.label}</h3><p className="mt-1 min-h-12 text-sm leading-6 text-muted-foreground">{service.detail}</p></div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-[11px] text-muted-foreground"><span>آخر فحص: {service.checkedAt ? new Date(service.checkedAt).toLocaleTimeString("ar-YE") : "لم يُفحص"}</span>{canSeeTechnicalDetails && service.statusCode !== undefined && <span dir="ltr">HTTP {service.statusCode}</span>}</div>
              </CardContent>
            </Card>;
          })}
        </div>
        <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />آخر دورة فحص: {lastChecked ? new Date(lastChecked).toLocaleString("ar-YE") : "لم تكتمل بعد"}</span>
          <span>لا يتم حفظ سجلات تشخيص شخصية أو رموز جلسات. لا يتضمن الفحص Realtime أو Edge Functions لعدم وجود نقطة عامة آمنة موحدة لاختبارهما.</span>
        </div>
        {!canSeeTechnicalDetails && !ownerLoading && <p className="text-xs text-muted-foreground">التفاصيل الفنية ورموز الاستجابة متاحة لمالك النظام أو من لديه صلاحية سجل التدقيق أو إعدادات النظام.</p>}
      </section>

      <section className="space-y-3">
        <div><h2 className="text-lg font-bold">دليل الاستخدام وإرشادات الأقسام</h2><p className="text-sm text-muted-foreground">خطوات عملية مختصرة للوصول إلى الوظائف واستخدامها بأمان.</p></div>
        <div className="relative"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن المبيعات أو المخزون أو الصلاحيات..." className="pr-9" aria-label="البحث في أدلة المساعدة" /></div>
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((guide) => { const Icon = guide.icon; return <Card key={guide.title} className="h-full"><CardContent className="space-y-3 p-5"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><div><div className="text-[11px] font-semibold text-primary">{guide.category}</div><h3 className="mt-1 font-bold">{guide.title}</h3></div></div><BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" /></div><p className="text-sm text-muted-foreground">{guide.description}</p><ol className="list-decimal space-y-1.5 pr-5 text-sm leading-6">{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol><Button asChild variant="outline" size="sm" className="w-full"><Link to={guide.to as any}>فتح القسم المرتبط</Link></Button></CardContent></Card>; })}
          {filtered.length === 0 && <Card className="lg:col-span-2"><CardContent className="p-10 text-center text-sm text-muted-foreground">لا توجد إرشادات تطابق عبارة البحث.</CardContent></Card>}
        </div>
      </section>

      <section className="space-y-3">
        <div><h2 className="text-lg font-bold">الأسئلة الشائعة</h2><p className="text-sm text-muted-foreground">إجابات سريعة للمشكلات والاستفسارات المتكررة.</p></div>
        <div className="grid gap-3 md:grid-cols-2">{faqs.map((faq) => <Card key={faq.q}><CardContent className="p-4"><h3 className="flex items-start gap-2 font-bold"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{faq.q}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{faq.a}</p></CardContent></Card>)}</div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><LifeBuoy className="h-5 w-5 text-primary" />التواصل مع الدعم الفني</CardTitle><CardDescription>قنوات التواصل المعتمدة من إدارة المؤسسة.</CardDescription></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground"><p>للحصول على مساعدة مباشرة، تواصل مع مسؤول النظام أو مدير المؤسسة عبر قناة الدعم المعتمدة لديكم.</p><p>لم يتم إدراج رقم هاتف أو بريد غير موثق داخل النظام.</p><Button variant="outline" className="w-full" onClick={() => void copyDiagnostics()}>نسخ ملخص البلاغ الفني</Button></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Globe className="h-5 w-5 text-primary" />إرشادات عند الإبلاغ عن مشكلة</CardTitle><CardDescription>ساعد فريق الدعم على تحديد السبب بسرعة.</CardDescription></CardHeader><CardContent><ul className="list-disc space-y-2 pr-5 text-sm leading-6 text-muted-foreground"><li>اذكر اسم الصفحة والوقت التقريبي والخطوات التي سبقت المشكلة.</li><li>أرفق ملخص التشخيص غير الحساس فقط.</li><li>لا ترسل كلمة المرور أو رمز التحقق أو مفاتيح Supabase أو بيانات البطاقات البنكية.</li><li>إذا تعلقت المشكلة بفاتورة أو مخزون، لا تكرر العملية قبل مراجعة سجلها وحالتها.</li></ul></CardContent></Card>
      </section>
    </div>
  );
}
