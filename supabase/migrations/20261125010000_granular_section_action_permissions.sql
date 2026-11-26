-- Granular permissions for marketing actions and HR print operations.
-- Existing manage/view grants are copied so current built-in and custom roles
-- retain their effective access. No account, role, or business data is deleted.
BEGIN;

INSERT INTO public.permissions (key, label_ar, label_en, category)
VALUES
  ('ads.view', 'عرض الإعلانات', 'View advertising campaigns', 'marketing'),
  ('ads.create', 'إضافة إعلان', 'Create advertising campaigns', 'marketing'),
  ('ads.edit', 'تعديل إعلان', 'Edit advertising campaigns', 'marketing'),
  ('ads.delete', 'حذف إعلان', 'Delete advertising campaigns', 'marketing'),
  ('ads.approve', 'اعتماد وتفعيل إعلان', 'Approve advertising campaigns', 'marketing'),
  ('promotions.view', 'عرض العروض الترويجية', 'View promotional offers', 'marketing'),
  ('promotions.create', 'إضافة عرض ترويجي', 'Create promotional offers', 'marketing'),
  ('promotions.edit', 'تعديل عرض ترويجي', 'Edit promotional offers', 'marketing'),
  ('promotions.delete', 'حذف عرض ترويجي', 'Delete promotional offers', 'marketing'),
  ('promotions.approve', 'اعتماد وتفعيل عرض', 'Approve promotional offers', 'marketing'),
  ('hr.attendance.print', 'طباعة كشف الحضور', 'Print attendance reports', 'operations'),
  ('hr.leaves.print', 'طباعة كشف الإجازات', 'Print leave reports', 'operations'),
  ('hr.payroll.print', 'طباعة كشف الرواتب', 'Print payroll reports', 'operations')
ON CONFLICT (key) DO NOTHING;

-- Preserve existing marketing management grants. HR print permissions are deliberately
-- not derived from view permissions because viewing sensitive HR data must not imply
-- permission to produce printable copies.
WITH permission_map(new_key, legacy_key) AS (
  VALUES
    ('ads.view', 'ads.manage'),
    ('ads.create', 'ads.manage'),
    ('ads.edit', 'ads.manage'),
    ('ads.delete', 'ads.manage'),
    ('ads.approve', 'ads.manage'),
    ('promotions.view', 'promotions.manage'),
    ('promotions.create', 'promotions.manage'),
    ('promotions.edit', 'promotions.manage'),
    ('promotions.delete', 'promotions.manage'),
    ('promotions.approve', 'promotions.manage')
)
INSERT INTO public.role_permissions
  (tenant_id, role_kind, builtin_role, custom_role_id, permission_key)
SELECT rp.tenant_id, rp.role_kind, rp.builtin_role, rp.custom_role_id, pm.new_key
FROM public.role_permissions rp
JOIN permission_map pm ON pm.legacy_key = rp.permission_key
ON CONFLICT DO NOTHING;

-- Campaign read/write permissions are restrictive, so existing tenant/company
-- scope policies remain in force and cannot be widened by these action grants.
DROP POLICY IF EXISTS permission_gate_marketing_campaigns_select ON public.marketing_campaigns;
CREATE POLICY permission_gate_marketing_campaigns_select
ON public.marketing_campaigns AS RESTRICTIVE FOR SELECT TO authenticated
USING (public.has_permission((select auth.uid()), tenant_id, 'ads.view'));

DROP POLICY IF EXISTS permission_gate_marketing_campaigns_insert ON public.marketing_campaigns;
CREATE POLICY permission_gate_marketing_campaigns_insert
ON public.marketing_campaigns AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (public.has_permission((select auth.uid()), tenant_id, 'ads.create'));

DROP POLICY IF EXISTS permission_gate_marketing_campaigns_update ON public.marketing_campaigns;
CREATE POLICY permission_gate_marketing_campaigns_update
ON public.marketing_campaigns AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  public.has_permission((select auth.uid()), tenant_id, 'ads.edit')
  OR public.has_permission((select auth.uid()), tenant_id, 'ads.approve')
)
WITH CHECK (
  public.has_permission((select auth.uid()), tenant_id, 'ads.edit')
  OR public.has_permission((select auth.uid()), tenant_id, 'ads.approve')
);

DROP POLICY IF EXISTS permission_gate_marketing_campaigns_delete ON public.marketing_campaigns;
CREATE POLICY permission_gate_marketing_campaigns_delete
ON public.marketing_campaigns AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.has_permission((select auth.uid()), tenant_id, 'ads.delete'));

DROP POLICY IF EXISTS permission_gate_promotional_offers_select ON public.promotional_offers;
CREATE POLICY permission_gate_promotional_offers_select
ON public.promotional_offers AS RESTRICTIVE FOR SELECT TO authenticated
USING (public.has_permission((select auth.uid()), tenant_id, 'promotions.view'));

DROP POLICY IF EXISTS permission_gate_promotional_offers_insert ON public.promotional_offers;
CREATE POLICY permission_gate_promotional_offers_insert
ON public.promotional_offers AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (public.has_permission((select auth.uid()), tenant_id, 'promotions.create'));

DROP POLICY IF EXISTS permission_gate_promotional_offers_update ON public.promotional_offers;
CREATE POLICY permission_gate_promotional_offers_update
ON public.promotional_offers AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  public.has_permission((select auth.uid()), tenant_id, 'promotions.edit')
  OR public.has_permission((select auth.uid()), tenant_id, 'promotions.approve')
)
WITH CHECK (
  public.has_permission((select auth.uid()), tenant_id, 'promotions.edit')
  OR public.has_permission((select auth.uid()), tenant_id, 'promotions.approve')
);

DROP POLICY IF EXISTS permission_gate_promotional_offers_delete ON public.promotional_offers;
CREATE POLICY permission_gate_promotional_offers_delete
ON public.promotional_offers AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.has_permission((select auth.uid()), tenant_id, 'promotions.delete'));

-- RLS UPDATE policies cannot distinguish a status transition from a content
-- edit. These invoker triggers enforce the matching capability as a second
-- database-side check without using SECURITY DEFINER or bypassing RLS.
CREATE OR REPLACE FUNCTION private.enforce_marketing_campaign_action_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT (public.has_permission(auth.uid(), NEW.tenant_id, 'ads.create') OR public.has_permission(auth.uid(), NEW.tenant_id, 'ads.manage')) THEN
      RAISE EXCEPTION 'Permission denied: ads.create' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at')
       AND NOT (public.has_permission(auth.uid(), NEW.tenant_id, 'ads.edit') OR public.has_permission(auth.uid(), NEW.tenant_id, 'ads.manage')) THEN
      RAISE EXCEPTION 'Permission denied: ads.edit' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (public.has_permission(auth.uid(), NEW.tenant_id, 'ads.approve') OR public.has_permission(auth.uid(), NEW.tenant_id, 'ads.manage')) THEN
      RAISE EXCEPTION 'Permission denied: ads.approve' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF NOT (public.has_permission(auth.uid(), OLD.tenant_id, 'ads.delete') OR public.has_permission(auth.uid(), OLD.tenant_id, 'ads.manage')) THEN
      RAISE EXCEPTION 'Permission denied: ads.delete' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION private.enforce_promotional_offer_action_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT (public.has_permission(auth.uid(), NEW.tenant_id, 'promotions.create') OR public.has_permission(auth.uid(), NEW.tenant_id, 'promotions.manage')) THEN
      RAISE EXCEPTION 'Permission denied: promotions.create' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'updated_at')
       AND NOT (public.has_permission(auth.uid(), NEW.tenant_id, 'promotions.edit') OR public.has_permission(auth.uid(), NEW.tenant_id, 'promotions.manage')) THEN
      RAISE EXCEPTION 'Permission denied: promotions.edit' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (public.has_permission(auth.uid(), NEW.tenant_id, 'promotions.approve') OR public.has_permission(auth.uid(), NEW.tenant_id, 'promotions.manage')) THEN
      RAISE EXCEPTION 'Permission denied: promotions.approve' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF NOT (public.has_permission(auth.uid(), OLD.tenant_id, 'promotions.delete') OR public.has_permission(auth.uid(), OLD.tenant_id, 'promotions.manage')) THEN
      RAISE EXCEPTION 'Permission denied: promotions.delete' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION private.enforce_marketing_campaign_action_permission() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.enforce_promotional_offer_action_permission() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.enforce_marketing_campaign_action_permission() TO authenticated;
GRANT EXECUTE ON FUNCTION private.enforce_promotional_offer_action_permission() TO authenticated;

DROP TRIGGER IF EXISTS trg_marketing_campaign_action_permission ON public.marketing_campaigns;
CREATE TRIGGER trg_marketing_campaign_action_permission
BEFORE INSERT OR UPDATE OR DELETE ON public.marketing_campaigns
FOR EACH ROW EXECUTE FUNCTION private.enforce_marketing_campaign_action_permission();

DROP TRIGGER IF EXISTS trg_promotional_offer_action_permission ON public.promotional_offers;
CREATE TRIGGER trg_promotional_offer_action_permission
BEFORE INSERT OR UPDATE OR DELETE ON public.promotional_offers
FOR EACH ROW EXECUTE FUNCTION private.enforce_promotional_offer_action_permission();

COMMIT;
