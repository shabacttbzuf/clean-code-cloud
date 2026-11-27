-- Keep kitchen-ready notification delivery from blocking the operational kitchen status update.
-- Use an authorized company actor for notification scope validation, and fail open on delivery errors.
BEGIN;

CREATE OR REPLACE FUNCTION private.notify_branch_when_kitchen_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
DECLARE
  v_company_id uuid;
  v_actor_id uuid;
  v_invoice_no integer;
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
BEGIN
  IF NEW.status = 'ready' AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT b.company_id
      INTO v_company_id
    FROM public.branches b
    WHERE b.id = NEW.branch_id
      AND b.tenant_id = NEW.tenant_id;

    IF v_company_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT ur.user_id
      INTO v_actor_id
    FROM public.user_roles ur
    WHERE ur.tenant_id = NEW.tenant_id
      AND ur.role IN ('owner', 'manager')
      AND (
        ur.company_id = v_company_id
        OR (ur.role = 'owner' AND ur.company_id IS NULL)
      )
    ORDER BY CASE WHEN ur.company_id = v_company_id THEN 0 ELSE 1 END,
             ur.created_at
    LIMIT 1;

    IF v_actor_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT s.invoice_no
      INTO v_invoice_no
    FROM public.sales s
    WHERE s.id = NEW.sale_id
      AND s.tenant_id = NEW.tenant_id;

    PERFORM set_config('request.jwt.claim.sub', v_actor_id::text, true);

    INSERT INTO public.notifications (
      tenant_id, company_id, audience_type, audience_id, kind, urgency,
      title, body, payload, action_path, action_label, created_by
    )
    VALUES (
      NEW.tenant_id, v_company_id, 'branch', NEW.branch_id,
      'kitchen_order_ready', 'normal',
      'الطلب جاهز للاستلام',
      'الطلب رقم ' || COALESCE(v_invoice_no::text, '—') || ' أصبح جاهزاً.',
      jsonb_build_object(
        'sale_id', NEW.sale_id,
        'kitchen_order_id', NEW.id,
        'invoice_no', v_invoice_no,
        'branch_id', NEW.branch_id
      ),
      '/kitchen',
      'فتح شاشة المطبخ',
      v_actor_id
    );

    PERFORM set_config('request.jwt.claim.sub', COALESCE(v_previous_sub, ''), true);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(v_previous_sub, ''), true);
  RAISE WARNING 'Kitchen-ready notification was skipped: %', SQLERRM;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.notify_branch_when_kitchen_ready()
  FROM PUBLIC, anon, authenticated;

COMMIT;
