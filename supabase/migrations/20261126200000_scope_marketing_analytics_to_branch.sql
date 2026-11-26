-- Keep engagement recording and analytics inside the campaign's branch boundary.
BEGIN;

ALTER TABLE public.marketing_campaign_events
  ADD COLUMN IF NOT EXISTS branch_id uuid
  REFERENCES public.branches(id) ON DELETE RESTRICT;

UPDATE public.marketing_campaign_events e
SET branch_id = c.branch_id
FROM public.marketing_campaigns c
WHERE e.campaign_id = c.id
  AND e.tenant_id = c.tenant_id
  AND e.branch_id IS NULL
  AND c.branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS marketing_campaign_events_branch_campaign_idx
  ON public.marketing_campaign_events (tenant_id, branch_id, campaign_id, event_type, event_day)
  WHERE branch_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.record_marketing_campaign_event(
  _campaign_id uuid,
  _event_type text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_campaign public.marketing_campaigns%ROWTYPE;
  v_allowed boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  IF _event_type NOT IN ('impression', 'click') THEN
    RAISE EXCEPTION 'Unsupported campaign event' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_campaign
  FROM public.marketing_campaigns mc
  WHERE mc.id = _campaign_id
    AND mc.status = 'active'
    AND (mc.starts_at IS NULL OR mc.starts_at <= now())
    AND (mc.ends_at IS NULL OR mc.ends_at > now());

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_allowed :=
    public.is_super_owner(v_uid)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = v_uid AND ur.tenant_id = v_campaign.tenant_id
        AND ur.role = 'owner' AND ur.company_id IS NULL
    )
    OR (
      v_campaign.company_id IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = v_uid AND ur.tenant_id = v_campaign.tenant_id
            AND ur.company_id = v_campaign.company_id
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          JOIN public.branches b ON b.id = ur.branch_id AND b.tenant_id = ur.tenant_id
          WHERE ur.user_id = v_uid AND ur.tenant_id = v_campaign.tenant_id
            AND b.company_id = v_campaign.company_id
            AND (ur.company_id IS NULL OR ur.company_id = b.company_id)
        )
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          JOIN public.departments d ON d.id = ur.department_id AND d.tenant_id = ur.tenant_id
          WHERE ur.user_id = v_uid AND ur.tenant_id = v_campaign.tenant_id
            AND d.company_id = v_campaign.company_id
            AND (ur.company_id IS NULL OR ur.company_id = d.company_id)
        )
      )
    )
    OR (
      v_campaign.company_id IS NULL
      AND (
        v_campaign.created_by IS NULL
        OR EXISTS (SELECT 1 FROM public.super_owners so WHERE so.user_id = v_campaign.created_by)
        OR EXISTS (
          SELECT 1 FROM public.user_roles creator
          WHERE creator.user_id = v_campaign.created_by
            AND creator.tenant_id = v_campaign.tenant_id
            AND creator.role = 'owner' AND creator.company_id IS NULL
        )
      )
      AND private.is_tenant_member(v_uid, v_campaign.tenant_id)
    );

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Campaign is outside the authenticated user scope' USING ERRCODE='42501';
  END IF;

  IF v_campaign.branch_id IS NOT NULL
     AND NOT private.can_access_branch(v_uid, v_campaign.tenant_id, v_campaign.branch_id) THEN
    RAISE EXCEPTION 'Campaign is outside the authenticated branch scope' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.marketing_campaign_events
    (tenant_id, company_id, branch_id, campaign_id, actor_id, event_type)
  VALUES
    (v_campaign.tenant_id, v_campaign.company_id, v_campaign.branch_id,
     v_campaign.id, v_uid, _event_type)
  ON CONFLICT ON CONSTRAINT marketing_campaign_events_daily_unique DO NOTHING;

  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION private.get_marketing_campaign_analytics(_tenant_id uuid)
RETURNS TABLE (
  campaign_id uuid,
  impressions bigint,
  clicks bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_is_super boolean;
  v_is_tenant_owner boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;

  v_is_super := public.is_super_owner(v_uid);
  v_is_tenant_owner := EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.tenant_id = _tenant_id
      AND ur.role = 'owner' AND ur.company_id IS NULL
  );
  SELECT ur.company_id INTO v_company_id
  FROM public.user_roles ur
  WHERE ur.user_id = v_uid AND ur.tenant_id = _tenant_id
    AND ur.company_id IS NOT NULL
    AND ur.role IN ('owner','manager')
  ORDER BY ur.company_id
  LIMIT 1;

  IF NOT v_is_super AND NOT v_is_tenant_owner
     AND (v_company_id IS NULL OR NOT public.has_permission(v_uid, _tenant_id, 'ads.manage')) THEN
    RAISE EXCEPTION 'Not authorized to view campaign analytics' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT mc.id,
    count(e.id) FILTER (WHERE e.event_type = 'impression')::bigint,
    count(e.id) FILTER (WHERE e.event_type = 'click')::bigint
  FROM public.marketing_campaigns mc
  LEFT JOIN public.marketing_campaign_events e
    ON e.campaign_id = mc.id
   AND e.tenant_id = mc.tenant_id
   AND e.branch_id IS NOT DISTINCT FROM mc.branch_id
  WHERE mc.tenant_id = _tenant_id
    AND (
      v_is_super OR v_is_tenant_owner
      OR mc.company_id = v_company_id
    )
    AND (
      mc.branch_id IS NULL
      OR private.can_access_branch(v_uid, mc.tenant_id, mc.branch_id)
    )
  GROUP BY mc.id;
END;
$function$;

REVOKE ALL ON FUNCTION private.record_marketing_campaign_event(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.record_marketing_campaign_event(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION private.get_marketing_campaign_analytics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.get_marketing_campaign_analytics(uuid) TO authenticated, service_role;

COMMIT;
