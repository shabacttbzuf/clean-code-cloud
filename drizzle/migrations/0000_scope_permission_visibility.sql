ALTER POLICY "View super owners" ON public.super_owners USING (public.is_super_owner(auth.uid()));
ALTER POLICY "View role permissions" ON public.role_permissions USING (public.is_super_owner(auth.uid()) OR tenant_id IS NULL OR private.is_tenant_member(auth.uid(), tenant_id));
ALTER POLICY "View permissions" ON public.permissions USING (public.is_super_owner(auth.uid()) OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.tenant_id IS NOT NULL));
CREATE OR REPLACE FUNCTION public.get_super_owner_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT jsonb_build_object('isSuperOwner', EXISTS (SELECT 1 FROM public.super_owners WHERE user_id = auth.uid()), 'totalCount', (SELECT count(*) FROM public.super_owners)) WHERE auth.uid() IS NOT NULL $$;
REVOKE ALL ON FUNCTION public.get_super_owner_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_super_owner_status() TO authenticated, service_role;