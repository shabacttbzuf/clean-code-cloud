BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(5);

SELECT ok(
  EXISTS (SELECT 1 FROM public.permissions WHERE key='ads.manage' AND category='marketing'),
  'Dedicated ads.manage permission is registered in the permission catalog'
);

SELECT is(
  (SELECT count(*)::int FROM public.role_permissions
   WHERE role_kind='builtin' AND tenant_id IS NULL
     AND builtin_role IN ('owner','manager') AND permission_key='ads.manage'),
  2,
  'Built-in owner and manager roles receive the dedicated advertising permission'
);

SELECT ok(
  position('settings.manage' in pg_get_functiondef('private.can_manage_company_assets(uuid,uuid,uuid,text)'::regprocedure)) > 0
  AND position('ads.manage' in pg_get_functiondef('private.can_manage_company_assets(uuid,uuid,uuid,text)'::regprocedure)) > 0,
  'Marketing asset upload retains settings permission and accepts the independent ads permission'
);

SELECT ok(
  position('ur.company_id = _company_id' in pg_get_functiondef('private.can_manage_company_assets(uuid,uuid,uuid,text)'::regprocedure)) > 0
  AND position('ur.role IN' in pg_get_functiondef('private.can_manage_company_assets(uuid,uuid,uuid,text)'::regprocedure)) > 0,
  'Marketing asset access remains limited to owner or manager in the target company'
);

SELECT ok(
  NOT has_function_privilege('anon','private.can_manage_company_assets(uuid,uuid,uuid,text)','EXECUTE')
  AND NOT has_function_privilege('public','private.can_manage_company_assets(uuid,uuid,uuid,text)','EXECUTE'),
  'Company asset authorization helper is not executable by anonymous or public roles'
);

SELECT * FROM finish();
ROLLBACK;
