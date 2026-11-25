-- Keep purchase RPC names stable while moving their privileged implementations
-- into the non-exposed private schema. Public entry points remain invoker wrappers.
BEGIN;

GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER FUNCTION public.create_purchase_with_items(
  uuid, uuid, uuid, uuid, text, text, jsonb
) SET SCHEMA private;

ALTER FUNCTION private.create_purchase_with_items(
  uuid, uuid, uuid, uuid, text, text, jsonb
) SET search_path = pg_catalog, public, private, pg_temp;

REVOKE ALL ON FUNCTION private.create_purchase_with_items(
  uuid, uuid, uuid, uuid, text, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.create_purchase_with_items(
  uuid, uuid, uuid, uuid, text, text, jsonb
) TO authenticated, service_role;

CREATE FUNCTION public.create_purchase_with_items(
  _tenant_id uuid,
  _branch_id uuid,
  _user_id uuid,
  _supplier_id uuid,
  _reference text,
  _notes text,
  _items jsonb
)
RETURNS public.purchases
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
  SELECT private.create_purchase_with_items(
    _tenant_id, _branch_id, _user_id, _supplier_id, _reference, _notes, _items
  );
$function$;

REVOKE ALL ON FUNCTION public.create_purchase_with_items(
  uuid, uuid, uuid, uuid, text, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_with_items(
  uuid, uuid, uuid, uuid, text, text, jsonb
) TO authenticated, service_role;

ALTER FUNCTION public.create_purchase_return(
  uuid, uuid, text, jsonb
) SET SCHEMA private;

ALTER FUNCTION private.create_purchase_return(
  uuid, uuid, text, jsonb
) SET search_path = pg_catalog, public, private, pg_temp;

REVOKE ALL ON FUNCTION private.create_purchase_return(
  uuid, uuid, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.create_purchase_return(
  uuid, uuid, text, jsonb
) TO authenticated, service_role;

CREATE FUNCTION public.create_purchase_return(
  _tenant_id uuid,
  _purchase_id uuid,
  _reason text,
  _items jsonb
)
RETURNS public.purchase_returns
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
  SELECT private.create_purchase_return(
    _tenant_id, _purchase_id, _reason, _items
  );
$function$;

REVOKE ALL ON FUNCTION public.create_purchase_return(
  uuid, uuid, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_return(
  uuid, uuid, text, jsonb
) TO authenticated, service_role;

COMMIT;
