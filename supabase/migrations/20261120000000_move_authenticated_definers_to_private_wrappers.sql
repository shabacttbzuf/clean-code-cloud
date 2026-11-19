-- Keep existing RPC names stable while moving privileged implementations out of
-- the exposed public API schema. Public wrappers run as SECURITY INVOKER and
-- delegate to private SECURITY DEFINER implementations with a fixed search_path.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

DO $migration$
DECLARE
  r record;
  v_call_args text;
  v_wrapper_args text;
  v_return_type text;
  v_identity_args text;
  v_body text;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS identity_args,
           pg_get_function_arguments(p.oid) AS wrapper_args,
           pg_get_function_result(p.oid) AS return_type,
           p.pronargs
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ORDER BY p.proname, p.oid
  LOOP
    v_identity_args := r.identity_args;
    v_wrapper_args := r.wrapper_args;
    v_return_type := r.return_type;

    SELECT string_agg('$' || g.i::text, ', ' ORDER BY g.i)
      INTO v_call_args
    FROM generate_series(1, r.pronargs) AS g(i);

    v_body := format(
      'SELECT private.%I(%s);',
      r.proname,
      coalesce(v_call_args, '')
    );

    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET SCHEMA private',
      r.proname,
      v_identity_args
    );

    EXECUTE format(
      'REVOKE ALL ON FUNCTION private.%I(%s) FROM PUBLIC, anon',
      r.proname,
      v_identity_args
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION private.%I(%s) TO authenticated, service_role',
      r.proname,
      v_identity_args
    );

    EXECUTE format(
      'CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE sql SECURITY INVOKER SET search_path TO pg_catalog, public, private AS %L',
      r.proname,
      v_wrapper_args,
      v_return_type,
      v_body
    );

    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
      r.proname,
      v_identity_args
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role',
      r.proname,
      v_identity_args
    );
  END LOOP;
END;
$migration$;

COMMIT;
