-- A notification receipt must belong to a user in the notification's tenant.
BEGIN;

CREATE OR REPLACE FUNCTION private.enforce_notification_read_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.notifications
  WHERE id = NEW.notification_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification does not exist' USING ERRCODE = '23503';
  END IF;

  IF EXISTS (SELECT 1 FROM public.super_owners WHERE user_id=NEW.user_id) THEN
    RETURN NEW;
  END IF;

  IF v_tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id=NEW.user_id AND tenant_id=v_tenant_id
  ) THEN
    RAISE EXCEPTION 'Notification reader must belong to the notification tenant'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_notification_read_tenant() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_notification_read_tenant() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_notification_read_tenant ON public.notification_reads;
CREATE TRIGGER trg_notification_read_tenant
BEFORE INSERT OR UPDATE OF notification_id, user_id ON public.notification_reads
FOR EACH ROW EXECUTE FUNCTION private.enforce_notification_read_tenant();

COMMIT;
