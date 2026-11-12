-- Prevent a custom staff role from ever replacing the tenant owner's owner role.
begin;

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
  if not public.is_super_owner(auth.uid()) and not exists (
    select 1 from public.user_roles actor_role
     where actor_role.user_id = auth.uid() and actor_role.tenant_id = _tenant_id
       and actor_role.role = 'owner'::public.app_role
  ) then
    raise exception 'Only the tenant owner or platform super owner may assign custom roles' using errcode = '42501';
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

  if v_has_target_role and v_target_role = 'owner'::public.app_role then
    raise exception 'The tenant owner cannot be assigned a custom staff role' using errcode = '42501';
  end if;
  if not v_has_target_role and not exists (
    select 1 from public.profiles p where p.id = _user_id and p.tenant_id = _tenant_id
  ) then
    raise exception 'Target user does not belong to this tenant' using errcode = 'P0002';
  end if;

  if v_has_target_role and v_target_role = 'manager'::public.app_role
     and not public.is_super_owner(auth.uid())
     and not exists (
       select 1 from public.user_roles actor_role
        where actor_role.user_id = auth.uid() and actor_role.tenant_id = _tenant_id
          and actor_role.role = 'owner'::public.app_role
     ) then
    raise exception 'You cannot change the role of a manager' using errcode = '42501';
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

commit;
