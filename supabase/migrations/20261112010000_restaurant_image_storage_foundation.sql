-- Shared image storage for restaurant products, profiles, branches and promotions.
-- Public read is intentional for catalog/marketing imagery; writes remain tenant-scoped.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('restaurant-assets', 'restaurant-assets', true, 5242880, array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Restaurant assets public read"
on storage.objects for select
to public
using (bucket_id = 'restaurant-assets');

create policy "Restaurant assets tenant upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'restaurant-assets'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and (
    private.is_tenant_admin(auth.uid(), split_part(name, '/', 1)::uuid)
    or (
      split_part(name, '/', 2) = 'profiles'
      and split_part(name, '/', 3) = auth.uid()::text
      and private.is_tenant_member(auth.uid(), split_part(name, '/', 1)::uuid)
    )
    or public.is_super_owner(auth.uid())
  )
);

create policy "Restaurant assets tenant update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'restaurant-assets'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and (
    private.is_tenant_admin(auth.uid(), split_part(name, '/', 1)::uuid)
    or (
      split_part(name, '/', 2) = 'profiles'
      and split_part(name, '/', 3) = auth.uid()::text
      and private.is_tenant_member(auth.uid(), split_part(name, '/', 1)::uuid)
    )
    or public.is_super_owner(auth.uid())
  )
)
with check (
  bucket_id = 'restaurant-assets'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and (
    private.is_tenant_admin(auth.uid(), split_part(name, '/', 1)::uuid)
    or (
      split_part(name, '/', 2) = 'profiles'
      and split_part(name, '/', 3) = auth.uid()::text
      and private.is_tenant_member(auth.uid(), split_part(name, '/', 1)::uuid)
    )
    or public.is_super_owner(auth.uid())
  )
);

create policy "Restaurant assets tenant delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'restaurant-assets'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and (
    private.is_tenant_admin(auth.uid(), split_part(name, '/', 1)::uuid)
    or (
      split_part(name, '/', 2) = 'profiles'
      and split_part(name, '/', 3) = auth.uid()::text
      and private.is_tenant_member(auth.uid(), split_part(name, '/', 1)::uuid)
    )
    or public.is_super_owner(auth.uid())
  )
);