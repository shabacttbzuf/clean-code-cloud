import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import "../lib/fonts";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { ThemeProvider } from "@/lib/theme";
import { Toaster } from "@/components/ui/sonner";
import { OfflineIndicator } from "@/components/offline-indicator";
import { clearOfflineCache } from "@/lib/offline-reference-cache";
import { supabase } from "@/integrations/supabase/client";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">الصفحة غير موجودة</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          الصفحة التي تبحث عنها غير موجودة أو تم نقلها.
        </p>
        <div className="mt-6">
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            العودة للرئيسية
          </a>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          حدث خطأ غير متوقع
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">حاول تحديث الصفحة أو العودة للرئيسية.</p>
        {import.meta.env.DEV ? (
          <details open className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-start" dir="ltr">
            <summary className="cursor-pointer text-xs font-semibold">Development error details</summary>
            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs text-destructive">
              {error instanceof Error ? `${error.name}: ${error.message}\n\n${error.stack ?? ""}` : String(error)}
            </pre>
          </details>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            إعادة المحاولة
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            الرئيسية
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "نظام إدارة الأعمال — Business Management System" },
      {
        name: "description",
        content:
          "نظام محاسبي احترافي متكامل لإدارة المطاعم: الفروع، المنتجات، المخزون، المبيعات، والتقارير المالية.",
      },
      { name: "author", content: "Business Management System" },
      { property: "og:title", content: "نظام إدارة الأعمال — Business Management System" },
      {
        property: "og:description",
        content: "نظام محاسبي احترافي متكامل لإدارة المطاعم: الفروع، المنتجات، المخزون، المبيعات، والتقارير المالية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "نظام إدارة الأعمال — Business Management System" },
      { name: "twitter:description", content: "نظام محاسبي احترافي متكامل لإدارة المطاعم: الفروع، المنتجات، المخزون، المبيعات، والتقارير المالية." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2546aa3a-4544-4f9b-9918-fa74af3babf6/id-preview-bf981b62--2a66f0d7-6e7a-44db-a0b3-b5233ce90fc1.lovable.app-1783506986801.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2546aa3a-4544-4f9b-9918-fa74af3babf6/id-preview-bf981b62--2a66f0d7-6e7a-44db-a0b3-b5233ce90fc1.lovable.app-1783506986801.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { name: "theme-color", content: "#102b4e" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  // Register same-origin offline support. Personalized HTML and backend data are never cached.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    const initializeOfflineSupport = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        if (cancelled || navigator.serviceWorker.controller) return;

        // The first document was loaded before the worker controlled this tab.
        // Wait for clients.claim(), then reload once so the app shell and its
        // initial assets are fetched through the active worker and cached.
        await new Promise<void>((resolve) => {
          const timeout = window.setTimeout(resolve, 2500);
          navigator.serviceWorker.addEventListener("controllerchange", () => {
            window.clearTimeout(timeout);
            resolve();
          }, { once: true });
        });
        const reloadKey = "restaurant-pwa-first-control-reload-v1";
        if (
          !cancelled &&
          navigator.serviceWorker.controller &&
          sessionStorage.getItem(reloadKey) !== "1"
        ) {
          sessionStorage.setItem(reloadKey, "1");
          window.location.reload();
        }
      } catch (error) {
        console.warn("Offline support could not be initialized:", error);
      }
    };
    void initializeOfflineSupport();
    return () => { cancelled = true; };
  }, []);

  // Global auth listener: refetch on session identity changes
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "SIGNED_IN") {
        // Never retain one user's cached tenant data for another session.
        if (event === "SIGNED_OUT") void clearOfflineCache();
        queryClient.clear();
        router.invalidate();
        return;
      }
      if (event === "USER_UPDATED") {
        router.invalidate();
        void queryClient.invalidateQueries();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <OfflineIndicator />
        <Outlet />
        <Toaster position="top-center" richColors />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
