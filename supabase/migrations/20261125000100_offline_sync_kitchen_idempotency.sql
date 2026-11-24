-- Offline idempotency for kitchen workflow updates only.
-- Financial, payment, invoice and inventory ledger RPCs remain online-only.
CREATE TABLE IF NOT EXISTS private.kitchen_order_sync_requests (
  tenant_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  order_id uuid NOT NULL,
  new_status text NOT NULL,
  notes text,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kitchen_order_sync_requests_pkey
    PRIMARY KEY (tenant_id, actor_id, idempotency_key)
);

ALTER TABLE private.kitchen_order_sync_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.kitchen_order_sync_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.set_kitchen_order_status_idempotent(
  _order_id uuid,
  _new_status text,
  _notes text,
  _idempotency_key uuid
)
RETURNS public.kitchen_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_order public.kitchen_orders%ROWTYPE;
  v_updated public.kitchen_orders%ROWTYPE;
  v_existing private.kitchen_order_sync_requests%ROWTYPE;
  v_inserted integer := 0;
  v_valid_transition boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  IF _order_id IS NULL OR _idempotency_key IS NULL
     OR _new_status NOT IN ('preparing','ready','delivered','cancelled') THEN
    RAISE EXCEPTION 'Invalid kitchen sync request' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_order
  FROM public.kitchen_orders
  WHERE id=_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kitchen order not found' USING ERRCODE='P0002';
  END IF;

  -- Authorization is re-evaluated at replay time; queued scope is never trusted.
  IF NOT private.has_permission(v_actor,v_order.tenant_id,'kitchen.manage')
     OR NOT private.can_access_branch(v_actor,v_order.tenant_id,v_order.branch_id) THEN
    RAISE EXCEPTION 'Permission denied for this kitchen order' USING ERRCODE='42501';
  END IF;

  INSERT INTO private.kitchen_order_sync_requests
    (tenant_id,actor_id,idempotency_key,order_id,new_status,notes)
  VALUES
    (v_order.tenant_id,v_actor,_idempotency_key,_order_id,_new_status,_notes)
  ON CONFLICT (tenant_id,actor_id,idempotency_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    SELECT * INTO v_existing
    FROM private.kitchen_order_sync_requests
    WHERE tenant_id=v_order.tenant_id
      AND actor_id=v_actor
      AND idempotency_key=_idempotency_key
    FOR UPDATE;

    IF NOT FOUND
       OR v_existing.order_id IS DISTINCT FROM _order_id
       OR v_existing.new_status IS DISTINCT FROM _new_status
       OR v_existing.notes IS DISTINCT FROM _notes THEN
      RAISE EXCEPTION 'Idempotency key reused with a different kitchen request' USING ERRCODE='22023';
    END IF;
    IF v_existing.result IS NULL THEN
      RAISE EXCEPTION 'Previous kitchen request has no committed result; retry safely' USING ERRCODE='40001';
    END IF;
    RETURN jsonb_populate_record(NULL::public.kitchen_orders,v_existing.result);
  END IF;

  v_valid_transition :=
    (v_order.status='new' AND _new_status IN ('preparing','cancelled'))
    OR (v_order.status='preparing' AND _new_status IN ('ready','cancelled'))
    OR (v_order.status='ready' AND _new_status='delivered');

  IF NOT v_valid_transition THEN
    RAISE EXCEPTION 'Kitchen order changed or transition is invalid: % -> %',v_order.status,_new_status
      USING ERRCODE='40001';
  END IF;

  UPDATE public.kitchen_orders
  SET status=_new_status,
      notes=CASE WHEN _notes IS NULL THEN notes ELSE left(_notes,1000) END,
      ready_at=CASE WHEN _new_status='ready' THEN now() ELSE ready_at END,
      delivered_at=CASE WHEN _new_status='delivered' THEN now() ELSE delivered_at END,
      updated_at=now()
  WHERE id=_order_id
  RETURNING * INTO v_updated;

  INSERT INTO public.kitchen_order_events
    (tenant_id,branch_id,kitchen_order_id,actor_id,old_status,new_status,notes)
  VALUES
    (v_order.tenant_id,v_order.branch_id,v_order.id,v_actor,v_order.status,_new_status,_notes);

  UPDATE private.kitchen_order_sync_requests
  SET result=to_jsonb(v_updated)
  WHERE tenant_id=v_order.tenant_id
    AND actor_id=v_actor
    AND idempotency_key=_idempotency_key;

  RETURN v_updated;
END;
$function$;

REVOKE ALL ON FUNCTION private.set_kitchen_order_status_idempotent(uuid,text,text,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_kitchen_order_status_idempotent(
  _order_id uuid,
  _new_status text,
  _notes text,
  _idempotency_key uuid
)
RETURNS public.kitchen_orders
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
  SELECT private.set_kitchen_order_status_idempotent(
    _order_id,_new_status,_notes,_idempotency_key
  );
$function$;

REVOKE ALL ON FUNCTION public.set_kitchen_order_status_idempotent(uuid,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_kitchen_order_status_idempotent(uuid,text,text,uuid) TO authenticated;
