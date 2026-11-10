
-- Restrict trigger-only SECURITY DEFINER functions from direct API execution.
REVOKE EXECUTE ON FUNCTION public.log_audit_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_leave_self_approval() FROM PUBLIC, anon, authenticated;

-- This function updates only the current caller's profile via auth.uid().
REVOKE EXECUTE ON FUNCTION public.touch_last_login() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_last_login() TO authenticated;

-- These SECURITY DEFINER helpers are used by authenticated RLS policies.
REVOKE EXECUTE ON FUNCTION public.user_has_role_in_tenant(uuid, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_role_in_tenant(uuid, uuid, text[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.was_hired_by(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.was_hired_by(uuid, uuid, uuid) TO authenticated;
