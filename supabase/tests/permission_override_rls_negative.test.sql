BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(5);

-- Isolated tenant fixture: branch manager, same-branch employee, cross-branch
-- employee, and a protected Super Owner account.
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('00000000-0000-0000-0000-000000000151','authenticated','authenticated','stage15-owner@example.invalid','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000152','authenticated','authenticated','stage15-manager@example.invalid','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000153','authenticated','authenticated','stage15-employee@example.invalid','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000154','authenticated','authenticated','stage15-other-branch@example.invalid','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000155','authenticated','authenticated','stage15-super-owner@example.invalid','',now(),'{}','{}',now(),now());

INSERT INTO public.tenants(id, name, owner_id)
VALUES ('00000000-0000-0000-0000-000000000161','Stage 15 permission test','00000000-0000-0000-0000-000000000151');

INSERT INTO public.companies(id, tenant_id, name)
VALUES ('00000000-0000-0000-0000-000000000171','00000000-0000-0000-0000-000000000161','Stage 15 company');

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000151',true);
INSERT INTO public.user_roles(user_id, tenant_id, role, branch_id, company_id, hired_by)
VALUES ('00000000-0000-0000-0000-000000000151','00000000-0000-0000-0000-000000000161','owner',NULL,'00000000-0000-0000-0000-000000000171',NULL);

INSERT INTO public.branches(id, tenant_id, company_id, name)
VALUES
  ('00000000-0000-0000-0000-000000000181','00000000-0000-0000-0000-000000000161','00000000-0000-0000-0000-000000000171','Stage 15 branch A'),
  ('00000000-0000-0000-0000-000000000182','00000000-0000-0000-0000-000000000161','00000000-0000-0000-0000-000000000171','Stage 15 branch B');

INSERT INTO public.profiles(id, tenant_id, company_id, branch_id, full_name)
VALUES
  ('00000000-0000-0000-0000-000000000151','00000000-0000-0000-0000-000000000161',NULL,NULL,'Stage 15 owner'),
  ('00000000-0000-0000-0000-000000000152','00000000-0000-0000-0000-000000000161','00000000-0000-0000-0000-000000000171','00000000-0000-0000-0000-000000000181','Stage 15 manager'),
  ('00000000-0000-0000-0000-000000000153','00000000-0000-0000-0000-000000000161','00000000-0000-0000-0000-000000000171','00000000-0000-0000-0000-000000000181','Stage 15 employee'),
  ('00000000-0000-0000-0000-000000000154','00000000-0000-0000-0000-000000000161','00000000-0000-0000-0000-000000000171','00000000-0000-0000-0000-000000000182','Stage 15 other branch'),
  ('00000000-0000-0000-0000-000000000155','00000000-0000-0000-0000-000000000161','00000000-0000-0000-0000-000000000171','00000000-0000-0000-0000-000000000181','Stage 15 protected owner');

INSERT INTO public.user_roles(user_id, tenant_id, role, branch_id, company_id, hired_by)
VALUES
  ('00000000-0000-0000-0000-000000000152','00000000-0000-0000-0000-000000000161','manager','00000000-0000-0000-0000-000000000181','00000000-0000-0000-0000-000000000171','00000000-0000-0000-0000-000000000151'),
  ('00000000-0000-0000-0000-000000000153','00000000-0000-0000-0000-000000000161','cashier','00000000-0000-0000-0000-000000000181','00000000-0000-0000-0000-000000000171','00000000-0000-0000-0000-000000000152'),
  ('00000000-0000-0000-0000-000000000154','00000000-0000-0000-0000-000000000161','cashier','00000000-0000-0000-0000-000000000182','00000000-0000-0000-0000-000000000171','00000000-0000-0000-0000-000000000152'),
  ('00000000-0000-0000-0000-000000000155','00000000-0000-0000-0000-000000000161','cashier','00000000-0000-0000-0000-000000000181','00000000-0000-0000-0000-000000000171','00000000-0000-0000-0000-000000000152');

INSERT INTO public.super_owners(user_id, granted_by, notes)
VALUES ('00000000-0000-0000-0000-000000000155','00000000-0000-0000-0000-000000000151','Stage 15 RLS fixture');

INSERT INTO public.role_permissions(tenant_id, role_kind, builtin_role, permission_key)
VALUES
  (NULL,'builtin','manager','permissions.manage'),
  (NULL,'builtin','manager','ads.create')
ON CONFLICT DO NOTHING;

-- Explicitly revoke ads.create from this manager while retaining permissions.manage.
INSERT INTO public.user_permission_overrides(tenant_id, user_id, permission_key, granted, granted_by)
VALUES (
  '00000000-0000-0000-0000-000000000161',
  '00000000-0000-0000-0000-000000000152',
  'ads.create',
  false,
  '00000000-0000-0000-0000-000000000151'
);

SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000152',true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$INSERT INTO public.user_permission_overrides(tenant_id,user_id,permission_key,granted,granted_by)
    VALUES ('00000000-0000-0000-0000-000000000161','00000000-0000-0000-0000-000000000153','permissions.manage',false,'00000000-0000-0000-0000-000000000152')$$,
  'Manager can change a permission for an employee they hired in their assigned branch when they hold that permission'
);

SELECT throws_ok(
  $$INSERT INTO public.user_permission_overrides(tenant_id,user_id,permission_key,granted,granted_by)
    VALUES ('00000000-0000-0000-0000-000000000161','00000000-0000-0000-0000-000000000153','ads.create',true,'00000000-0000-0000-0000-000000000152')$$,
  '42501', NULL,
  'Manager cannot grant a permission they do not effectively hold'
);

SELECT throws_ok(
  $$INSERT INTO public.user_permission_overrides(tenant_id,user_id,permission_key,granted,granted_by)
    VALUES ('00000000-0000-0000-0000-000000000161','00000000-0000-0000-0000-000000000154','permissions.manage',false,'00000000-0000-0000-0000-000000000152')$$,
  '42501', NULL,
  'Manager cannot change permissions for an employee assigned to another branch'
);

SELECT throws_ok(
  $$INSERT INTO public.user_permission_overrides(tenant_id,user_id,permission_key,granted,granted_by)
    VALUES ('00000000-0000-0000-0000-000000000161','00000000-0000-0000-0000-000000000152','permissions.manage',false,'00000000-0000-0000-0000-000000000152')$$,
  '42501', NULL,
  'Manager cannot modify their own permissions'
);

SELECT throws_ok(
  $$INSERT INTO public.user_permission_overrides(tenant_id,user_id,permission_key,granted,granted_by)
    VALUES ('00000000-0000-0000-0000-000000000161','00000000-0000-0000-0000-000000000155','permissions.manage',false,'00000000-0000-0000-0000-000000000152')$$,
  '42501', NULL,
  'Manager cannot modify the Super Owner account'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
