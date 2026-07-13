
-- Storage policies for restaurant-assets bucket
-- Path convention: {tenant_id}/{...}

CREATE POLICY "Tenant members read their assets"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'restaurant-assets'
  AND public.is_tenant_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Tenant admins upload assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'restaurant-assets'
  AND public.is_tenant_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Tenant admins update assets"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'restaurant-assets'
  AND public.is_tenant_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Tenant admins delete assets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'restaurant-assets'
  AND public.is_tenant_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
