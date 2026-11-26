BEGIN;
SELECT plan(15);

SELECT has_table('public', 'marketing_ad_spaces',
  'A first-class advertising spaces table exists');

SELECT has_column('public', 'marketing_campaigns', 'branch_id',
  'Campaigns support branch targeting');
SELECT has_column('public', 'marketing_campaigns', 'advertising_space_id',
  'Campaigns reference a managed advertising space');
SELECT has_column('public', 'marketing_ad_spaces', 'tenant_id',
  'Advertising spaces are tenant scoped');
SELECT has_column('public', 'marketing_ad_spaces', 'company_id',
  'Advertising spaces support company scope');
SELECT has_column('public', 'marketing_ad_spaces', 'branch_id',
  'Advertising spaces support branch scope');
SELECT has_column('public', 'marketing_ad_spaces', 'space_key',
  'Advertising spaces retain stable placement keys');
SELECT has_column('public', 'marketing_ad_spaces', 'is_active',
  'Advertising spaces can be activated and paused');

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.marketing_ad_spaces'::regclass
      AND conname = 'marketing_ad_spaces_scope_key_unique'
  ),
  'Advertising space keys are unique within tenant/company/branch scope'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.marketing_campaigns'::regclass
      AND conname = 'marketing_campaigns_advertising_space_tenant_fkey'
  ),
  'Campaign space references cannot cross tenant boundaries'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.marketing_campaigns'::regclass
      AND tgname = 'marketing_campaigns_validate_branch_space'
      AND NOT tgisinternal
  ),
  'Campaign branch and advertising-space scopes are validated on writes'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.marketing_ad_spaces'::regclass
      AND tgname = 'marketing_ad_spaces_validate_scope'
      AND NOT tgisinternal
  ),
  'Advertising-space company and branch scopes are validated on writes'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.marketing_campaigns'::regclass
      AND polname = 'company_scope_marketing_campaigns_branch_select'
      AND NOT polpermissive
  ),
  'Branch-targeted campaigns have a restrictive read boundary'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.marketing_ad_spaces'::regclass
      AND polname = 'marketing_ad_spaces_scope_select'
      AND NOT polpermissive
  ),
  'Advertising spaces have a restrictive read boundary'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.marketing_ad_spaces'::regclass
      AND polname = 'marketing_ad_spaces_scope_insert'
      AND NOT polpermissive
  ),
  'Advertising-space writes require scoped management authority'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.marketing_ad_spaces', 'SELECT'),
  'Anonymous users cannot read advertising-space metadata'
);

SELECT * FROM finish();
ROLLBACK;
