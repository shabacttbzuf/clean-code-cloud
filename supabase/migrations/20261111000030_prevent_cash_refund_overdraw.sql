-- Do not allow a cash refund to overdraw the open cashier drawer.
BEGIN;

CREATE OR REPLACE FUNCTION private.prevent_cash_refund_overdraw()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_session public.cash_sessions%ROWTYPE;
  v_available numeric(12,2);
BEGIN
  IF NEW.refund_method <> 'cash' OR COALESCE(NEW.total,0) <= 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.cash_session_id IS NULL THEN
    RAISE EXCEPTION 'Cash refunds must be linked to an open cashier session'
      USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_session
  FROM public.cash_sessions
  WHERE id=NEW.cash_session_id
    AND tenant_id=NEW.tenant_id
    AND branch_id=NEW.branch_id
    AND status='open'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cash refund session is missing, closed, or belongs to another branch'
      USING ERRCODE = '55000';
  END IF;

  SELECT round(
    v_session.opening_balance
    + COALESCE((
      SELECT sum(p.amount)
      FROM public.payments p
      JOIN public.sales s ON s.id=p.sale_id
      WHERE s.session_id=v_session.id
        AND s.tenant_id=v_session.tenant_id
        AND s.status IN ('completed','refunded')
        AND p.method='cash'
    ),0)
    - COALESCE((
      SELECT sum(r.total)
      FROM public.sale_refunds r
      WHERE r.cash_session_id=v_session.id
        AND r.tenant_id=v_session.tenant_id
        AND r.refund_method='cash'
        AND r.id IS DISTINCT FROM NEW.id
    ),0),2
  ) INTO v_available;

  IF NEW.total > v_available THEN
    RAISE EXCEPTION 'Cash refund exceeds the available drawer balance (available: %, requested: %)',
      v_available, NEW.total
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_cash_refund_overdraw() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.prevent_cash_refund_overdraw() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_prevent_cash_refund_overdraw ON public.sale_refunds;
CREATE TRIGGER trg_prevent_cash_refund_overdraw
BEFORE INSERT OR UPDATE OF total, refund_method, cash_session_id, tenant_id, branch_id
ON public.sale_refunds
FOR EACH ROW EXECUTE FUNCTION private.prevent_cash_refund_overdraw();

COMMIT;
