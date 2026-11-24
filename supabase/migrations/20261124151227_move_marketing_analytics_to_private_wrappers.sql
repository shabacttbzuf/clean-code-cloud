-- Keep the existing marketing analytics RPC names stable while moving their
-- privileged implementations out of the exposed public API schema.
-- Public RPCs become SECURITY INVOKER wrappers; private implementations retain
-- their original auth.uid(), company-scope and tenant-scope checks.
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER FUNCTION public.record_marketing_campaign_event(uuid, text)
  SET SCHEMA private;
ALTER FUNCTION public.get_marketing_campaign_analytics(uuid)
  SET SCHEMA private;

REVOKE ALL ON FUNCTION private.record_marketing_campaign_event(uuid, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.get_marketing_campaign_analytics(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.record_marketing_campaign_event(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_marketing_campaign_analytics(uuid)
  TO authenticated, service_role;

CREATE FUNCTION public.record_marketing_campaign_event(
  _campaign_id uuid,
  _event_type text
)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public, private
AS $function$
  SELECT private.record_marketing_campaign_event(_campaign_id, _event_type);
$function$;

CREATE FUNCTION public.get_marketing_campaign_analytics(_tenant_id uuid)
RETURNS TABLE (
  campaign_id uuid,
  impressions bigint,
  clicks bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, private
AS $function$
  SELECT *
  FROM private.get_marketing_campaign_analytics(_tenant_id);
$function$;

REVOKE ALL ON FUNCTION public.record_marketing_campaign_event(uuid, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_marketing_campaign_analytics(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_marketing_campaign_event(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_marketing_campaign_analytics(uuid)
  TO authenticated, service_role;

COMMIT;
