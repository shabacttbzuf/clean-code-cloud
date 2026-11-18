-- Make tenant custom roles assignable to team members without inheriting builtin-role grants.
begin;

alter table public.custom_roles
  add constraint custom_roles_id_tenant_unique unique (id, tenant_id);

alter table public.user_roles
  add column custom_role_id uuid,
  add constraint user_roles_custom_role_tenant_fkey
    foreign key (custom_role_id, tenant_id)
    references public.custom_roles (id, tenant_id)
    on delete restrict;

create index user_roles_custom_role_tenant_idx
  on public.user_roles (custom_role_id, tenant_id)
  where custom_role_id is not null;

create or replace function public.has_permission(_user_id uuid, _tenant_id uuid, _permission_key text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public', 'pg_temp'
as $function$
declare
  v_override boolean;
  v_custom_role_id uuid;
begin
  if auth.uid() is null or _user_id is distinct from auth.uid()
     or _tenant_id is null or nullif(btrim(_permission_key), '') is null then
    return false;
  end if;
  if public.is_super_owner(auth.uid()) then return true; end if;

  select granted into v_override
    from public.user_permission_overrides
   where user_id = auth.uid() and tenant_id = _tenant_id
     and permission_key = _permission_key
   limit 1;
  if v_override is not null then return v_override; end if;

  select ur.custom_role_id into v_custom_role_id
    from public.user_roles ur
   where ur.user_id = auth.uid() and ur.tenant_id = _tenant_id
   limit 1;

  if v_custom_role_id is not null then
    return exists (
      select 1 from public.role_permissions rp
       where rp.role_kind = 'custom'
         and rp.custom_role_id = v_custom_role_id
         and rp.tenant_id = _tenant_id
         and rp.permission_key = _permission_key
    );
  end if;

  return exists (
    select 1 from public.user_roles ur
    join public.role_permissions rp
      on rp.builtin_role = ur.role and rp.role_kind = 'builtin'
     and (rp.tenant_id = _tenant_id or rp.tenant_id is null)
    where ur.user_id = auth.uid() and ur.tenant_id = _tenant_id
      and rp.permission_key = _permission_key
  );
end;
$function$;

create or replace function public.assign_custom_role_to_user(
  _user_id uuid, _tenant_id uuid, _custom_role_id uuid, _branch_id uuid, _actor_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private', 'pg_temp'
as $function$
declare
  v_target_role public.app_role;
  v_has_target_role boolean := false;
begin
  if auth.uid() is null or _actor_id is distinct from auth.uid() then
    raise exception 'Authenticated actor mismatch' using errcode = '42501';
  end if;
  if not public.has_permission(auth.uid(), _tenant_id, 'roles.manage')
     or not public.has_permission(auth.uid(), _tenant_id, 'users.change_role') then
    raise exception 'Permission denied: roles.manage' using errcode = '42501';
  end if;

  if not exists (select 1 from public.custom_roles where id = _custom_role_id and tenant_id = _tenant_id) then
    raise exception 'Custom role does not belong to this tenant' using errcode = '23503';
  end if;

  select ur.role into v_target_role from public.user_roles ur
   where ur.user_id = _user_id and ur.tenant_id = _tenant_id for update;
  v_has_target_role := found;

  if not v_has_target_role and not exists (
    select 1 from public.profiles p where p.id = _user_id and p.tenant_id = _tenant_id
  ) then
    raise exception 'Target user does not belong to this tenant' using errcode = 'P0002';
  end if;

  if v_has_target_role and v_target_role in ('owner'::public.app_role, 'manager'::public.app_role)
     and not exists (
       select 1 from public.user_roles actor_role
        where actor_role.user_id = auth.uid() and actor_role.tenant_id = _tenant_id
          and actor_role.role = 'owner'::public.app_role
     )
     and not public.is_super_owner(auth.uid()) then
    raise exception 'You cannot change the role of an owner or manager' using errcode = '42501';
  end if;

  if _branch_id is not null and not exists (
    select 1 from public.branches
     where id = _branch_id and tenant_id = _tenant_id and is_active = true
  ) then
    raise exception 'Branch does not belong to the requested tenant or is inactive' using errcode = '23503';
  end if;

  delete from public.user_roles where user_id = _user_id and tenant_id = _tenant_id;
  insert into public.user_roles (user_id, tenant_id, role, branch_id, hired_by, custom_role_id)
  values (_user_id, _tenant_id, 'waiter'::public.app_role, _branch_id, auth.uid(), _custom_role_id);
  update public.profiles set branch_id = _branch_id where id = _user_id and tenant_id = _tenant_id;
end;
$function$;

revoke all on function public.assign_custom_role_to_user(uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.assign_custom_role_to_user(uuid, uuid, uuid, uuid, uuid) to authenticated, service_role;

drop policy if exists user_roles_custom_role_insert_guard on public.user_roles;
create policy user_roles_custom_role_insert_guard
  on public.user_roles as restrictive for insert to authenticated
  with check (custom_role_id is null or public.has_permission((select auth.uid()), tenant_id, 'roles.manage'));

drop policy if exists user_roles_custom_role_update_guard on public.user_roles;
create policy user_roles_custom_role_update_guard
  on public.user_roles as restrictive for update to authenticated
  using (custom_role_id is null or public.has_permission((select auth.uid()), tenant_id, 'roles.manage'))
  with check (custom_role_id is null or public.has_permission((select auth.uid()), tenant_id, 'roles.manage'));

commit;
