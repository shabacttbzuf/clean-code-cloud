-- Atomic and ownership-verified first tenant onboarding.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_tenant_with_owner(
  _name text,
  _currency text,
  _tax_rate numeric
)
RETURNS public.tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant public.tenants%ROWTYPE;
  v_profile_rows integer;
  v_name text := btrim(COALESCE(_name, ''));
  v_currency text := upper(btrim(COALESCE(_currency, '')));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF length(v_name) < 2 OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'Tenant name must contain 2 to 100 characters'
      USING ERRCODE = '22023';
  END IF;

  IF v_currency !~ '^[A-Z]{3,5}$' THEN
    RAISE EXCEPTION 'Currency code must contain 3 to 5 uppercase letters'
      USING ERRCODE = '22023';
  END IF;

  IF _tax_rate IS NULL OR _tax_rate < 0 OR _tax_rate > 100 THEN
    RAISE EXCEPTION 'Tax rate must be between 0 and 100'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'This account already belongs to a tenant'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.tenants (name, currency, tax_rate, owner_id)
  VALUES (v_name, v_currency, _tax_rate, v_user_id)
  RETURNING * INTO v_tenant;

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (v_user_id, v_tenant.id, 'owner');

  UPDATE public.profiles
     SET tenant_id = v_tenant.id,
         branch_id = NULL
   WHERE id = v_user_id;

  GET DIAGNOSTICS v_profile_rows = ROW_COUNT;
  IF v_profile_rows = 0 THEN
    RAISE EXCEPTION 'Profile row is missing for the authenticated user'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_with_owner(text, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_tenant_with_owner(text, text, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.create_tenant_with_owner(text, text, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_with_owner(text, text, numeric) TO authenticated;

COMMIT;
