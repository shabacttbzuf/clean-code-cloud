-- Mark a purchase as returned only after every received quantity has been returned.
BEGIN;

CREATE OR REPLACE FUNCTION private.mark_fully_returned_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_purchase_id uuid;
  v_purchased_quantity numeric(14,3);
  v_returned_quantity numeric(14,3);
BEGIN
  SELECT purchase_id INTO v_purchase_id
  FROM public.purchase_items
  WHERE id=NEW.purchase_item_id AND tenant_id=NEW.tenant_id;

  IF v_purchase_id IS NULL THEN
    RAISE EXCEPTION 'Purchase item not found for returned line'
      USING ERRCODE = '23503';
  END IF;

  SELECT COALESCE(sum(pi.quantity),0)
    INTO v_purchased_quantity
  FROM public.purchase_items pi
  WHERE pi.purchase_id=v_purchase_id AND pi.tenant_id=NEW.tenant_id;

  SELECT COALESCE(sum(pri.quantity),0)
    INTO v_returned_quantity
  FROM public.purchase_return_items pri
  JOIN public.purchase_returns pr ON pr.id=pri.purchase_return_id
  WHERE pr.purchase_id=v_purchase_id AND pr.tenant_id=NEW.tenant_id;

  IF v_purchased_quantity > 0 AND v_returned_quantity >= v_purchased_quantity THEN
    UPDATE public.purchases
       SET status='returned', updated_at=now()
     WHERE id=v_purchase_id AND tenant_id=NEW.tenant_id AND status='received';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.mark_fully_returned_purchase() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.mark_fully_returned_purchase() TO service_role;

DROP TRIGGER IF EXISTS trg_mark_fully_returned_purchase ON public.purchase_return_items;
CREATE TRIGGER trg_mark_fully_returned_purchase
AFTER INSERT ON public.purchase_return_items
FOR EACH ROW EXECUTE FUNCTION private.mark_fully_returned_purchase();

COMMIT;
