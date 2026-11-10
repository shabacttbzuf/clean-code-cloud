-- Tighten audit and login-history writes; scope notification reads by audience.
BEGIN;

-- Audit entries are created by SECURITY DEFINER audit triggers and trusted
-- service-role workflows only. Authenticated clients cannot forge entries.
REVOKE INSERT ON TABLE public.audit_logs FROM PUBLIC;
REVOKE INSERT ON TABLE public.audit_logs FROM anon;
REVOKE INSERT ON TABLE public.audit_logs FROM authenticated;
DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;

-- A user may create their own login event, but cannot rewrite its timestamp,
-- IP, device, or logout time after the fact.
REVOKE INSERT, UPDATE ON TABLE public.login_history FROM PUBLIC;
REVOKE INSERT, UPDATE ON TABLE public.login_history FROM anon;
REVOKE INSERT, UPDATE ON TABLE public.login_history FROM authenticated;
DROP POLICY IF EXISTS "login_history_self_write" ON public.login_history;
DROP POLICY IF EXISTS "login_history_self_update" ON public.login_history;

-- Replace tenant-wide notification visibility with audience-aware access.
DROP POLICY IF EXISTS "notifications_read" ON public.notifications;
CREATE POLICY "notifications_read"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_owner(auth.uid())
    OR (
      tenant_id IS NOT NULL
      AND (
        audience_type = 'all'
        AND private.is_tenant_member(auth.uid(), tenant_id)
        OR audience_type IN ('owner', 'manager')
        AND public.user_has_role_in_tenant(auth.uid(), tenant_id, ARRAY[audience_type])
        OR audience_type = 'user'
        AND audience_id = auth.uid()
        OR audience_type = 'branch'
        AND EXISTS (
          SELECT 1
            FROM public.user_roles ur
           WHERE ur.user_id = auth.uid()
             AND ur.tenant_id = notifications.tenant_id
             AND (
               ur.branch_id = notifications.audience_id
               OR (ur.branch_id IS NULL AND ur.role IN ('owner', 'manager'))
             )
        )
        OR audience_type = 'department'
        AND EXISTS (
          SELECT 1
            FROM public.user_roles ur
           WHERE ur.user_id = auth.uid()
             AND ur.tenant_id = notifications.tenant_id
             AND (
               ur.department_id = notifications.audience_id
               OR ur.role IN ('owner', 'manager')
             )
        )
      )
    )
  );

-- Per-user read receipts. Keep legacy notifications.read_at untouched for
-- compatibility, but use this table for all new per-user read state.
CREATE TABLE IF NOT EXISTS public.notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user
  ON public.notification_reads(user_id, read_at DESC);

GRANT SELECT, INSERT ON public.notification_reads TO authenticated;
REVOKE UPDATE ON TABLE public.notification_reads FROM authenticated;
GRANT UPDATE (read_at) ON TABLE public.notification_reads TO authenticated;
GRANT ALL ON public.notification_reads TO service_role;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notification receipts" ON public.notification_reads;
CREATE POLICY "Users read own notification receipts"
  ON public.notification_reads
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users create own notification receipts" ON public.notification_reads;
CREATE POLICY "Users create own notification receipts"
  ON public.notification_reads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM public.notifications n
       WHERE n.id = notification_id
    )
  );

DROP POLICY IF EXISTS "Users update own notification receipts" ON public.notification_reads;
CREATE POLICY "Users update own notification receipts"
  ON public.notification_reads
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMIT;
