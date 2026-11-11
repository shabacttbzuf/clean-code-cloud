-- The effective-permissions RPC only reads the caller's own membership and delegates
-- protected permission checks to the narrowly scoped has_permission SECURITY DEFINER.
ALTER FUNCTION public.get_my_permissions(uuid) SECURITY INVOKER;
