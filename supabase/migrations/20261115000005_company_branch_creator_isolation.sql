-- Company and creator isolation for branch-scoped restaurant data.
-- Additive and backward-compatible: legacy rows are preserved; ambiguous legacy branches remain unassigned.
begin;

alter table public.branches
  add column if not exists company_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='branches_company_id_fkey' and conrelid='public.branches'::regclass) then
    alter table public.branches add constraint branches_company_id_fkey
      foreign key (company_id) references public.companies(id) on delete restrict;
  end if;
end $$;

alter table public.customers add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.suppliers add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.products add column if not exists created_by uuid references auth.users(id) on delete set null;

-- Backfill only when a tenant has exactly one company; never guess across multiple companies.
update public.branches b
set company_id = x.company_id
from (
  select tenant_id, min(id::text)::uuid as company_id
  from public.companies
  group by tenant_id
  having count(*) = 1
) x
where b.tenant_id = x.tenant_id and b.company_id is null;

create index if not exists branches_tenant_company_idx on public.branches(tenant_id, company_id);
create index if not exists customers_tenant_creator_idx on public.customers(tenant_id, created_by);
create index if not exists suppliers_tenant_creator_idx on public.suppliers(tenant_id, created_by);
create index if not exists products_tenant_creator_idx on public.products(tenant_id, created_by);

create or replace function private.assign_creator_and_validate_branch_company()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_company_count integer;
  v_is_super boolean;
begin
  v_is_super := exists (select 1 from public.super_owners so where so.user_id = v_uid);

  if tg_table_name in ('customers','suppliers','products') then
    if tg_op = 'INSERT' then
      if new.created_by is null then new.created_by := v_uid; end if;
      if not v_is_super and new.created_by is distinct from v_uid then
        raise exception 'Creator must be the authenticated user' using errcode='42501';
      end if;
    elsif new.created_by is distinct from old.created_by and not v_is_super then
      raise exception 'Record creator is immutable' using errcode='42501';
    end if;
    return new;
  end if;

  if tg_table_name = 'branches' then
    if new.company_id is null then
      select count(distinct ur.company_id), min(ur.company_id::text)::uuid
        into v_company_count, v_company
      from public.user_roles ur
      where ur.user_id = v_uid and ur.tenant_id = new.tenant_id and ur.company_id is not null;
      if v_company_count = 1 then
        new.company_id := v_company;
      else
        select count(*), min(c.id::text)::uuid
          into v_company_count, v_company
        from public.companies c where c.tenant_id = new.tenant_id;
        if v_company_count = 1 then new.company_id := v_company; end if;
      end if;
    end if;

    if new.company_id is null and exists (
      select 1 from public.companies c where c.tenant_id = new.tenant_id
    ) then
      raise exception 'Select the company that owns this branch' using errcode='23502';
    end if;

    if new.company_id is not null and not exists (
      select 1 from public.companies c
      where c.id = new.company_id and c.tenant_id = new.tenant_id
    ) then
      raise exception 'Branch company must belong to the same tenant' using errcode='23514';
    end if;

    if not v_is_super and new.company_id is not null and not exists (
      select 1 from public.user_roles ur
      where ur.user_id = v_uid and ur.tenant_id = new.tenant_id
        and ur.company_id = new.company_id and ur.role in ('owner','manager')
    ) then
      raise exception 'You cannot create or move a branch outside your company' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists customers_assign_creator on public.customers;
create trigger customers_assign_creator before insert or update of created_by on public.customers
for each row execute function private.assign_creator_and_validate_branch_company();
drop trigger if exists suppliers_assign_creator on public.suppliers;
create trigger suppliers_assign_creator before insert or update of created_by on public.suppliers
for each row execute function private.assign_creator_and_validate_branch_company();
drop trigger if exists products_assign_creator on public.products;
create trigger products_assign_creator before insert or update of created_by on public.products
for each row execute function private.assign_creator_and_validate_branch_company();
drop trigger if exists branches_validate_company on public.branches;
create trigger branches_validate_company before insert or update of company_id, tenant_id on public.branches
for each row execute function private.assign_creator_and_validate_branch_company();

-- Branch authorization is tenant + company aware. The platform owner remains global.
create or replace function private.can_access_branch(_user_id uuid, _tenant_id uuid, _branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
  select
    exists (select 1 from public.super_owners so where so.user_id = _user_id)
    or exists (
      select 1
      from public.user_roles ur
      join public.branches b on b.id = _branch_id and b.tenant_id = _tenant_id
      where ur.user_id = _user_id
        and ur.tenant_id = _tenant_id
        and (
          (ur.role in ('owner','manager','accountant')
            and (
              (ur.company_id is not null and b.company_id = ur.company_id)
              or (ur.company_id is null and b.company_id is null)
            ))
          or (ur.branch_id = _branch_id
              and (ur.company_id is null or b.company_id = ur.company_id))
        )
    );
$$;

-- Restrictive creator gates prevent permissive tenant-wide policies from exposing another manager's master records.
do $$
declare t text;
begin
  foreach t in array array['customers','suppliers','products'] loop
    execute format('drop policy if exists creator_scope_%I on public.%I', t, t);
    execute format(
      'create policy creator_scope_%I on public.%I as restrictive for select to authenticated using (
        created_by = (select auth.uid())
        or exists (select 1 from public.super_owners so where so.user_id = (select auth.uid()))
        or created_by is null
      )', t, t
    );
    execute format(
      'create policy creator_update_%I on public.%I as restrictive for update to authenticated using (
        created_by = (select auth.uid())
        or exists (select 1 from public.super_owners so where so.user_id = (select auth.uid()))
      ) with check (
        created_by = (select auth.uid())
        or exists (select 1 from public.super_owners so where so.user_id = (select auth.uid()))
      )', t, t
    );
    execute format(
      'create policy creator_delete_%I on public.%I as restrictive for delete to authenticated using (
        created_by = (select auth.uid())
        or exists (select 1 from public.super_owners so where so.user_id = (select auth.uid()))
      )', t, t
    );
    execute format(
      'create policy creator_insert_%I on public.%I as restrictive for insert to authenticated with check (
        created_by = (select auth.uid())
        or exists (select 1 from public.super_owners so where so.user_id = (select auth.uid()))
      )', t, t
    );
  end loop;
end $$;

commit;
