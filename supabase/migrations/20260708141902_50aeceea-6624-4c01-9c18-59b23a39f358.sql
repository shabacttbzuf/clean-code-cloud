
-- Audit logs table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  user_id UUID,
  action TEXT NOT NULL, -- INSERT | UPDATE | DELETE
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  changes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_tenant ON public.audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select" ON public.audit_logs
FOR SELECT TO authenticated
USING (
  public.is_super_owner(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.tenant_id = audit_logs.tenant_id
      AND ur.role IN ('owner','manager')
  )
);

CREATE POLICY "audit_logs_insert" ON public.audit_logs
FOR INSERT TO authenticated WITH CHECK (true);

-- Generic trigger fn
CREATE OR REPLACE FUNCTION public.log_audit_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
  v_entity_id TEXT;
  v_changes JSONB;
  v_user UUID := auth.uid();
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_tenant := (to_jsonb(OLD)->>'tenant_id')::UUID;
    v_entity_id := (to_jsonb(OLD)->>'id');
    v_changes := jsonb_build_object('before', to_jsonb(OLD));
  ELSIF TG_OP = 'INSERT' THEN
    v_tenant := (to_jsonb(NEW)->>'tenant_id')::UUID;
    v_entity_id := (to_jsonb(NEW)->>'id');
    v_changes := jsonb_build_object('after', to_jsonb(NEW));
  ELSE
    v_tenant := (to_jsonb(NEW)->>'tenant_id')::UUID;
    v_entity_id := (to_jsonb(NEW)->>'id');
    v_changes := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
  END IF;

  INSERT INTO public.audit_logs(tenant_id, user_id, action, entity_type, entity_id, changes)
  VALUES (v_tenant, v_user, TG_OP, TG_TABLE_NAME, v_entity_id, v_changes);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach triggers to sensitive tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products','branches','categories','suppliers','customers',
    'expenses','purchases','sales','user_roles','tenants'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON public.%1$s', t);
    EXECUTE format(
      'CREATE TRIGGER trg_audit_%1$s
       AFTER INSERT OR UPDATE OR DELETE ON public.%1$s
       FOR EACH ROW EXECUTE FUNCTION public.log_audit_change()', t);
  END LOOP;
END $$;
