-- Kitchen display foundation: immutable sales remain the financial source of truth;
-- kitchen progress is tracked in a separate branch-scoped operational ledger.
BEGIN;

CREATE TABLE IF NOT EXISTS public.kitchen_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  sale_id uuid NOT NULL UNIQUE REFERENCES public.sales(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','preparing','ready','delivered','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,
  delivered_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.kitchen_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  kitchen_order_id uuid NOT NULL REFERENCES public.kitchen_orders(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  old_status text,
  new_status text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kitchen_orders_branch_status_created_idx
  ON public.kitchen_orders (tenant_id, branch_id, status, created_at);
CREATE INDEX IF NOT EXISTS kitchen_order_events_order_created_idx
  ON public.kitchen_order_events (kitchen_order_id, created_at DESC);

ALTER TABLE public.kitchen_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_order_events ENABLE ROW LEVEL SECURITY;

INSERT INTO public.permissions (key,label_ar,label_en,category,description)
VALUES
  ('kitchen.view','عرض شاشة المطبخ','View kitchen display','operations','View kitchen orders in assigned branches'),
  ('kitchen.manage','تحديث حالة طلبات المطبخ','Manage kitchen orders','operations','Advance kitchen order workflow'),
  ('tables.view','عرض الطاولات','View restaurant tables','operations','View restaurant table availability'),
  ('tables.manage','إدارة الطاولات','Manage restaurant tables','operations','Create and update restaurant tables')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (tenant_id,role_kind,builtin_role,custom_role_id,permission_key)
VALUES
  (NULL,'builtin','kitchen',NULL,'kitchen.view'),
  (NULL,'builtin','kitchen',NULL,'kitchen.manage'),
  (NULL,'builtin','waiter',NULL,'kitchen.view'),
  (NULL,'builtin','cashier',NULL,'kitchen.view'),
  (NULL,'builtin','owner',NULL,'kitchen.view'),
  (NULL,'builtin','owner',NULL,'kitchen.manage'),
  (NULL,'builtin','manager',NULL,'kitchen.view'),
  (NULL,'builtin','manager',NULL,'kitchen.manage'),
  (NULL,'builtin','owner',NULL,'tables.view'),
  (NULL,'builtin','owner',NULL,'tables.manage'),
  (NULL,'builtin','manager',NULL,'tables.view'),
  (NULL,'builtin','manager',NULL,'tables.manage'),
  (NULL,'builtin','cashier',NULL,'tables.view'),
  (NULL,'builtin','waiter',NULL,'tables.view')
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS kitchen_orders_branch_select ON public.kitchen_orders;
CREATE POLICY kitchen_orders_branch_select ON public.kitchen_orders
FOR SELECT TO authenticated
USING (
  private.has_permission((select auth.uid()),tenant_id,'kitchen.view')
  AND private.can_access_branch((select auth.uid()),tenant_id,branch_id)
);

DROP POLICY IF EXISTS kitchen_events_branch_select ON public.kitchen_order_events;
CREATE POLICY kitchen_events_branch_select ON public.kitchen_order_events
FOR SELECT TO authenticated
USING (
  private.has_permission((select auth.uid()),tenant_id,'kitchen.view')
  AND private.can_access_branch((select auth.uid()),tenant_id,branch_id)
);

REVOKE INSERT, UPDATE, DELETE ON public.kitchen_orders FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.kitchen_order_events FROM anon, authenticated;
GRANT SELECT ON public.kitchen_orders, public.kitchen_order_events TO authenticated;

-- The kitchen sees only sales explicitly surfaced through its own branch-scoped
-- queue permission; this does not grant general sales access.
DROP POLICY IF EXISTS kitchen_view_sales_select ON public.sales;
CREATE POLICY kitchen_view_sales_select ON public.sales
AS PERMISSIVE FOR SELECT TO authenticated
USING (
  private.has_permission((select auth.uid()),tenant_id,'kitchen.view')
  AND private.can_access_branch((select auth.uid()),tenant_id,branch_id)
);

-- Existing restrictive sales permission gates must explicitly allow kitchen
-- staff to read only the sale/item snapshots needed for their own queue.
DROP POLICY IF EXISTS permission_gate_sales_select ON public.sales;
CREATE POLICY permission_gate_sales_select ON public.sales
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  private.has_permission((select auth.uid()),tenant_id,'sales.view')
  OR private.has_permission((select auth.uid()),tenant_id,'kitchen.view')
);

DROP POLICY IF EXISTS permission_gate_sale_items_select ON public.sale_items;
CREATE POLICY permission_gate_sale_items_select ON public.sale_items
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  private.has_permission((select auth.uid()),tenant_id,'sales.view')
  OR private.has_permission((select auth.uid()),tenant_id,'kitchen.view')
);

DROP POLICY IF EXISTS kitchen_view_sale_items_select ON public.sale_items;
CREATE POLICY kitchen_view_sale_items_select ON public.sale_items
AS PERMISSIVE FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sales s
    WHERE s.id=sale_items.sale_id
      AND s.tenant_id=sale_items.tenant_id
      AND private.has_permission((select auth.uid()),s.tenant_id,'kitchen.view')
      AND private.can_access_branch((select auth.uid()),s.tenant_id,s.branch_id)
  )
);

CREATE OR REPLACE FUNCTION private.create_kitchen_order_for_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  IF NEW.status::text <> 'completed' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.kitchen_orders (tenant_id,branch_id,sale_id,status)
  VALUES (NEW.tenant_id,NEW.branch_id,NEW.id,'new')
  ON CONFLICT (sale_id) DO NOTHING
  RETURNING id INTO v_order_id;

  IF v_order_id IS NOT NULL THEN
    INSERT INTO public.kitchen_order_events
      (tenant_id,branch_id,kitchen_order_id,actor_id,old_status,new_status,notes)
    VALUES
      (NEW.tenant_id,NEW.branch_id,v_order_id,auth.uid(),NULL,'new','تم إرسال الطلب إلى المطبخ');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.create_kitchen_order_for_sale() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_create_kitchen_order_for_sale ON public.sales;
CREATE TRIGGER trg_create_kitchen_order_for_sale
AFTER INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION private.create_kitchen_order_for_sale();

CREATE OR REPLACE FUNCTION private.set_kitchen_order_status(
  _order_id uuid,
  _new_status text,
  _notes text DEFAULT NULL
)
RETURNS public.kitchen_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_order public.kitchen_orders%ROWTYPE;
  v_updated public.kitchen_orders%ROWTYPE;
  v_valid_transition boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_order
  FROM public.kitchen_orders
  WHERE id=_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kitchen order not found' USING ERRCODE='P0002';
  END IF;

  IF NOT private.has_permission(v_actor,v_order.tenant_id,'kitchen.manage')
     OR NOT private.can_access_branch(v_actor,v_order.tenant_id,v_order.branch_id) THEN
    RAISE EXCEPTION 'Permission denied for this kitchen order' USING ERRCODE='42501';
  END IF;

  v_valid_transition :=
    (v_order.status='new' AND _new_status IN ('preparing','cancelled'))
    OR (v_order.status='preparing' AND _new_status IN ('ready','cancelled'))
    OR (v_order.status='ready' AND _new_status='delivered');

  IF NOT v_valid_transition THEN
    RAISE EXCEPTION 'Invalid kitchen order status transition: % -> %',v_order.status,_new_status
      USING ERRCODE='22023';
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

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION private.set_kitchen_order_status(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.set_kitchen_order_status(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_kitchen_order_status(
  _order_id uuid,
  _new_status text,
  _notes text DEFAULT NULL
)
RETURNS public.kitchen_orders
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public, private
AS $$
  SELECT private.set_kitchen_order_status(_order_id,_new_status,_notes);
$$;

REVOKE ALL ON FUNCTION public.set_kitchen_order_status(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_kitchen_order_status(uuid,text,text) TO authenticated;

-- Supabase Realtime drives the display without polling the whole sales ledger.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='kitchen_orders'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.kitchen_orders;
    END IF;
  END IF;
END $$;

COMMIT;
