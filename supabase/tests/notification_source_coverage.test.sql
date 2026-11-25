BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(15);

SELECT ok(
  to_regprocedure('private.can_read_notification(uuid)') IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='private.can_read_notification(uuid)'::regprocedure
      AND p.prosecdef
      AND array_to_string(p.proconfig, ',') LIKE '%search_path=pg_catalog, public, private, pg_temp%'
  ),
  'Notification visibility is centralized in a pinned SECURITY DEFINER predicate'
);

SELECT ok(
  has_function_privilege('authenticated', 'private.can_read_notification(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'private.can_read_notification(uuid)', 'EXECUTE')
  ,
  'Only authenticated callers can evaluate notification visibility'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='notifications_select_scoped' AND cmd='SELECT')
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='notifications' AND cmd='SELECT'
      AND policyname IN ('company_scope_notifications_select','notifications_read','permission_gate_notifications_select')
  ),
  'Legacy permissive notification SELECT policies no longer bypass audience scope'
);

SELECT ok(
  has_function_privilege('authenticated', 'private.can_manage_notification_scope(uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'private.can_manage_notification_scope(uuid,uuid)', 'EXECUTE'),
  'Notification management helper is not exposed to anonymous callers'
);

SELECT ok(
  (SELECT count(*) = 3 FROM pg_policies
   WHERE schemaname='public' AND tablename='notifications'
     AND policyname IN ('notifications_insert_scoped','notifications_update_scoped','notifications_delete_scoped'))
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='notifications'
      AND policyname IN ('company_scope_notifications_insert','company_scope_notifications_update','company_scope_notifications_delete',
                         'notifications_admin_insert','notifications_admin_update','notifications_admin_delete',
                         'permission_gate_notifications_insert','permission_gate_notifications_update','permission_gate_notifications_delete')
  ),
  'Notification writes use a single company-scoped policy per operation without permissive OR bypasses'
);


SELECT ok(
  (SELECT count(*) = 4 FROM pg_policies
   WHERE schemaname='public' AND tablename='notification_reads'
     AND policyname IN ('notification_reads_select_scoped','notification_reads_insert_scoped','notification_reads_update_scoped','notification_reads_delete_scoped')),
  'Read receipts are scoped to the authenticated user and a visible parent notification'
);

SELECT ok(
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='notification_reads' AND column_name='archived_at' AND data_type='timestamp with time zone'),
  'Per-user archive state is stored on the existing receipt row'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.sales'::regclass AND tgname='trg_notify_sale_operational_events' AND NOT tgisinternal)
  AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.marketing_campaigns'::regclass AND tgname='trg_notify_campaign_activation' AND NOT tgisinternal)
  AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.promotional_offers'::regclass AND tgname='trg_notify_promotion_activation' AND NOT tgisinternal)
  AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.profiles'::regclass AND tgname='trg_notify_admin_account_status_events' AND NOT tgisinternal),
  'Sales, campaigns, promotions, and account lifecycle events are connected to real source tables'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.inventory'::regclass AND tgname='trg_notify_on_low_stock' AND NOT tgisinternal)
  AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.leave_requests'::regclass AND tgname='trg_notify_leave_request_events' AND NOT tgisinternal)
  AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.kitchen_orders'::regclass AND tgname='trg_notify_branch_kitchen_ready' AND NOT tgisinternal)
  AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.sales'::regclass AND tgname='trg_notify_customer_credit_invoice' AND NOT tgisinternal)
  AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.customer_payments'::regclass AND tgname='trg_notify_customer_invoice_collection' AND NOT tgisinternal),
  'Existing stock, HR, kitchen, invoice, and collection event sources remain attached'
);

SELECT ok(
  to_regclass('public.notifications_sale_event_dedupe_idx') IS NOT NULL
  AND to_regclass('public.notifications_campaign_event_dedupe_idx') IS NOT NULL
  AND to_regclass('public.notifications_offer_event_dedupe_idx') IS NOT NULL
  AND to_regclass('public.notifications_profile_event_dedupe_idx') IS NOT NULL,
  'Event-level unique indexes protect against duplicate notifications on retries and concurrency'
);

SELECT ok(
  NOT has_function_privilege('anon', 'private.notify_sale_operational_events()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'private.notify_sale_operational_events()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'private.notify_campaign_activation()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'private.notify_campaign_activation()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'private.notify_promotion_activation()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'private.notify_promotion_activation()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'private.notify_admin_account_status_events()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'private.notify_admin_account_status_events()', 'EXECUTE'),
  'Source trigger functions cannot be called directly by API roles'
);

SELECT ok(
  pg_get_functiondef('private.notify_sale_operational_events()'::regprocedure) NOT LIKE '%NEW.total%'
  AND pg_get_functiondef('private.notify_sale_operational_events()'::regprocedure) NOT LIKE '%customer_phone%'
  AND pg_get_functiondef('private.notify_admin_account_status_events()'::regprocedure) NOT LIKE '%national_id%'
  AND pg_get_functiondef('private.notify_admin_account_status_events()'::regprocedure) NOT LIKE '%last_ip%',
  'Operational and administrative notifications omit financial totals and personal identifiers'
);


SELECT ok(
  pg_get_functiondef('private.notify_sale_operational_events()'::regprocedure) LIKE '%v_audience := ''branch''%'
  AND pg_get_functiondef('private.notify_sale_operational_events()'::regprocedure) LIKE '%v_audience := ''manager''%'
  AND pg_get_functiondef('private.can_read_notification(uuid)'::regprocedure) LIKE '%sales.view%',
  'Sales and refund events target branch staff or company managers with sales permission'
);

SELECT ok(
  pg_get_functiondef('private.notify_campaign_activation()'::regprocedure) LIKE '%''manager''%'
  AND pg_get_functiondef('private.notify_promotion_activation()'::regprocedure) LIKE '%''branch''%'
  AND pg_get_functiondef('private.notify_promotion_activation()'::regprocedure) LIKE '%''manager''%'
  AND pg_get_functiondef('private.can_read_notification(uuid)'::regprocedure) LIKE '%ads.manage%'
  AND pg_get_functiondef('private.can_read_notification(uuid)'::regprocedure) LIKE '%promotions.manage%',
  'Campaign and promotion events target the company or branch manager audience with feature permissions'
);

SELECT ok(
  pg_get_functiondef('private.notify_admin_account_status_events()'::regprocedure) LIKE '%''manager''%'
  AND pg_get_functiondef('private.notify_leave_request_events()'::regprocedure) LIKE '%''owner''%'
  AND pg_get_functiondef('private.notify_leave_request_events()'::regprocedure) LIKE '%''user''%'
  AND pg_get_functiondef('private.notify_branch_when_kitchen_ready()'::regprocedure) LIKE '%''branch''%'
  AND pg_get_functiondef('private.notify_on_low_stock()'::regprocedure) LIKE '%''branch''%'
  AND pg_get_functiondef('private.notify_on_customer_credit_invoice()'::regprocedure) LIKE '%''owner''%'
  AND pg_get_functiondef('private.notify_on_customer_invoice_collection()'::regprocedure) LIKE '%''manager''%',
  'Administrative, HR, kitchen, stock, invoice and collection sources define scoped recipients'
);

SELECT * FROM finish();
ROLLBACK;
