-- Validate role-targeted notifications when an explicit audience user is supplied.
CREATE OR REPLACE FUNCTION private.enforce_notification_audience_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_matches boolean;
BEGIN
  IF NEW.audience_id IS NULL THEN
    IF NEW.audience_type IN ('branch','department','user') THEN
      RAISE EXCEPTION 'This notification audience requires an audience id'
        USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'Targeted notifications require a tenant'
      USING ERRCODE = '22023';
  END IF;

  CASE NEW.audience_type
    WHEN 'branch' THEN
      SELECT EXISTS (SELECT 1 FROM public.branches WHERE id=NEW.audience_id AND tenant_id=NEW.tenant_id) INTO v_matches;
    WHEN 'department' THEN
      SELECT EXISTS (SELECT 1 FROM public.departments WHERE id=NEW.audience_id AND tenant_id=NEW.tenant_id) INTO v_matches;
    WHEN 'user' THEN
      SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=NEW.audience_id AND tenant_id=NEW.tenant_id) INTO v_matches;
    WHEN 'owner' THEN
      SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=NEW.audience_id AND tenant_id=NEW.tenant_id AND role='owner') INTO v_matches;
    WHEN 'manager' THEN
      SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=NEW.audience_id AND tenant_id=NEW.tenant_id AND role='manager') INTO v_matches;
    ELSE
      v_matches := false;
  END CASE;

  IF NOT v_matches THEN
    RAISE EXCEPTION 'Notification audience does not belong to the selected tenant and audience type'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_notification_audience_tenant() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_notification_audience_tenant() TO authenticated, service_role;
