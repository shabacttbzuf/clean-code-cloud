-- Schedule the concurrency-safe scanner defined by the notification scope migration.
-- Existing cron jobs with this name are replaced idempotently.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron;
-- Supabase installations with pg_cron run the idempotent scanner every minute.
-- If pg_cron is not installed, the migration remains safe and reports that scheduling
-- must be enabled before delayed notifications can run.
DO $schedule$
DECLARE
  v_job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL
     AND to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL
     AND to_regprocedure('cron.unschedule(bigint)') IS NOT NULL THEN
    EXECUTE
      'SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = $1'
      USING 'notify-overdue-kitchen-orders';

    EXECUTE
      'SELECT cron.schedule($1, $2, $3)'
      INTO v_job_id
      USING 'notify-overdue-kitchen-orders',
            '* * * * *',
            'SELECT private.emit_overdue_kitchen_order_notifications();';
  ELSE
    RAISE NOTICE 'pg_cron is not installed; overdue kitchen-order notifications are not scheduled.';
  END IF;
END
$schedule$;
COMMIT;
