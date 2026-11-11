-- Prevent opening cash sessions or recording new sales in inactive branches.
BEGIN;

CREATE OR REPLACE FUNCTION private.enforce_active_branch_for_operation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
  v_branch_id uuid;
BEGIN
  v_tenant_id := NULLIF(to_jsonb(NEW)->>'tenant_id','')::uuid;
  v_branch_id := NULLIF(to_jsonb(NEW)->>'branch_id','')::uuid;

  IF v_tenant_id IS NULL OR v_branch_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.branches
    WHERE id=v_branch_id AND tenant_id=v_tenant_id AND is_active=true
  ) THEN
    RAISE EXCEPTION 'New sales and cash sessions require an active branch in the same tenant'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_active_branch_for_operation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_active_branch_for_operation() TO service_role;

DROP TRIGGER IF EXISTS trg_sales_active_branch ON public.sales;
CREATE TRIGGER trg_sales_active_branch
BEFORE INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION private.enforce_active_branch_for_operation();

DROP TRIGGER IF EXISTS trg_cash_sessions_active_branch ON public.cash_sessions;
CREATE TRIGGER trg_cash_sessions_active_branch
BEFORE INSERT ON public.cash_sessions
FOR EACH ROW EXECUTE FUNCTION private.enforce_active_branch_for_operation();

COMMIT;
