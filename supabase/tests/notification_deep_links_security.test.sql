BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(5);

SELECT ok(
  EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications' AND column_name='action_path')
  AND EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications' AND column_name='action_label'),
  'Notifications expose optional action path and label fields'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.notifications'::regclass
      AND conname='notifications_action_path_internal_check')
  AND EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.notifications'::regclass
      AND conname='notifications_action_label_length_check'),
  'Notification deep links are constrained to safe internal paths and short labels'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.notifications'::regclass)
  AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='notifications' AND policyname='notifications_read' AND cmd='SELECT')
  AND (SELECT relrowsecurity FROM pg_class WHERE oid='public.notification_reads'::regclass),
  'Notification audience isolation and per-user read receipts remain protected by RLS'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.kitchen_orders'::regclass
    AND tgname='trg_notify_branch_kitchen_ready' AND NOT tgisinternal)
  AND pg_get_functiondef('private.notify_branch_when_kitchen_ready()'::regprocedure) LIKE '%action_path%',
  'Kitchen-ready notifications include a safe internal kitchen deep link'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
    AND indexname='notifications_tenant_action_created_idx'),
  'Actionable notification lookup has a supporting partial index'
);

SELECT * FROM finish();
ROLLBACK;
