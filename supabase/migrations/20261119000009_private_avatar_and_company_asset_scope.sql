-- Separate private user avatars from public catalog/marketing images and
-- scope public asset writes to the owning company.
begin;

create or replace function private.can_manage_company_assets(
  _actor_id uuid,_tenant_id uuid,_company_id uuid,_asset_folder text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select _actor_id=(select auth.uid())
    and exists (
      select 1
      from public.user_roles ur
      join public.companies c
        on c.id=_company_id and c.tenant_id=_tenant_id
      where ur.user_id=_actor_id
        and ur.tenant_id=_tenant_id
        and ur.company_id=_company_id
        and ur.role in ('owner','manager')
    )
    and case _asset_folder
      when 'branding' then public.has_permission(_actor_id,_tenant_id,'settings.manage')
      when 'marketing' then public.has_permission(_actor_id,_tenant_id,'settings.manage')
      when 'products' then public.has_permission(_actor_id,_tenant_id,'products.manage')
      when 'branches' then public.has_permission(_actor_id,_tenant_id,'branches.manage')
      when 'categories' then public.has_permission(_actor_id,_tenant_id,'categories.manage')
      when 'avatars' then public.has_permission(_actor_id,_tenant_id,'hr.employees.manage')
      else false
    end;
$function$;
revoke all on function private.can_manage_company_assets(uuid,uuid,uuid,text) from public, anon;
grant execute on function private.can_manage_company_assets(uuid,uuid,uuid,text) to authenticated, service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'restaurant-private-assets',
  'restaurant-private-assets',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

-- Private avatars: only the owner uploads/changes their own file. Users who can
-- view that employee profile in the tenant/company can receive a signed URL.
drop policy if exists private_profile_avatar_select on storage.objects;
create policy private_profile_avatar_select on storage.objects
for select to authenticated
using (
  bucket_id='restaurant-private-assets'
  and split_part(name,'/',1) ~* '^[0-9a-f-]{36}$'
  and split_part(name,'/',2)='profiles'
  and split_part(name,'/',3) ~* '^[0-9a-f-]{36}$'
  and (
    (
      split_part(name,'/',3)=(select auth.uid())::text
      and (
        public.is_super_owner((select auth.uid()))
        or private.is_tenant_member((select auth.uid()),split_part(name,'/',1)::uuid)
      )
    )
    or private.can_access_creator_company(
      split_part(name,'/',1)::uuid,
      split_part(name,'/',3)::uuid
    )
  )
);

drop policy if exists private_profile_avatar_insert on storage.objects;
create policy private_profile_avatar_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='restaurant-private-assets'
  and split_part(name,'/',1) ~* '^[0-9a-f-]{36}$'
  and split_part(name,'/',2)='profiles'
  and split_part(name,'/',3)=(select auth.uid())::text
  and (
    public.is_super_owner((select auth.uid()))
    or private.is_tenant_member((select auth.uid()),split_part(name,'/',1)::uuid)
  )
);

drop policy if exists private_profile_avatar_update on storage.objects;
create policy private_profile_avatar_update on storage.objects
for update to authenticated
using (
  bucket_id='restaurant-private-assets'
  and split_part(name,'/',1) ~* '^[0-9a-f-]{36}$'
  and split_part(name,'/',2)='profiles'
  and split_part(name,'/',3)=(select auth.uid())::text
  and (
    public.is_super_owner((select auth.uid()))
    or private.is_tenant_member((select auth.uid()),split_part(name,'/',1)::uuid)
  )
)
with check (
  bucket_id='restaurant-private-assets'
  and split_part(name,'/',1) ~* '^[0-9a-f-]{36}$'
  and split_part(name,'/',2)='profiles'
  and split_part(name,'/',3)=(select auth.uid())::text
  and (
    public.is_super_owner((select auth.uid()))
    or private.is_tenant_member((select auth.uid()),split_part(name,'/',1)::uuid)
  )
);

drop policy if exists private_profile_avatar_delete on storage.objects;
create policy private_profile_avatar_delete on storage.objects
for delete to authenticated
using (
  bucket_id='restaurant-private-assets'
  and split_part(name,'/',1) ~* '^[0-9a-f-]{36}$'
  and split_part(name,'/',2)='profiles'
  and split_part(name,'/',3)=(select auth.uid())::text
  and (
    public.is_super_owner((select auth.uid()))
    or private.is_tenant_member((select auth.uid()),split_part(name,'/',1)::uuid)
  )
);

-- The restaurant-assets bucket stays public for public-facing images, but its
-- write paths are limited to tenant-wide assets or the actor's own company.
drop policy if exists restaurant_assets_company_scope_insert on storage.objects;
create policy restaurant_assets_company_scope_insert on storage.objects
as restrictive for insert to authenticated
with check (
  bucket_id <> 'restaurant-assets'
  or (
    split_part(name,'/',1) ~* '^[0-9a-f-]{36}$'
    and (
      (
        split_part(name,'/',2) in ('branding','marketing','products','branches','categories','avatars')
        and (
          public.is_super_owner((select auth.uid()))
          or private.is_tenant_owner_user((select auth.uid()),split_part(name,'/',1)::uuid)
        )
      )
      or (
        split_part(name,'/',2)='companies'
        and split_part(name,'/',3) ~* '^[0-9a-f-]{36}$'
        and split_part(name,'/',4) in ('branding','marketing','products','branches','categories','avatars')
        and (
          public.is_super_owner((select auth.uid()))
          or private.is_tenant_owner_user((select auth.uid()),split_part(name,'/',1)::uuid)
          or private.can_manage_company_assets(
            (select auth.uid()),
            split_part(name,'/',1)::uuid,
            split_part(name,'/',3)::uuid,
            split_part(name,'/',4)
          )
        )
      )
    )
  )
);

drop policy if exists restaurant_assets_company_scope_update on storage.objects;
create policy restaurant_assets_company_scope_update on storage.objects
as restrictive for update to authenticated
using (
  bucket_id <> 'restaurant-assets'
  or (
    split_part(name,'/',1) ~* '^[0-9a-f-]{36}$'
    and (
      (
        split_part(name,'/',2) in ('branding','marketing','products','branches','categories','avatars')
        and (
          public.is_super_owner((select auth.uid()))
          or private.is_tenant_owner_user((select auth.uid()),split_part(name,'/',1)::uuid)
        )
      )
      or (
        split_part(name,'/',2)='companies'
        and split_part(name,'/',3) ~* '^[0-9a-f-]{36}$'
        and split_part(name,'/',4) in ('branding','marketing','products','branches','categories','avatars')
        and (
          public.is_super_owner((select auth.uid()))
          or private.is_tenant_owner_user((select auth.uid()),split_part(name,'/',1)::uuid)
          or private.can_manage_company_assets(
            (select auth.uid()),
            split_part(name,'/',1)::uuid,
            split_part(name,'/',3)::uuid,
            split_part(name,'/',4)
          )
        )
      )
    )
  )
)
with check (
  bucket_id <> 'restaurant-assets'
  or (
    split_part(name,'/',1) ~* '^[0-9a-f-]{36}$'
    and (
      (
        split_part(name,'/',2) in ('branding','marketing','products','branches','categories','avatars')
        and (
          public.is_super_owner((select auth.uid()))
          or private.is_tenant_owner_user((select auth.uid()),split_part(name,'/',1)::uuid)
        )
      )
      or (
        split_part(name,'/',2)='companies'
        and split_part(name,'/',3) ~* '^[0-9a-f-]{36}$'
        and split_part(name,'/',4) in ('branding','marketing','products','branches','categories','avatars')
        and (
          public.is_super_owner((select auth.uid()))
          or private.is_tenant_owner_user((select auth.uid()),split_part(name,'/',1)::uuid)
          or private.can_manage_company_assets(
            (select auth.uid()),
            split_part(name,'/',1)::uuid,
            split_part(name,'/',3)::uuid,
            split_part(name,'/',4)
          )
        )
      )
    )
  )
);

drop policy if exists restaurant_assets_company_scope_delete on storage.objects;
create policy restaurant_assets_company_scope_delete on storage.objects
as restrictive for delete to authenticated
using (
  bucket_id <> 'restaurant-assets'
  or (
    split_part(name,'/',1) ~* '^[0-9a-f-]{36}$'
    and (
      (
        split_part(name,'/',2) in ('branding','marketing','products','branches','categories','avatars')
        and (
          public.is_super_owner((select auth.uid()))
          or private.is_tenant_owner_user((select auth.uid()),split_part(name,'/',1)::uuid)
        )
      )
      or (
        split_part(name,'/',2)='companies'
        and split_part(name,'/',3) ~* '^[0-9a-f-]{36}$'
        and split_part(name,'/',4) in ('branding','marketing','products','branches','categories','avatars')
        and (
          public.is_super_owner((select auth.uid()))
          or private.is_tenant_owner_user((select auth.uid()),split_part(name,'/',1)::uuid)
          or private.can_manage_company_assets(
            (select auth.uid()),
            split_part(name,'/',1)::uuid,
            split_part(name,'/',3)::uuid,
            split_part(name,'/',4)
          )
        )
      )
    )
  )
);

commit;
