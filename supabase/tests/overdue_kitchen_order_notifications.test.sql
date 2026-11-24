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

SELECT ok(
  to_regclass('cron.job') IS NULL
  OR EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname='notify-overdue-kitchen-orders'
      AND schedule='* * * * *'
      AND command LIKE '%private.emit_overdue_kitchen_order_notifications%'
  ),
  'The minute scheduler is registered when pg_cron is available'
);

SELECT * FROM finish();
ROLLBACK;
