-- Trigger functions are invoked by table triggers for authenticated DML.
-- The private schema is not exposed through PostgREST; direct calls are not valid
-- because trigger functions can only run in trigger context.
GRANT EXECUTE ON FUNCTION private.enforce_same_tenant_foreign_key() TO authenticated, service_role;
