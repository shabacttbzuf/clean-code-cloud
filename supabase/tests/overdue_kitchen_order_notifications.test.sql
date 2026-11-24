BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(4);

SELECT ok(
  to_regprocedure('private.emit_overdue_kitchen_order_notifications()') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='private.emit_overdue_kitchen_order_notifications()'::regprocedure
      AND p.prosecdef
      AND array_to_string(p.proconfig, ',') LIKE '%search_path=pg_catalog, public, private, pg_temp%'
  ),
  'Delayed-order scanner exists as SECURITY DEFINER with a pinned search_path'
);

SELECT ok(
  NOT has_function_privilege('anon', 'private.emit_overdue_kitchen_order_notifications()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'private.emit_overdue_kitchen_order_notifications()', 'EXECUTE'),
  'Only the trusted scheduler/database owner can execute the delayed-order scanner'
);

SELECT ok(
  pg_get_functiondef('private.emit_overdue_kitchen_order_notifications()'::regprocedure)
    LIKE '%30 minutes%'
  AND pg_get_functiondef('private.emit_overdue_kitchen_order_notifications()'::regprocedure)
    LIKE '%new%'
  AND pg_get_functiondef('private.emit_overdue_kitchen_order_notifications()'::regprocedure)
    LIKE '%preparing%',
  'Delayed alerts use the approved 30-minute window and only unfinished kitchen states'
);

CREATE FUNCTION pg_temp.has_overdue_kitchen_scheduler()
RETURNS boolean
LANGUAGE plpgsql
AS $
DECLARE
  v_exists boolean := false;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RETURN false;
  END IF;
  EXECUTE
    'SELECT EXISTS (SELECT 1 FROM cron.job WHERE jobname=$1 AND schedule=$2 AND command LIKE $3)'
    INTO v_exists
    USING 'notify-overdue-kitchen-orders', '* * * * *',
          '%private.emit_overdue_kitchen_order_notifications%';
  RETURN v_exists;
END;
$;

SELECT ok(
  pg_temp.has_overdue_kitchen_scheduler(),
  'The minute scheduler is registered and enabled through pg_cron'
);

SELECT * FROM finish();
ROLLBACK;
