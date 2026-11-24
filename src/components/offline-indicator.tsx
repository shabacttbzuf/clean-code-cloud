import { useEffect, useState } from "react";

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const updateConnection = () => setIsOnline(navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[100] border-b border-amber-300 bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-950 shadow-sm"
      dir="rtl"
    >
      أنت غير متصل بالإنترنت — يمكنك مراجعة البيانات المحفوظة وإنشاء مسودات فقط؛ البيع وتحديث المخزون والعمليات المالية تتطلب اتصالاً.
    </div>
  );
}
