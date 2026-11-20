-- Preserve the table name on the sale as an immutable receipt snapshot.
BEGIN;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS table_name_snapshot text,
  ADD COLUMN IF NOT EXISTS customer_name_snapshot text,
  ADD COLUMN IF NOT EXISTS customer_phone_snapshot text;

-- A user who can view a sale may see payments attached to that sale
-- without granting access to the customer's unrelated ledger entries.
DROP POLICY IF EXISTS sale_permission_customer_payments_select ON public.customer_payments;
CREATE POLICY sale_permission_customer_payments_select
  ON public.customer_payments
  AS PERMISSIVE
  FOR SELECT TO authenticated
  USING (
    private.has_permission((select auth.uid()),tenant_id,'sales.view')
    AND EXISTS (
      SELECT 1 FROM public.sales s
       WHERE s.id=customer_payments.sale_id
         AND s.tenant_id=customer_payments.tenant_id
         AND private.can_access_branch((select auth.uid()),s.tenant_id,s.branch_id)
    )
  );

CREATE OR REPLACE FUNCTION private.capture_sale_table_name_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
BEGIN
  IF NEW.table_id IS NULL THEN
    NEW.table_name_snapshot := NULL;
  ELSE
    SELECT t.name INTO NEW.table_name_snapshot
      FROM public.restaurant_tables t
     WHERE t.id=NEW.table_id
       AND t.tenant_id=NEW.tenant_id
       AND t.branch_id=NEW.branch_id;
    IF NEW.table_name_snapshot IS NULL THEN
      RAISE EXCEPTION 'Selected table does not belong to this sale branch'
        USING ERRCODE='23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.capture_sale_customer_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
BEGIN
  IF NEW.order_type='delivery' THEN
    NEW.customer_name_snapshot := nullif(btrim(NEW.delivery_customer_name),'');
    NEW.customer_phone_snapshot := nullif(btrim(NEW.delivery_customer_phone),'');
  ELSIF NEW.customer_id IS NOT NULL THEN
    SELECT c.name,c.phone
      INTO NEW.customer_name_snapshot,NEW.customer_phone_snapshot
      FROM public.customers c
     WHERE c.id=NEW.customer_id AND c.tenant_id=NEW.tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Customer does not belong to this sale tenant'
        USING ERRCODE='23503';
    END IF;
  ELSE
    NEW.customer_name_snapshot := NULL;
    NEW.customer_phone_snapshot := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.capture_sale_customer_snapshot() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_capture_sale_customer_snapshot ON public.sales;
CREATE TRIGGER trg_capture_sale_customer_snapshot
BEFORE INSERT OR UPDATE OF customer_id,order_type,delivery_customer_name,delivery_customer_phone ON public.sales
FOR EACH ROW EXECUTE FUNCTION private.capture_sale_customer_snapshot();

REVOKE ALL ON FUNCTION private.capture_sale_table_name_snapshot() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_capture_sale_table_name_snapshot ON public.sales;
CREATE TRIGGER trg_capture_sale_table_name_snapshot
BEFORE INSERT OR UPDATE OF table_id ON public.sales
FOR EACH ROW EXECUTE FUNCTION private.capture_sale_table_name_snapshot();

COMMIT;
