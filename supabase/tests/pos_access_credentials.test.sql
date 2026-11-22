begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select ok(
  exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='pos_access_credentials'
      and c.relrowsecurity and c.relforcerowsecurity
  ),
  'POS credentials table exists with enabled and forced RLS'
);

select ok(
  has_table_privilege('service_role', 'public.pos_access_credentials', 'SELECT')
  and has_table_privilege('service_role', 'public.pos_access_credentials', 'INSERT')
  and has_table_privilege('service_role', 'public.pos_access_credentials', 'UPDATE'),
  'Only trusted server-side service role receives credential table access'
);

select ok(
  not has_table_privilege('anon', 'public.pos_access_credentials', 'SELECT')
  and not has_table_privilege('authenticated', 'public.pos_access_credentials', 'SELECT')
  and not has_table_privilege('authenticated', 'public.pos_access_credentials', 'INSERT')
  and not has_table_privilege('authenticated', 'public.pos_access_credentials', 'UPDATE'),
  'Anonymous and authenticated clients cannot read or write POS credentials'
);

select is(
  (select count(*)::integer from pg_policies
   where schemaname='public' and tablename='pos_access_credentials'),
  0,
  'No client RLS policies expose POS credential rows'
);

select * from finish();
rollback;
