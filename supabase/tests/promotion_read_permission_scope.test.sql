BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(4);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.promotional_offers'::regclass)
  AND EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='promotional_offers'
      AND policyname='Tenant members read promotional offers' AND cmd='SELECT'
      AND qual LIKE '%promotions.manage%' AND qual LIKE '%active%'
  ),
  'Staff can read only active in-window offers while managers with promotions.manage can review all states'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='promotion_redemptions'
      AND policyname='Promotion managers read redemptions' AND cmd='SELECT'
      AND qual LIKE '%promotions.manage%'
  ),
  'Promotion redemption analytics require the dedicated management permission'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='promotion_redemptions'
      AND policyname='granular_promotions_read_redemptions' AND cmd='SELECT'
      AND qual LIKE '%promotions.view%' AND qual LIKE '%can_access_branch%'
      AND qual LIKE '%is_tenant_member%'
  ),
  'Granular redemption analytics require promotions.view and retain tenant/branch scope'
);


SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='promotional_offers' AND policyname='Promotion managers insert offers'
    AND with_check LIKE '%promotions.manage%' AND with_check LIKE '%can_access_branch%')
  AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='promotional_offers' AND policyname='Promotion managers update offers'
    AND qual LIKE '%promotions.manage%' AND with_check LIKE '%promotions.manage%'),
  'Company- and branch-scoped custom roles can manage offers only with promotions.manage'
);

SELECT * FROM finish();
ROLLBACK;
