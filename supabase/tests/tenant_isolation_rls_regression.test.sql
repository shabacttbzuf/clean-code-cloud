begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

select ok(
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname=any(array[
        'companies','branches','customers','suppliers','products','sales','sale_items',
        'purchases','purchase_items','inventory','inventory_transactions',
        'cash_sessions','user_roles','profiles'
      ])
      and not c.relrowsecurity
  ),
  'RLS is enabled on all core tenant and operational tables'
);

select ok(
  exists (select 1 from pg_policies where schemaname='public'
    and tablename='branches' and policyname='company_scope_branches_select'
    and permissive='RESTRICTIVE' and cmd='SELECT'),
  'Branch reads retain a restrictive company-scope policy'
);

select ok(
  exists (select 1 from pg_policies where schemaname='public'
    and tablename='companies' and policyname='company_scope_companies_select'
    and permissive='RESTRICTIVE' and cmd='SELECT'),
  'Company reads retain a restrictive company-scope policy'
);

select ok(
  (select count(*)=3 from pg_policies where schemaname='public'
    and tablename=any(array['customers','suppliers','products'])
    and policyname=any(array['creator_scope_customers','creator_scope_suppliers','creator_scope_products'])
    and permissive='RESTRICTIVE' and cmd='SELECT'),
  'Customer, supplier, and product reads retain restrictive creator isolation'
);

select ok(
  (select count(*)=4 from pg_policies where schemaname='public'
    and tablename='sales' and policyname like 'company_boundary_sales_%'
    and permissive='RESTRICTIVE'),
  'Sales retain restrictive branch-boundary policies'
);

select ok(
  (select count(*)=4 from pg_policies where schemaname='public'
    and tablename='cash_sessions' and policyname like 'company_boundary_cash_sessions_%'
    and permissive='RESTRICTIVE'),
  'Cash sessions retain restrictive company/branch boundary policies'
);

select ok(
  not exists (
    select 1 from pg_policies
    where schemaname='public' and permissive='PERMISSIVE'
    group by tablename,cmd,roles::text,qual,with_check
    having count(*)>1
  ),
  'No byte-for-byte duplicate permissive policies exist'
);

select * from finish();
rollback;
