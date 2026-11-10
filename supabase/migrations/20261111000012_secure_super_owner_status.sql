-- Authenticated, read-only status endpoint for the initial super-owner screen.
-- Exposes only aggregate count and the caller's own membership flag.
CREATE OR REPLACE FUNCTION public.get_super_owner_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'totalCount', (SELECT count(*)::integer FROM public.super_owners),
    'isSuperOwner', EXISTS (
      SELECT 1 FROM public.super_owners WHERE user_id = v_user_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_super_owner_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_super_owner_status() TO authenticated;
