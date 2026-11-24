-- Emit one actionable alert when a kitchen order is still not ready 30 minutes after creation.
-- Uses the existing kitchen_orders workflow and notification/RLS pipeline; never mutates orders or sales.
BEGIN;

CREATE OR REPLACE FUNCTION private.emit_overdue_kitchen_order_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
DECLARE
  v_order record;
  v_actor_id uuid;
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
  v_created integer := 0;
BEGIN
  FOR v_order IN
    SELECT ko.id, ko.tenant_id, ko.branch_id, ko.sale_id, ko.status,
           ko.created_at, b.company_id, s.invoice_no
    FROM public.kitchen_orders ko
    JOIN public.branches b
      ON b.id = ko.branch_id
     AND b.tenant_id = ko.tenant_id
    LEFT JOIN public.sales s
      ON s.id = ko.sale_id
     AND s.tenant_id = ko.tenant_id
    WHERE ko.status IN ('new', 'preparing')
      AND ko.created_at <= now() - interval '30 minutes'
      AND b.company_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.notifications n
        WHERE n.tenant_id = ko.tenant_id
          AND n.kind = 'kitchen_order_delayed'
          AND n.payload ->> 'kitchen_order_id' = ko.id::text
      )
    ORDER BY ko.created_at
    LIMIT 500
  LOOP
    -- The existing notification company-scope trigger requires a real actor.
    -- Attribute the system-created alert to an authorized owner/manager in that same company.
    SELECT ur.user_id
      INTO v_actor_id
    FROM public.user_roles ur
    WHERE ur.tenant_id = v_order.tenant_id
      AND ur.role IN ('owner', 'manager')
      AND (
        ur.company_id = v_order.company_id
        OR (ur.role = 'owner' AND ur.company_id IS NULL)
      )
    ORDER BY CASE WHEN ur.company_id = v_order.company_id THEN 0 ELSE 1 END,
             ur.created_at
    LIMIT 1;

    IF v_actor_id IS NULL THEN
      CONTINUE;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_actor_id::text, true);

    INSERT INTO public.notifications (
      tenant_id, company_id, audience_type, audience_id,
      kind, urgency, title, body, payload, action_path, action_label
    )
    VALUES (
      v_order.tenant_id,
      v_order.company_id,
      'branch',
      v_order.branch_id,
      'kitchen_order_delayed',
      'urgent',
      'تنبيه تأخر تجهيز الطلب',
      'الطلب رقم ' || COALESCE(v_order.invoice_no::text, '—') ||
        ' لم يصبح جاهزاً خلال 30 دقيقة من إنشائه.',
      jsonb_build_object(
        'kitchen_order_id', v_order.id,
        'sale_id', v_order.sale_id,
        'branch_id', v_order.branch_id,
        'status', v_order.status,
        'created_at', v_order.created_at,
        'delay_minutes', 30
      ),
      '/kitchen',
      'فتح شاشة المطبخ'
    );

    v_created := v_created + 1;
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub', COALESCE(v_previous_sub, ''), true);
  RETURN v_created;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(v_previous_sub, ''), true);
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION private.emit_overdue_kitchen_order_notifications()
  FROM PUBLIC, anon, authenticated;

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
