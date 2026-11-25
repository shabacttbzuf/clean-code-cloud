import { lazy, Suspense, useEffect, useRef, useState } from "react";

const DashboardCharts = lazy(() =>
  import("./dashboard-charts").then((module) => ({ default: module.DashboardCharts })),
);

export function DeferredDashboardCharts({
  trend,
  byCategory,
}: {
  trend: Array<{ day: string; total: number }>;
  byCategory: Array<{ name: string; value: number; color: string | null }>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || shouldLoad) return;
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div ref={containerRef} className="grid min-h-[17rem] gap-4 lg:grid-cols-3" aria-busy={!shouldLoad}>
      {shouldLoad ? (
        <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted lg:col-span-3" role="status">جارٍ تحميل الرسوم البيانية...</div>}>
          <DashboardCharts trend={trend} byCategory={byCategory} />
        </Suspense>
      ) : (
        <div className="h-64 rounded-xl bg-muted/40 lg:col-span-3" aria-hidden="true" />
      )}
    </div>
  );
}
