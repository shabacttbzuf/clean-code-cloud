-- Extend the existing advertising-space model with multi-branch campaign targeting.
-- This reuses marketing_ad_spaces; it deliberately does not create a parallel placement table.
BEGIN;

ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS target_branch_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE public.marketing_campaigns
  DROP CONSTRAINT IF EXISTS marketing_campaigns_placement_check;
ALTER TABLE public.marketing_campaigns
  ADD CONSTRAINT marketing_campaigns_placement_check
  CHECK (placement = ANY (ARRAY[
    'dashboard_banner','dashboard_card','pos_promo',
    'welcome','main','sidebar','offers','in_page'
  ]::text[]));

ALTER TABLE public.marketing_campaigns
  DROP CONSTRAINT IF EXISTS marketing_campaigns_target_branch_ids_limit;
ALTER TABLE public.marketing_campaigns
  ADD CONSTRAINT marketing_campaigns_target_branch_ids_limit
  CHECK (cardinality(target_branch_ids) <= 1000);

ALTER TABLE public.marketing_campaigns
  DROP CONSTRAINT IF EXISTS marketing_campaigns_single_or_multi_branch_target;
ALTER TABLE public.marketing_campaigns
  ADD CONSTRAINT marketing_campaigns_single_or_multi_branch_target
  CHECK (branch_id IS NULL OR cardinality(target_branch_ids) = 0);

CREATE INDEX IF NOT EXISTS marketing_campaigns_target_branch_ids_gin
  ON public.marketing_campaigns USING gin (target_branch_ids);

CREATE OR REPLACE FUNCTION private.validate_marketing_campaign_target_branches()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  target_branch uuid;
BEGIN
  IF cardinality(NEW.target_branch_ids) <>
     cardinality(ARRAY(SELECT DISTINCT unnest(COALESCE(NEW.target_branch_ids, '{}'::uuid[])))) THEN
    RAISE EXCEPTION 'لا يمكن تكرار الفرع المستهدف في الإعلان' USING ERRCODE = '23514';
  END IF;

  FOREACH target_branch IN ARRAY COALESCE(NEW.target_branch_ids, '{}'::uuid[]) LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.branches b
      WHERE b.id = target_branch
        AND b.tenant_id = NEW.tenant_id
        AND (NEW.company_id IS NULL OR b.company_id = NEW.company_id)
    ) THEN
      RAISE EXCEPTION 'الفرع المستهدف لا ينتمي إلى نطاق المؤسسة أو الشركة المحددة' USING ERRCODE = '23514';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.validate_marketing_campaign_target_branches() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.validate_marketing_campaign_target_branches() TO authenticated, service_role;

DROP TRIGGER IF EXISTS validate_marketing_campaign_target_branches ON public.marketing_campaigns;
CREATE TRIGGER validate_marketing_campaign_target_branches
BEFORE INSERT OR UPDATE OF tenant_id, company_id, branch_id, target_branch_ids
ON public.marketing_campaigns
FOR EACH ROW EXECUTE FUNCTION private.validate_marketing_campaign_target_branches();

-- A targeted campaign is visible only to users who can access at least one
-- selected branch. Writers must be authorized for every selected branch.
DROP POLICY IF EXISTS company_scope_marketing_campaigns_branch_select ON public.marketing_campaigns;
CREATE POLICY company_scope_marketing_campaigns_branch_select
ON public.marketing_campaigns
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  (branch_id IS NULL OR private.can_access_branch((SELECT auth.uid()), tenant_id, branch_id))
  AND (
    cardinality(target_branch_ids) = 0
    OR EXISTS (
      SELECT 1
      FROM unnest(target_branch_ids) AS target(branch_id)
      WHERE private.can_access_branch((SELECT auth.uid()), tenant_id, target.branch_id)
    )
  )
);

DROP POLICY IF EXISTS company_scope_marketing_campaigns_branch_insert ON public.marketing_campaigns;
CREATE POLICY company_scope_marketing_campaigns_branch_insert
ON public.marketing_campaigns
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  (branch_id IS NULL OR private.can_access_branch((SELECT auth.uid()), tenant_id, branch_id))
  AND NOT EXISTS (
    SELECT 1
    FROM unnest(target_branch_ids) AS target(branch_id)
    WHERE NOT private.can_access_branch((SELECT auth.uid()), tenant_id, target.branch_id)
  )
);

DROP POLICY IF EXISTS company_scope_marketing_campaigns_branch_update ON public.marketing_campaigns;
CREATE POLICY company_scope_marketing_campaigns_branch_update
ON public.marketing_campaigns
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  (branch_id IS NULL OR private.can_access_branch((SELECT auth.uid()), tenant_id, branch_id))
  AND (
    cardinality(target_branch_ids) = 0
    OR EXISTS (
      SELECT 1
      FROM unnest(target_branch_ids) AS target(branch_id)
      WHERE private.can_access_branch((SELECT auth.uid()), tenant_id, target.branch_id)
    )
  )
)
WITH CHECK (
  (branch_id IS NULL OR private.can_access_branch((SELECT auth.uid()), tenant_id, branch_id))
  AND NOT EXISTS (
    SELECT 1
    FROM unnest(target_branch_ids) AS target(branch_id)
    WHERE NOT private.can_access_branch((SELECT auth.uid()), tenant_id, target.branch_id)
  )
);

DROP POLICY IF EXISTS company_scope_marketing_campaigns_branch_delete ON public.marketing_campaigns;
CREATE POLICY company_scope_marketing_campaigns_branch_delete
ON public.marketing_campaigns
AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  (branch_id IS NULL OR private.can_access_branch((SELECT auth.uid()), tenant_id, branch_id))
  AND (
    cardinality(target_branch_ids) = 0
    OR EXISTS (
      SELECT 1
      FROM unnest(target_branch_ids) AS target(branch_id)
      WHERE private.can_access_branch((SELECT auth.uid()), tenant_id, target.branch_id)
    )
  )
);

COMMIT;
