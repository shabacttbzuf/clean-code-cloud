-- Allow authenticated tenant members to upload only their own dashboard hero image assets.
-- Existing public-read policy remains unchanged; these assets are intentionally public images.
CREATE POLICY "Users upload own dashboard hero assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'restaurant-assets'
  AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND (
    (
      split_part(name, '/', 2) = 'dashboard'
      AND split_part(name, '/', 3) = auth.uid()::text
      AND (
        private.is_tenant_member(auth.uid(), split_part(name, '/', 1)::uuid)
        OR public.is_super_owner(auth.uid())
      )
    )
    OR
    (
      split_part(name, '/', 2) = 'companies'
      AND split_part(name, '/', 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND split_part(name, '/', 4) = 'dashboard'
      AND split_part(name, '/', 5) = auth.uid()::text
      AND EXISTS (
        SELECT 1
        FROM public.companies c
        WHERE c.id = split_part(name, '/', 3)::uuid
          AND c.tenant_id = split_part(name, '/', 1)::uuid
      )
      AND (
        private.is_company_member(auth.uid(), split_part(name, '/', 3)::uuid)
        OR public.is_super_owner(auth.uid())
      )
    )
  )
);
