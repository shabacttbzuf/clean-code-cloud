BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(6);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.promotional_offers'::regclass)
  AND (SELECT relrowsecurity FROM pg_class WHERE oid='public.promotion_redemptions'::regclass),
  'Promotional offers and redemption records enforce RLS'
);

SELECT ok(
  EXISTS (SELECT 1 FROM public.permissions WHERE key='promotions.manage')
  AND (SELECT count(*)=2 FROM public.role_permissions
       WHERE tenant_id IS NULL AND role_kind='builtin'
         AND permission_key='promotions.manage' AND builtin_role::text IN ('owner','manager')),
  'Dedicated promotion permission is registered for owner and manager defaults'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='promotional_offers' AND policyname='Promotion managers insert offers' AND cmd='INSERT')
  AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='promotional_offers' AND policyname='Promotion managers update offers' AND cmd='UPDATE')
  AND EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
    AND tablename='promotional_offers' AND policyname='Promotion managers delete offers' AND cmd='DELETE'),
  'Promotion writes are protected by dedicated permission and company/branch scope policies'
);

SELECT ok(
  has_function_privilege('authenticated',
    'public.create_pos_order(uuid,uuid,uuid,uuid,numeric,uuid,numeric,payment_method,jsonb,text,uuid,text,text,text,numeric,uuid)',
    'EXECUTE')
  AND NOT has_function_privilege('anon',
    'public.create_pos_order(uuid,uuid,uuid,uuid,numeric,uuid,numeric,payment_method,jsonb,text,uuid,text,text,text,numeric,uuid)',
    'EXECUTE'),
  'Only authenticated users can invoke the promotion-aware POS wrapper'
);

SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc WHERE oid=
    'public.create_pos_order(uuid,uuid,uuid,uuid,numeric,uuid,numeric,payment_method,jsonb,text,uuid,text,text,text,numeric,uuid)'::regprocedure)
  AND (SELECT prosecdef FROM pg_proc WHERE oid=
    'private.create_pos_order_with_promotion(uuid,uuid,uuid,uuid,numeric,uuid,numeric,payment_method,jsonb,text,uuid,text,text,text,numeric,uuid)'::regprocedure),
  'Promotion-aware POS wrapper is SECURITY INVOKER and its implementation is private SECURITY DEFINER'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.promotional_offers'::regclass
    AND tgname='trg_validate_promotional_offer_scope' AND NOT tgisinternal)
  AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.promotional_offers'::regclass
    AND tgname='trg_promotional_offers_updated_at' AND NOT tgisinternal),
  'Promotion scope and update timestamp triggers are installed'
);

SELECT * FROM finish();
ROLLBACK;
