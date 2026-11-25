-- Notify company management about actual customer-credit invoice and collection events.
-- This uses the existing sales/customer_payments ledger and notifications table.
-- It does not invent invoice due dates or modify financial records.
BEGIN;

CREATE OR REPLACE FUNCTION private.notify_on_customer_credit_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
DECLARE
  v_company_id uuid;
  v_actor_id uuid;
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
BEGIN
  IF NEW.status <> 'completed'
     OR NEW.customer_id IS NULL
     OR NEW.payment_method NOT IN ('credit', 'mixed') THEN
    RETURN NEW;
  END IF;

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

  -- The existing notification company-scope trigger requires an owner/manager actor.
  PERFORM set_config('request.jwt.claim.sub', v_actor_id::text, true);

  INSERT INTO public.notifications (
    tenant_id, company_id, audience_type, kind, urgency,
    title, body, payload, action_path, action_label, created_by
  )
  VALUES
  (
    NEW.tenant_id, v_company_id, 'owner', 'customer_credit_invoice_issued', 'urgent',
    'فاتورة عميل آجلة أو جزئية',
    'تم إصدار الفاتورة رقم ' || NEW.invoice_no::text ||
      ' للعميل مع وجود رصيد مستحق.',
    jsonb_build_object(
      'sale_id', NEW.id,
      'invoice_no', NEW.invoice_no,
      'customer_id', NEW.customer_id,
      'branch_id', NEW.branch_id,
      'total', NEW.total,
      'payment_method', NEW.payment_method
    ),
    '/sales/' || NEW.id::text,
    'عرض الفاتورة',
    v_actor_id
  ),
  (
    NEW.tenant_id, v_company_id, 'manager', 'customer_credit_invoice_issued', 'urgent',
    'فاتورة عميل آجلة أو جزئية',
    'تم إصدار الفاتورة رقم ' || NEW.invoice_no::text ||
      ' للعميل مع وجود رصيد مستحق.',
    jsonb_build_object(
      'sale_id', NEW.id,
      'invoice_no', NEW.invoice_no,
      'customer_id', NEW.customer_id,
      'branch_id', NEW.branch_id,
      'total', NEW.total,
      'payment_method', NEW.payment_method
    ),
    '/sales/' || NEW.id::text,
    'عرض الفاتورة',
    v_actor_id
  );

  PERFORM set_config('request.jwt.claim.sub', COALESCE(v_previous_sub, ''), true);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(v_previous_sub, ''), true);
  RAISE WARNING 'Customer invoice notification was skipped for sale/payment event: %', SQLERRM;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.notify_on_customer_credit_invoice()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_customer_credit_invoice ON public.sales;
CREATE TRIGGER trg_notify_customer_credit_invoice
AFTER INSERT ON public.sales
FOR EACH ROW
EXECUTE FUNCTION private.notify_on_customer_credit_invoice();


CREATE OR REPLACE FUNCTION private.notify_on_customer_invoice_collection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
DECLARE
  v_sale record;
  v_actor_id uuid;
  v_paid numeric(14,2);
  v_refunded numeric(14,2);
  v_remaining numeric(14,2);
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
  v_kind text;
  v_title text;
  v_body text;
BEGIN
  SELECT s.id, s.tenant_id, s.branch_id, s.invoice_no, s.total,
         b.company_id
    INTO v_sale
  FROM public.sales s
  JOIN public.branches b
    ON b.id = s.branch_id
   AND b.tenant_id = s.tenant_id
  WHERE s.id = NEW.sale_id
    AND s.tenant_id = NEW.tenant_id
    AND s.customer_id = NEW.customer_id
    AND s.status = 'completed';

  IF NOT FOUND OR v_sale.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE((SELECT sum(p.amount) FROM public.payments p
              WHERE p.sale_id = v_sale.id AND p.tenant_id = v_sale.tenant_id), 0)
    + COALESCE((SELECT sum(cp.amount) FROM public.customer_payments cp
                WHERE cp.sale_id = v_sale.id AND cp.tenant_id = v_sale.tenant_id), 0)
    INTO v_paid;

  SELECT COALESCE(sum(r.total), 0)
    INTO v_refunded
  FROM public.sale_refunds r
  WHERE r.sale_id = v_sale.id
    AND r.tenant_id = v_sale.tenant_id;

  v_remaining := greatest(round(v_sale.total - v_paid - v_refunded, 2), 0);

  SELECT ur.user_id
    INTO v_actor_id
  FROM public.user_roles ur
  WHERE ur.tenant_id = v_sale.tenant_id
    AND ur.role IN ('owner', 'manager')
    AND (
      ur.company_id = v_sale.company_id
      OR (ur.role = 'owner' AND ur.company_id IS NULL)
    )
  ORDER BY CASE WHEN ur.company_id = v_sale.company_id THEN 0 ELSE 1 END,
           ur.created_at
  LIMIT 1;

  IF v_actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_remaining <= 0 THEN
    v_kind := 'customer_invoice_balance_cleared';
    v_title := 'تم إغلاق رصيد الفاتورة';
    v_body := 'اكتمل تسوية رصيد الفاتورة رقم ' || v_sale.invoice_no::text || '.';
  ELSE
    v_kind := 'customer_invoice_payment_received';
    v_title := 'تم استلام دفعة على فاتورة';
    v_body := 'تم استلام دفعة بقيمة ' ||
      trim(to_char(NEW.amount, 'FM999999999990D00')) ||
      ' على الفاتورة رقم ' || v_sale.invoice_no::text ||
      '، والمتبقي ' || trim(to_char(v_remaining, 'FM999999999990D00')) || '.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_actor_id::text, true);

  INSERT INTO public.notifications (
    tenant_id, company_id, audience_type, kind, urgency,
    title, body, payload, action_path, action_label, created_by
  )
  VALUES
  (
    v_sale.tenant_id, v_sale.company_id, 'owner', v_kind, 'normal',
    v_title, v_body,
    jsonb_build_object(
      'sale_id', v_sale.id,
      'invoice_no', v_sale.invoice_no,
      'customer_payment_id', NEW.id,
      'branch_id', v_sale.branch_id,
      'payment_amount', NEW.amount,
      'remaining_balance', v_remaining
    ),
    '/sales/' || v_sale.id::text,
    'عرض الفاتورة',
    v_actor_id
  ),
  (
    v_sale.tenant_id, v_sale.company_id, 'manager', v_kind, 'normal',
    v_title, v_body,
    jsonb_build_object(
      'sale_id', v_sale.id,
      'invoice_no', v_sale.invoice_no,
      'customer_payment_id', NEW.id,
      'branch_id', v_sale.branch_id,
      'payment_amount', NEW.amount,
      'remaining_balance', v_remaining
    ),
    '/sales/' || v_sale.id::text,
    'عرض الفاتورة',
    v_actor_id
  );

  PERFORM set_config('request.jwt.claim.sub', COALESCE(v_previous_sub, ''), true);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(v_previous_sub, ''), true);
  RAISE WARNING 'Customer invoice notification was skipped for sale/payment event: %', SQLERRM;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.notify_on_customer_invoice_collection()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_customer_invoice_collection ON public.customer_payments;
CREATE TRIGGER trg_notify_customer_invoice_collection
AFTER INSERT ON public.customer_payments
FOR EACH ROW
EXECUTE FUNCTION private.notify_on_customer_invoice_collection();

COMMIT;
