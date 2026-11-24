-- Create low-stock alerts from real inventory threshold crossings.
-- The trigger is transaction-bound to inventory writes and does not mutate stock.
BEGIN;

CREATE OR REPLACE FUNCTION private.notify_on_low_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
DECLARE
  v_product public.products%ROWTYPE;
  v_company_id uuid;
  v_crossed_threshold boolean := false;
BEGIN
  IF NEW.quantity IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_product
  FROM public.products
  WHERE id = NEW.product_id
    AND tenant_id = NEW.tenant_id;

  IF NOT FOUND OR v_product.min_stock IS NULL OR v_product.min_stock <= 0 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_crossed_threshold := NEW.quantity <= v_product.min_stock;
  ELSE
    v_crossed_threshold := NEW.quantity <= v_product.min_stock
      AND OLD.quantity > v_product.min_stock;
  END IF;

  IF NOT v_crossed_threshold THEN
    RETURN NEW;
  END IF;

  SELECT b.company_id INTO v_company_id
  FROM public.branches b
  WHERE b.id = NEW.branch_id
    AND b.tenant_id = NEW.tenant_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (
    tenant_id, company_id, audience_type, audience_id,
    kind, urgency, title, body, payload, action_path, action_label, created_by
  )
  VALUES (
    NEW.tenant_id,
    v_company_id,
    'branch',
    NEW.branch_id,
    'low_stock',
    CASE WHEN NEW.quantity <= 0 THEN 'critical' ELSE 'urgent' END,
    'تنبيه انخفاض المخزون',
    'المنتج ' || v_product.name || ' وصل إلى ' ||
      trim(to_char(NEW.quantity, 'FM999999999990D999')) ||
      '، والحد الأدنى المحدد ' ||
      trim(to_char(v_product.min_stock, 'FM999999999990D999')) || '.',
    jsonb_build_object(
      'product_id', NEW.product_id,
      'branch_id', NEW.branch_id,
      'quantity', NEW.quantity,
      'min_stock', v_product.min_stock
    ),
    '/inventory',
    'فتح المخزون',
    auth.uid()
  );

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.notify_on_low_stock() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_on_low_stock ON public.inventory;
CREATE TRIGGER trg_notify_on_low_stock
AFTER INSERT OR UPDATE OF quantity ON public.inventory
FOR EACH ROW
EXECUTE FUNCTION private.notify_on_low_stock();

COMMIT;
