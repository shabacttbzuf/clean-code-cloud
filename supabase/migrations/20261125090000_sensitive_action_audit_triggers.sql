-- Extend the existing audit trail to permission-default, refund/return,
-- inventory, payment, HR and marketing mutations. Existing triggers are kept.
BEGIN;

DO $audit$
DECLARE
  v_table text;
  v_relation regclass;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'attendance',
    'payroll_items',
    'cash_sessions',
    'payments',
    'inventory_transactions',
    'purchase_items',
    'sale_items',
    'sale_refunds',
    'sale_refund_items',
    'purchase_returns',
    'purchase_return_items',
    'marketing_campaigns',
    'promotional_offers'
  ]
  LOOP
    v_relation := to_regclass(format('public.%I', v_table));
    IF v_relation IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgrelid = v_relation
        AND tgfoid = to_regprocedure('public.log_audit_change()')
        AND NOT tgisinternal
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.log_audit_change()',
        'trg_audit_' || v_table,
        v_table
      );
    END IF;
  END LOOP;
END;
$audit$;

-- Global built-in role defaults have tenant_id NULL and are platform-level.
-- Audit only tenant-specific custom-role permission changes here.
DROP TRIGGER IF EXISTS trg_audit_role_permissions_insert_update ON public.role_permissions;
CREATE TRIGGER trg_audit_role_permissions_insert_update
AFTER INSERT OR UPDATE ON public.role_permissions
FOR EACH ROW
WHEN (NEW.tenant_id IS NOT NULL)
EXECUTE FUNCTION public.log_audit_change();

DROP TRIGGER IF EXISTS trg_audit_role_permissions_delete ON public.role_permissions;
CREATE TRIGGER trg_audit_role_permissions_delete
AFTER DELETE ON public.role_permissions
FOR EACH ROW
WHEN (OLD.tenant_id IS NOT NULL)
EXECUTE FUNCTION public.log_audit_change();

COMMIT;
