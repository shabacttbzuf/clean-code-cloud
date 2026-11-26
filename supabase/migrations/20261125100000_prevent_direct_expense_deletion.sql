-- Financial expense records must not be physically deleted by authenticated clients.
-- A future void/reversal workflow must preserve the source record and audit trail.
BEGIN;

DROP POLICY IF EXISTS "Admins delete expenses" ON public.expenses;
DROP POLICY IF EXISTS permission_gate_expenses_delete ON public.expenses;
DROP POLICY IF EXISTS company_boundary_expenses_delete ON public.expenses;
DROP POLICY IF EXISTS permission_scope_expenses_delete ON public.expenses;
REVOKE DELETE ON TABLE public.expenses FROM PUBLIC, anon, authenticated;

COMMIT;
