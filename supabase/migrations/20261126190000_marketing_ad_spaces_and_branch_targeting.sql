-- Add branch-level targeting and a first-class catalog of advertising spaces.
-- Existing campaign data and placement keys remain backward compatible.
BEGIN;

CREATE TABLE IF NOT EXISTS public.marketing_ad_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE RESTRICT,
  branch_id uuid REFERENCES public.branches(id) ON DELETE RESTRICT,
  space_key text NOT NULL CHECK (space_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  format text NOT NULL DEFAULT 'banner' CHECK (format IN ('banner','card','inline','pos')),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 10000),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_ad_spaces_id_tenant_unique UNIQUE (id, tenant_id),
  CONSTRAINT marketing_ad_spaces_scope_key_unique
    UNIQUE NULLS NOT DISTINCT (tenant_id, company_id, branch_id, space_key)
);

CREATE INDEX IF NOT EXISTS marketing_ad_spaces_scope_active_idx
  ON public.marketing_ad_spaces (tenant_id, company_id, branch_id, is_active, sort_order);

ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS branch_id uuid,
  ADD COLUMN IF NOT EXISTS advertising_space_id uuid;

ALTER TABLE public.marketing_campaigns
  ADD CONSTRAINT marketing_campaigns_branch_id_fkey
  FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT;

ALTER TABLE public.marketing_campaigns
  ADD CONSTRAINT marketing_campaigns_advertising_space_tenant_fkey
  FOREIGN KEY (advertising_space_id, tenant_id)
  REFERENCES public.marketing_ad_spaces(id, tenant_id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS marketing_campaigns_tenant_company_branch_status_idx
  ON public.marketing_campaigns (tenant_id, company_id, branch_id, status, sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS marketing_campaigns_branch_id_idx
  ON public.marketing_campaigns (branch_id) WHERE branch_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.validate_marketing_ad_space_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
DECLARE
  v_branch_tenant uuid;
  v_branch_company uuid;
BEGIN
  IF NEW.company_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = NEW.company_id AND c.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Advertising space company must belong to the same tenant'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.branch_id IS NOT NULL THEN
    SELECT b.tenant_id, b.company_id
      INTO v_branch_tenant, v_branch_company
    FROM public.branches b
    WHERE b.id = NEW.branch_id;

    IF NOT FOUND OR v_branch_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'Advertising space branch must belong to the same tenant'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.company_id IS NULL THEN
      NEW.company_id := v_branch_company;
    ELSIF NEW.company_id IS DISTINCT FROM v_branch_company THEN
      RAISE EXCEPTION 'Advertising space branch must belong to its selected company'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.validate_marketing_ad_space_scope() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.validate_marketing_ad_space_scope() TO service_role;
DROP TRIGGER IF EXISTS marketing_ad_spaces_validate_scope ON public.marketing_ad_spaces;
CREATE TRIGGER marketing_ad_spaces_validate_scope
BEFORE INSERT OR UPDATE OF tenant_id, company_id, branch_id
ON public.marketing_ad_spaces
FOR EACH ROW EXECUTE FUNCTION private.validate_marketing_ad_space_scope();

CREATE OR REPLACE FUNCTION private.validate_marketing_campaign_branch_space()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
DECLARE
  v_branch_tenant uuid;
  v_branch_company uuid;
  v_space_tenant uuid;
  v_space_company uuid;
  v_space_branch uuid;
BEGIN
  IF NEW.branch_id IS NOT NULL THEN
    SELECT b.tenant_id, b.company_id
      INTO v_branch_tenant, v_branch_company
    FROM public.branches b
    WHERE b.id = NEW.branch_id;

    IF NOT FOUND OR v_branch_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'Campaign branch must belong to the same tenant'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.company_id IS NULL THEN
      NEW.company_id := v_branch_company;
    ELSIF NEW.company_id IS DISTINCT FROM v_branch_company THEN
      RAISE EXCEPTION 'Campaign branch must belong to its selected company'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.advertising_space_id IS NOT NULL THEN
    SELECT s.tenant_id, s.company_id, s.branch_id
      INTO v_space_tenant, v_space_company, v_space_branch
    FROM public.marketing_ad_spaces s
    WHERE s.id = NEW.advertising_space_id;

    IF NOT FOUND OR v_space_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'Campaign advertising space must belong to the same tenant'
        USING ERRCODE = '23514';
    END IF;

    IF v_space_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Campaign and advertising space company scopes must match'
        USING ERRCODE = '23514';
    END IF;

    IF v_space_branch IS NOT NULL AND v_space_branch IS DISTINCT FROM NEW.branch_id THEN
      RAISE EXCEPTION 'Campaign and advertising space branch scopes must match'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.validate_marketing_campaign_branch_space() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.validate_marketing_campaign_branch_space() TO service_role;
DROP TRIGGER IF EXISTS marketing_campaigns_validate_branch_space ON public.marketing_campaigns;
CREATE TRIGGER marketing_campaigns_validate_branch_space
BEFORE INSERT OR UPDATE OF tenant_id, company_id, branch_id, advertising_space_id
ON public.marketing_campaigns
FOR EACH ROW EXECUTE FUNCTION private.validate_marketing_campaign_branch_space();

-- Preserve the existing placement values by materializing one legacy space per
-- tenant/company/placement. No campaign is deleted or rewritten otherwise.
INSERT INTO public.marketing_ad_spaces
  (tenant_id, company_id, space_key, name, description, format, is_active)
SELECT DISTINCT
  mc.tenant_id,
  mc.company_id,
  mc.placement,
  CASE mc.placement
    WHEN 'dashboard_banner' THEN 'الشريط الرئيسي في لوحة التحكم'
    WHEN 'dashboard_card' THEN 'بطاقة إعلانية في لوحة التحكم'
    WHEN 'pos_promo' THEN 'المساحة الترويجية في نقطة البيع'
    ELSE mc.placement
  END,
  'مساحة ترحّلت تلقائياً للحفاظ على الحملات الحالية.',
  CASE mc.placement
    WHEN 'dashboard_banner' THEN 'banner'
    WHEN 'dashboard_card' THEN 'card'
    WHEN 'pos_promo' THEN 'pos'
    ELSE 'inline'
  END,
  true
FROM public.marketing_campaigns mc
ON CONFLICT ON CONSTRAINT marketing_ad_spaces_scope_key_unique DO NOTHING;

UPDATE public.marketing_campaigns mc
SET advertising_space_id = s.id
FROM public.marketing_ad_spaces s
WHERE mc.advertising_space_id IS NULL
  AND s.tenant_id = mc.tenant_id
  AND s.company_id IS NOT DISTINCT FROM mc.company_id
  AND s.branch_id IS NULL
  AND s.space_key = mc.placement;

ALTER TABLE public.marketing_ad_spaces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_ad_spaces FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_ad_spaces TO authenticated;
GRANT ALL ON public.marketing_ad_spaces TO service_role;

DROP POLICY IF EXISTS marketing_ad_spaces_tenant_read ON public.marketing_ad_spaces;
CREATE POLICY marketing_ad_spaces_tenant_read
ON public.marketing_ad_spaces
AS PERMISSIVE FOR SELECT TO authenticated
USING (
  private.is_tenant_member((SELECT auth.uid()), tenant_id)
  OR public.is_super_owner((SELECT auth.uid()))
);

DROP POLICY IF EXISTS marketing_ad_spaces_tenant_admin_gate ON public.marketing_ad_spaces;
CREATE POLICY marketing_ad_spaces_tenant_admin_gate
ON public.marketing_ad_spaces
AS PERMISSIVE FOR ALL TO authenticated
USING (
  private.is_tenant_admin((SELECT auth.uid()), tenant_id)
  OR public.is_super_owner((SELECT auth.uid()))
)
WITH CHECK (
  private.is_tenant_admin((SELECT auth.uid()), tenant_id)
  OR public.is_super_owner((SELECT auth.uid()))
);

DROP POLICY IF EXISTS marketing_ad_spaces_scope_select ON public.marketing_ad_spaces;
CREATE POLICY marketing_ad_spaces_scope_select
ON public.marketing_ad_spaces
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  public.is_super_owner((SELECT auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid()) AND ur.tenant_id = marketing_ad_spaces.tenant_id
      AND ur.role = 'owner' AND ur.company_id IS NULL
  )
  OR (
    company_id IS NULL
    AND private.is_tenant_member((SELECT auth.uid()), tenant_id)
  )
  OR (
    company_id IS NOT NULL
    AND private.is_company_member(tenant_id, company_id)
    AND (branch_id IS NULL OR private.can_access_branch((SELECT auth.uid()), tenant_id, branch_id))
  )
);

DROP POLICY IF EXISTS marketing_ad_spaces_scope_insert ON public.marketing_ad_spaces;
CREATE POLICY marketing_ad_spaces_scope_insert
ON public.marketing_ad_spaces
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_owner((SELECT auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid()) AND ur.tenant_id = marketing_ad_spaces.tenant_id
      AND ur.role = 'owner' AND ur.company_id IS NULL
  )
  OR (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid()) AND ur.tenant_id = marketing_ad_spaces.tenant_id
        AND ur.company_id = marketing_ad_spaces.company_id AND ur.role IN ('owner','manager')
        AND public.has_permission((SELECT auth.uid()), marketing_ad_spaces.tenant_id, 'ads.manage')
    )
    AND (branch_id IS NULL OR private.can_access_branch((SELECT auth.uid()), tenant_id, branch_id))
  )
);

DROP POLICY IF EXISTS marketing_ad_spaces_scope_update ON public.marketing_ad_spaces;
CREATE POLICY marketing_ad_spaces_scope_update
ON public.marketing_ad_spaces
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  public.is_super_owner((SELECT auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid()) AND ur.tenant_id = marketing_ad_spaces.tenant_id
      AND ur.role = 'owner' AND ur.company_id IS NULL
  )
  OR (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid()) AND ur.tenant_id = marketing_ad_spaces.tenant_id
        AND ur.company_id = marketing_ad_spaces.company_id AND ur.role IN ('owner','manager')
        AND public.has_permission((SELECT auth.uid()), marketing_ad_spaces.tenant_id, 'ads.manage')
    )
    AND (branch_id IS NULL OR private.can_access_branch((SELECT auth.uid()), tenant_id, branch_id))
  )
)
WITH CHECK (
  public.is_super_owner((SELECT auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid()) AND ur.tenant_id = marketing_ad_spaces.tenant_id
      AND ur.role = 'owner' AND ur.company_id IS NULL
  )
  OR (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid()) AND ur.tenant_id = marketing_ad_spaces.tenant_id
        AND ur.company_id = marketing_ad_spaces.company_id AND ur.role IN ('owner','manager')
        AND public.has_permission((SELECT auth.uid()), marketing_ad_spaces.tenant_id, 'ads.manage')
    )
    AND (branch_id IS NULL OR private.can_access_branch((SELECT auth.uid()), tenant_id, branch_id))
  )
);

DROP POLICY IF EXISTS marketing_ad_spaces_scope_delete ON public.marketing_ad_spaces;
CREATE POLICY marketing_ad_spaces_scope_delete
ON public.marketing_ad_spaces
AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  public.is_super_owner((SELECT auth.uid()))
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid()) AND ur.tenant_id = marketing_ad_spaces.tenant_id
      AND ur.role = 'owner' AND ur.company_id IS NULL
  )
  OR (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid()) AND ur.tenant_id = marketing_ad_spaces.tenant_id
        AND ur.company_id = marketing_ad_spaces.company_id AND ur.role IN ('owner','manager')
        AND public.has_permission((SELECT auth.uid()), marketing_ad_spaces.tenant_id, 'ads.manage')
    )
    AND (branch_id IS NULL OR private.can_access_branch((SELECT auth.uid()), tenant_id, branch_id))
  )
);

-- A branch-targeted campaign is visible and mutable only inside that branch,
-- in addition to the existing tenant/company restrictive policies.
DROP POLICY IF EXISTS company_scope_marketing_campaigns_branch_select ON public.marketing_campaigns;
CREATE POLICY company_scope_marketing_campaigns_branch_select
ON public.marketing_campaigns
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  branch_id IS NULL
  OR private.can_access_branch((SELECT auth.uid()), tenant_id, branch_id)
);

DROP POLICY IF EXISTS company_scope_marketing_campaigns_branch_insert ON public.marketing_campaigns;
CREATE POLICY company_scope_marketing_campaigns_branch_insert
ON public.marketing_campaigns
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  branch_id IS NULL
  OR private.can_access_branch((SELECT auth.uid()), tenant_id, branch_id)
);

DROP POLICY IF EXISTS company_scope_marketing_campaigns_branch_update ON public.marketing_campaigns;
CREATE POLICY company_scope_marketing_campaigns_branch_update
ON public.marketing_campaigns
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  branch_id IS NULL
  OR private.can_access_branch((SELECT auth.uid()), tenant_id, branch_id)
)
WITH CHECK (
  branch_id IS NULL
  OR private.can_access_branch((SELECT auth.uid()), tenant_id, branch_id)
);

DROP POLICY IF EXISTS company_scope_marketing_campaigns_branch_delete ON public.marketing_campaigns;
CREATE POLICY company_scope_marketing_campaigns_branch_delete
ON public.marketing_campaigns
AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  branch_id IS NULL
  OR private.can_access_branch((SELECT auth.uid()), tenant_id, branch_id)
);

COMMIT;
