import { supabase } from "@/integrations/supabase/client";
import { registerOfflineHandler, type OfflineOperation } from "@/lib/offline-sync";

type KitchenStatusPayload = {
  orderId: string;
  status: "preparing" | "ready" | "delivered" | "cancelled";
  notes: string | null;
  tenantId: string;
  branchId: string;
};

function parseKitchenPayload(operation: OfflineOperation): KitchenStatusPayload {
  const value = operation.payload as Partial<KitchenStatusPayload>;
  if (
    typeof value.orderId !== "string" ||
    typeof value.tenantId !== "string" ||
    typeof value.branchId !== "string" ||
    !["preparing", "ready", "delivered", "cancelled"].includes(value.status ?? "")
  ) {
    throw new Error("بيانات تحديث المطبخ المحفوظة محلياً غير صالحة.");
  }
  if (value.tenantId !== operation.scope.tenantId || value.branchId !== operation.scope.branchId) {
    throw new Error("نطاق المؤسسة أو الفرع للعملية لا يطابق بيانات الطابور.");
  }
  return value as KitchenStatusPayload;
}

registerOfflineHandler("kitchen_status", {
  offlineSafe: true,
  idempotentServerSide: true,
  send: async (operation) => {
    // A queued operation must never be replayed under a different signed-in account.
    // The server still performs its own permission and branch checks in the RPC.
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!authData.user || authData.user.id !== operation.scope.userId) {
      throw new Error("session: تغير المستخدم المسجل؛ أوقفنا مزامنة العملية حتى يعود صاحبها.");
    }

    const payload = parseKitchenPayload(operation);
    // The RPC derives the actor from auth.uid(), checks current kitchen.manage
    // permission and branch membership, and stores the idempotency result atomically.
    const { error } = await (supabase.rpc as any)("set_kitchen_order_status_idempotent", {
      _expected_actor_id: operation.scope.userId,
      _order_id: payload.orderId,
      _new_status: payload.status,
      _notes: payload.notes,
      _idempotency_key: operation.idempotencyKey,
    });
    if (error) {
      if (error.code === "40001" || /changed|transition|conflict|version/i.test(error.message ?? "")) {
        throw new Error("conflict: تغيرت حالة الطلب على الخادم؛ راجع الطلب قبل إعادة المحاولة.");
      }
      throw error;
    }
  },
});
