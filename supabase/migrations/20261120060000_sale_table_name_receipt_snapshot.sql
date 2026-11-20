-- Preserve the table name on the sale as an immutable receipt snapshot.
BEGIN;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS table_name_snapshot text;

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

REVOKE ALL ON FUNCTION private.capture_sale_table_name_snapshot() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_capture_sale_table_name_snapshot ON public.sales;
CREATE TRIGGER trg_capture_sale_table_name_snapshot
BEFORE INSERT OR UPDATE OF table_id ON public.sales
FOR EACH ROW EXECUTE FUNCTION private.capture_sale_table_name_snapshot();

COMMIT;
