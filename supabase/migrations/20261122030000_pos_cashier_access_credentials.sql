-- Per-user POS passphrase storage. Credentials are accessible only to trusted server-side service-role code.
BEGIN;

CREATE TABLE IF NOT EXISTS public.pos_access_credentials (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_access_credentials_pkey PRIMARY KEY (tenant_id, user_id),
  CONSTRAINT pos_access_credentials_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT pos_access_credentials_user_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE public.pos_access_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_access_credentials FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pos_access_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.pos_access_credentials TO service_role;

COMMENT ON TABLE public.pos_access_credentials IS
  'Server-only scrypt hashes for each user POS passphrase; never expose credentials through client-side queries.';

COMMIT;
