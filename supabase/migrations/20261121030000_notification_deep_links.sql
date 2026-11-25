-- Stage 10: safe internal notification deep links and actionable kitchen alerts.
BEGIN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS action_path text,
  ADD COLUMN IF NOT EXISTS action_label text;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='notifications_action_path_internal_check'
      AND conrelid='public.notifications'::regclass
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_action_path_internal_check
      CHECK (
        action_path IS NULL OR (
          char_length(action_path) BETWEEN 1 AND 400
          AND action_path LIKE '/%'
          AND action_path NOT LIKE '//%'
          AND action_path !~* '^[a-z][a-z0-9+.-]*:'
          AND position(chr(92) in action_path)=0
          AND position(chr(10) in action_path)=0
          AND position(chr(13) in action_path)=0
          AND action_path !~ '[[:cntrl:]]'
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='notifications_action_label_length_check'
      AND conrelid='public.notifications'::regclass
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_action_label_length_check
      CHECK (action_label IS NULL OR char_length(btrim(action_label)) BETWEEN 1 AND 60);
  END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS notifications_tenant_action_created_idx
  ON public.notifications(tenant_id, created_at DESC)
  WHERE action_path IS NOT NULL;

-- Backfill a safe internal destination for existing kitchen-ready alerts.
UPDATE public.notifications
SET action_path='/kitchen',
    action_label='فتح شاشة المطبخ'
WHERE kind='kitchen_order_ready'
  AND action_path IS NULL
  AND payload ? 'kitchen_order_id';

-- Keep the existing event trigger and payload contract, adding a permission-guarded deep link.
CREATE OR REPLACE FUNCTION private.notify_branch_when_kitchen_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
DECLARE
  v_company_id uuid;
  v_invoice_no integer;
  v_actor_id uuid;
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
BEGIN
  IF NEW.status='ready' AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT company_id INTO v_company_id FROM public.branches
     WHERE id=NEW.branch_id AND tenant_id=NEW.tenant_id;
    IF v_company_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT ur.user_id
      INTO v_actor_id
    FROM public.user_roles ur
    WHERE ur.tenant_id=NEW.tenant_id
      AND ur.role IN ('owner','manager')
      AND (
        ur.company_id=v_company_id
        OR (ur.role='owner' AND ur.company_id IS NULL)
      )
    ORDER BY CASE WHEN ur.company_id=v_company_id THEN 0 ELSE 1 END,
             ur.created_at
    LIMIT 1;

    IF v_actor_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT invoice_no INTO v_invoice_no FROM public.sales
     WHERE id=NEW.sale_id AND tenant_id=NEW.tenant_id;

    BEGIN
      PERFORM set_config('request.jwt.claim.sub', v_actor_id::text, true);
      INSERT INTO public.notifications
        (tenant_id,company_id,audience_type,audience_id,kind,urgency,title,body,payload,action_path,action_label,created_by)
      VALUES
        (NEW.tenant_id,v_company_id,'branch',NEW.branch_id,'kitchen_order_ready','normal',
         'الطلب جاهز للاستلام',
         'الطلب رقم '||coalesce(v_invoice_no::text,'—')||' أصبح جاهزاً.',
         jsonb_build_object('sale_id',NEW.sale_id,'kitchen_order_id',NEW.id,'invoice_no',v_invoice_no),
         '/kitchen','فتح شاشة المطبخ',v_actor_id);
      PERFORM set_config('request.jwt.claim.sub', COALESCE(v_previous_sub, ''), true);
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config('request.jwt.claim.sub', COALESCE(v_previous_sub, ''), true);
      RAISE WARNING 'Kitchen-ready notification was skipped for order %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.notify_branch_when_kitchen_ready() FROM PUBLIC,anon,authenticated;

COMMIT;
