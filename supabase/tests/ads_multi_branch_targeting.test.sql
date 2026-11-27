BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(10);

SELECT has_column(
  'public', 'marketing_campaigns', 'target_branch_ids',
  'Campaigns store an optional list of targeted branches'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
    AND indexname='marketing_campaigns_target_branch_ids_gin'),
  'Campaign target branch IDs have a GIN index'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.marketing_campaigns'::regclass
      AND conname='marketing_campaigns_target_branch_ids_limit'),
  'Campaign target branch list has a bounded cardinality constraint'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.marketing_campaigns'::regclass
      AND tgname='validate_marketing_campaign_target_branches'
      AND NOT tgisinternal),
  'Campaign branch targets are validated by a database trigger'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='marketing_campaigns'
      AND policyname='company_scope_marketing_campaigns_branch_select'
      AND qual ILIKE '%target_branch_ids%'),
  'Campaign reads enforce the selected branch audience'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='marketing_campaigns'
      AND policyname='company_scope_marketing_campaigns_branch_insert'
      AND with_check ILIKE '%target_branch_ids%'),
  'Campaign creation requires access to every selected target branch'
);

SELECT ok(
  position('ads.manage' in pg_get_functiondef('private.can_manage_company_assets(uuid,uuid,uuid,text)'::regprocedure)) > 0
  AND position('settings.manage' in pg_get_functiondef('private.can_manage_company_assets(uuid,uuid,uuid,text)'::regprocedure)) > 0,
  'Marketing asset uploads accept ads.manage without removing settings.manage'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='marketing_campaigns'
      AND policyname='company_scope_marketing_campaigns_branch_update'
      AND qual ILIKE '%target_branch_ids%'
      AND with_check ILIKE '%target_branch_ids%'),
  'Campaign updates enforce both existing and new branch target scope'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='marketing_campaigns'
      AND policyname='company_scope_marketing_campaigns_branch_delete'
      AND qual ILIKE '%target_branch_ids%'),
  'Campaign deletion remains limited to an authorized target branch'
);

SELECT ok(
  to_regclass('public.marketing_ad_spaces') IS NOT NULL
  AND to_regclass('public.marketing_ad_placements') IS NULL,
  'The existing branch-aware ad-space model is reused without creating a parallel placement table'
);

SELECT * FROM finish();
ROLLBACK;
