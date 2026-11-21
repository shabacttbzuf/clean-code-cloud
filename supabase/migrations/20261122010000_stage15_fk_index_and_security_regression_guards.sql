-- Stage 15: cover the remaining foreign-key lookup paths reported by
-- Supabase's performance advisor. These indexes do not alter data or access
-- policies; they reduce parent-row delete/update checks and scoped joins.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_kitchen_order_events_actor_id_fk
  ON public.kitchen_order_events (actor_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_order_events_branch_id_fk
  ON public.kitchen_order_events (branch_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_order_events_tenant_id_fk
  ON public.kitchen_order_events (tenant_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_orders_branch_id_fk
  ON public.kitchen_orders (branch_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_rejected_by_fk
  ON public.leave_requests (rejected_by);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_branch_id_fk
  ON public.restaurant_tables (branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_table_id_fk
  ON public.sales (table_id);

COMMIT;
