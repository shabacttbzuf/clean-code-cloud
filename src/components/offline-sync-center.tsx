import { useCallback, useEffect, useMemo, useState } from "react";
import { Cloud, CloudOff, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useActiveTenant } from "@/hooks/use-active-tenant";
import {
  getLastOfflineSyncAt,
  listOfflineOperations,
  startOfflineSync,
  syncOfflineOperations,
  type OfflineOperation,
} from "@/lib/offline-sync";

export function OfflineSyncCenter() {
  const { user, tenantId, membership } = useActiveTenant();
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [operations, setOperations] = useState<OfflineOperation[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  const scope = useMemo(() => {
    if (!user?.id || !tenantId) return null;
    return {
      userId: user.id,
      tenantId,
      branchId: membership?.branch_id ?? null,
      companyId: membership?.company_id ?? null,
    };
  }, [user?.id, tenantId, membership?.branch_id, membership?.company_id]);

  const refresh = useCallback(async () => {
    if (!scope) {
      setOperations([]);
      return;
    }
    try {
      const [rows, syncedAt] = await Promise.all([
        listOfflineOperations(scope),
        getLastOfflineSyncAt(scope),
      ]);
      setOperations(rows);
      setLastSync(syncedAt);
      setStorageError(null);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "تعذر قراءة طابور المزامنة.");
    }
  }, [scope]);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onChange = () => void refresh();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("offline-sync:changed", onChange);
    void refresh();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("offline-sync:changed", onChange);
    };
  }, [refresh]);

  useEffect(() => {
    if (!scope) return;
    return startOfflineSync(scope);
  }, [scope]);

  const pending = operations.filter((item) => item.status === "pending" || item.status === "processing").length;
  const failed = operations.filter((item) => item.status === "failed").length;
  const conflicts = operations.filter((item) => item.status === "conflict").length;
  const completed = operations.filter((item) => item.status === "synced").length;

  const synchronize = async () => {
    if (!scope || !online || busy) return;
    setBusy(true);
    try {
      await syncOfflineOperations(scope);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!scope) return null;

  return (
    <section
      aria-label="حالة المزامنة دون اتصال"
      className="mx-3 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm shadow-sm"
      dir="rtl"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className={online ? "rounded-full bg-emerald-500/10 p-2 text-emerald-600" : "rounded-full bg-amber-500/10 p-2 text-amber-600"}>
          {online ? <Cloud className="h-5 w-5" /> : <CloudOff className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <p className="font-semibold">{online ? "متصل بالإنترنت" : "وضع عدم الاتصال"}</p>
          <p className="text-xs text-muted-foreground">
            {pending} معلّق · {failed} فاشل · {conflicts} تعارض · {completed} مكتمل
            {lastSync ? ` · آخر مزامنة: ${new Date(lastSync).toLocaleString("ar")}` : " · لم تكتمل مزامنة بعد"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {conflicts > 0 && <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-4 w-4" /> تعارض يحتاج مراجعة</span>}
        {storageError && <span role="alert" className="text-destructive">{storageError}</span>}
        <button
          type="button"
          onClick={() => void synchronize()}
          disabled={!online || busy || pending + failed === 0}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          مزامنة الآن
        </button>
      </div>
    </section>
  );
}
