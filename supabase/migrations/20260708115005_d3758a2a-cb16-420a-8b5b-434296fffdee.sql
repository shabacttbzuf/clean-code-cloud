
-- Create an internal schema that is NOT exposed by the Data API
CREATE SCHEMA IF NOT EXISTS private;

-- Allow authenticated to use the schema (needed so RLS can call the functions)
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- Move RLS helper functions out of the exposed 'public' schema.
-- Policies reference functions by OID, so they follow the function automatically.
ALTER FUNCTION public.has_role(uuid, uuid, app_role) SET SCHEMA private;
ALTER FUNCTION public.is_tenant_admin(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.is_tenant_member(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.can_access_branch(uuid, uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.can_manage_expenses(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.user_branch_id(uuid, uuid) SET SCHEMA private;

-- Keep search_path clean now that they live in a different schema
ALTER FUNCTION private.has_role(uuid, uuid, app_role) SET search_path = public, private;
ALTER FUNCTION private.is_tenant_admin(uuid, uuid) SET search_path = public, private;
ALTER FUNCTION private.is_tenant_member(uuid, uuid) SET search_path = public, private;
ALTER FUNCTION private.can_access_branch(uuid, uuid, uuid) SET search_path = public, private;
ALTER FUNCTION private.can_manage_expenses(uuid, uuid) SET search_path = public, private;
ALTER FUNCTION private.user_branch_id(uuid, uuid) SET search_path = public, private;

-- Ensure only the roles that need it can execute
REVOKE EXECUTE ON FUNCTION private.has_role(uuid, uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.is_tenant_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.is_tenant_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.can_access_branch(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.can_manage_expenses(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.user_branch_id(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.has_role(uuid, uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_tenant_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_tenant_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_branch(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_expenses(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.user_branch_id(uuid, uuid) TO authenticated;
