
REVOKE EXECUTE ON FUNCTION public.user_branch_id(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_branch(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assign_invoice_no() FROM PUBLIC, anon, authenticated;
