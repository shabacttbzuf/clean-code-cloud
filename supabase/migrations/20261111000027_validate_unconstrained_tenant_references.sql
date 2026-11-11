-- Validate non-FK tenant relationships: organization/department scope,
-- user actors/targets, notification audiences, and polymorphic inventory references.
BEGIN;

-- Optional company and department references must remain inside the row's tenant.
DROP TRIGGER IF EXISTS trg_tenant_fk_profiles_company_id ON public.profiles;
CREATE TRIGGER trg_tenant_fk_profiles_company_id
BEFORE INSERT OR UPDATE OF company_id, tenant_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.enforce_same_tenant_foreign_key('companies','company_id','id');
DROP TRIGGER IF EXISTS trg_tenant_fk_profiles_department_id ON public.profiles;
CREATE TRIGGER trg_tenant_fk_profiles_department_id
BEFORE INSERT OR UPDATE OF department_id, tenant_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.enforce_same_tenant_foreign_key('departments','department_id','id');

DROP TRIGGER IF EXISTS trg_tenant_fk_user_roles_company_id ON public.user_roles;
CREATE TRIGGER trg_tenant_fk_user_roles_company_id
BEFORE INSERT OR UPDATE OF company_id, tenant_id ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION private.enforce_same_tenant_foreign_key('companies','company_id','id');
DROP TRIGGER IF EXISTS trg_tenant_fk_user_roles_department_id ON public.user_roles;
CREATE TRIGGER trg_tenant_fk_user_roles_department_id
BEFORE INSERT OR UPDATE OF department_id, tenant_id ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION private.enforce_same_tenant_foreign_key('departments','department_id','id');

CREATE OR REPLACE FUNCTION private.enforce_tenant_user_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_tenant_id uuid;
BEGIN
  v_user_id := NULLIF(to_jsonb(NEW)->>TG_ARGV[0], '')::uuid;
  v_tenant_id := NULLIF(to_jsonb(NEW)->>'tenant_id', '')::uuid;
  IF v_user_id IS NULL OR v_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.super_owners WHERE user_id=v_user_id) THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id=v_user_id AND tenant_id=v_tenant_id
  ) THEN
    RAISE EXCEPTION 'User reference must belong to the same tenant'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_tenant_user_membership() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_tenant_user_membership() TO authenticated, service_role;

DO $$
DECLARE
  item record;
  trigger_name text;
BEGIN
  FOR item IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema='public'
      AND data_type='uuid'
      AND column_name IN (
        'user_id','cashier_id','created_by','approved_by','granted_by',
        'hired_by','processed_by'
      )
      AND table_name IN (
        'audit_logs','bonuses','cash_sessions','deductions','employees',
        'expenses','inventory_transactions','leave_requests','login_history',
        'notifications','payroll_runs','profiles','purchases','sale_refunds',
        'sales','purchase_returns','user_permission_overrides','user_roles'
      )
      AND EXISTS (
        SELECT 1 FROM information_schema.columns t
        WHERE t.table_schema='public' AND t.table_name=columns.table_name
          AND t.column_name='tenant_id'
      )
      AND NOT (table_name='user_roles' AND column_name='user_id')
  LOOP
    trigger_name := left('trg_tenant_user_' || item.table_name || '_' || item.column_name, 60);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_name, item.table_name);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I, tenant_id ON public.%I FOR EACH ROW EXECUTE FUNCTION private.enforce_tenant_user_membership(%L)',
      trigger_name, item.column_name, item.table_name, item.column_name
    );
  END LOOP;
END;
$$;

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
    ELSE
      v_matches := false;
  END CASE;

  IF NOT v_matches THEN
    RAISE EXCEPTION 'Notification audience does not belong to the selected tenant'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_notification_audience_tenant() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_notification_audience_tenant() TO authenticated, service_role;
DROP TRIGGER IF EXISTS trg_notification_audience_tenant ON public.notifications;
CREATE TRIGGER trg_notification_audience_tenant
BEFORE INSERT OR UPDATE OF audience_type, audience_id, tenant_id ON public.notifications
FOR EACH ROW EXECUTE FUNCTION private.enforce_notification_audience_tenant();

CREATE OR REPLACE FUNCTION private.enforce_inventory_reference_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_matches boolean;
BEGIN
  IF NEW.reference_id IS NULL OR NEW.reference_type IS NULL THEN
    RETURN NEW;
  END IF;

  CASE NEW.reference_type
    WHEN 'sale_refund' THEN
      SELECT EXISTS (SELECT 1 FROM public.sale_refunds WHERE id=NEW.reference_id AND tenant_id=NEW.tenant_id) INTO v_matches;
    WHEN 'purchase_return' THEN
      SELECT EXISTS (SELECT 1 FROM public.purchase_returns WHERE id=NEW.reference_id AND tenant_id=NEW.tenant_id) INTO v_matches;
    WHEN 'sale' THEN
      SELECT EXISTS (SELECT 1 FROM public.sales WHERE id=NEW.reference_id AND tenant_id=NEW.tenant_id) INTO v_matches;
    WHEN 'purchase' THEN
      SELECT EXISTS (SELECT 1 FROM public.purchases WHERE id=NEW.reference_id AND tenant_id=NEW.tenant_id) INTO v_matches;
    ELSE
      RETURN NEW;
  END CASE;

  IF NOT v_matches THEN
    RAISE EXCEPTION 'Inventory transaction reference does not belong to the selected tenant'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_inventory_reference_tenant() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_inventory_reference_tenant() TO authenticated, service_role;
DROP TRIGGER IF EXISTS trg_inventory_reference_tenant ON public.inventory_transactions;
CREATE TRIGGER trg_inventory_reference_tenant
BEFORE INSERT OR UPDATE OF reference_type, reference_id, tenant_id ON public.inventory_transactions
FOR EACH ROW EXECUTE FUNCTION private.enforce_inventory_reference_tenant();

COMMIT;
