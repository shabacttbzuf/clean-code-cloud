-- Atomic payroll rejection and explicit rejected state.
BEGIN;

DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.payroll_runs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.payroll_runs DROP CONSTRAINT %I',
      constraint_row.conname
    );
  END LOOP;
END;
$$;

ALTER TABLE public.payroll_runs
  ADD CONSTRAINT payroll_runs_status_check
  CHECK (status IN ('draft', 'approved', 'paid', 'cancelled', 'rejected'))
  NOT VALID;

ALTER TABLE public.payroll_runs
  VALIDATE CONSTRAINT payroll_runs_status_check;

CREATE OR REPLACE FUNCTION public.reject_payroll_run(
  _run_id uuid,
  _tenant_id uuid,
  _reason text,
  _actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  locked_run public.payroll_runs%ROWTYPE;
BEGIN
  IF _reason IS NULL OR length(btrim(_reason)) = 0 OR length(_reason) > 500 THEN
    RAISE EXCEPTION 'A rejection reason between 1 and 500 characters is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO locked_run
    FROM public.payroll_runs
   WHERE id = _run_id
     AND tenant_id = _tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run not found in the requested tenant'
      USING ERRCODE = 'P0002';
  END IF;

  IF locked_run.status NOT IN ('draft', 'approved') THEN
    RAISE EXCEPTION 'Only draft or approved payroll runs can be rejected'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.bonuses
     SET payroll_item_id = NULL
   WHERE payroll_item_id IN (
     SELECT id FROM public.payroll_items WHERE payroll_run_id = _run_id
   );

  UPDATE public.deductions
     SET payroll_item_id = NULL
   WHERE payroll_item_id IN (
     SELECT id FROM public.payroll_items WHERE payroll_run_id = _run_id
   );

  DELETE FROM public.payroll_items
   WHERE payroll_run_id = _run_id
     AND tenant_id = _tenant_id;

  UPDATE public.payroll_runs
     SET status = 'rejected',
         rejection_reason = _reason,
         rejected_by = _actor_id,
         rejected_at = now(),
         total_gross = 0,
         total_net = 0,
         total_bonuses = 0,
         total_deductions = 0,
         updated_at = now()
   WHERE id = _run_id
     AND tenant_id = _tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_payroll_run(uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_payroll_run(uuid, uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reject_payroll_run(uuid, uuid, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reject_payroll_run(uuid, uuid, text, uuid) TO service_role;

COMMIT;
