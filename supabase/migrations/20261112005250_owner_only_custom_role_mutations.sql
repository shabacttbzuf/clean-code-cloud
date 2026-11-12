-- Ensure permission overrides cannot turn managers or staff into custom-role administrators.
begin;

drop policy if exists custom_roles_owner_only_insert_guard on public.custom_roles;
create policy custom_roles_owner_only_insert_guard
  on public.custom_roles as restrictive for insert to authenticated
  with check (
    public.is_super_owner((select auth.uid()))
    or private.has_role((select auth.uid()), tenant_id, 'owner'::public.app_role)
  );

drop policy if exists custom_roles_owner_only_update_guard on public.custom_roles;
create policy custom_roles_owner_only_update_guard
  on public.custom_roles as restrictive for update to authenticated
  using (
    public.is_super_owner((select auth.uid()))
    or private.has_role((select auth.uid()), tenant_id, 'owner'::public.app_role)
  )
  with check (
    public.is_super_owner((select auth.uid()))
    or private.has_role((select auth.uid()), tenant_id, 'owner'::public.app_role)
  );

drop policy if exists custom_roles_owner_only_delete_guard on public.custom_roles;
create policy custom_roles_owner_only_delete_guard
  on public.custom_roles as restrictive for delete to authenticated
  using (
    public.is_super_owner((select auth.uid()))
    or private.has_role((select auth.uid()), tenant_id, 'owner'::public.app_role)
  );

drop policy if exists role_permissions_owner_only_insert_guard on public.role_permissions;
create policy role_permissions_owner_only_insert_guard
  on public.role_permissions as restrictive for insert to authenticated
  with check (
    public.is_super_owner((select auth.uid()))
    or (tenant_id is not null and private.has_role((select auth.uid()), tenant_id, 'owner'::public.app_role))
  );

drop policy if exists role_permissions_owner_only_update_guard on public.role_permissions;
create policy role_permissions_owner_only_update_guard
  on public.role_permissions as restrictive for update to authenticated
  using (
    public.is_super_owner((select auth.uid()))
    or (tenant_id is not null and private.has_role((select auth.uid()), tenant_id, 'owner'::public.app_role))
  )
  with check (
    public.is_super_owner((select auth.uid()))
    or (tenant_id is not null and private.has_role((select auth.uid()), tenant_id, 'owner'::public.app_role))
  );

drop policy if exists role_permissions_owner_only_delete_guard on public.role_permissions;
create policy role_permissions_owner_only_delete_guard
  on public.role_permissions as restrictive for delete to authenticated
  using (
    public.is_super_owner((select auth.uid()))
    or (tenant_id is not null and private.has_role((select auth.uid()), tenant_id, 'owner'::public.app_role))
  );

commit;
