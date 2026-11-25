-- Allow explicitly authorized custom roles to read audit and login history.
-- Existing restrictive company/branch boundaries and action gates remain active.
BEGIN;

DROP POLICY IF EXISTS audit_logs_permission_read ON public.audit_logs;
CREATE POLICY audit_logs_permission_read
ON public.audit_logs
FOR SELECT TO authenticated
USING (
  public.has_permission((select auth.uid()), tenant_id, 'audit.view')
);

DROP POLICY IF EXISTS login_history_permission_read ON public.login_history;
CREATE POLICY login_history_permission_read
ON public.login_history
FOR SELECT TO authenticated
USING (
  tenant_id IS NOT NULL
  AND public.has_permission((select auth.uid()), tenant_id, 'login_history.view')
);

COMMIT;
