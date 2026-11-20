-- Restaurant table management and POS order-type foundation.
-- Additive only: preserves all existing sales, payments, inventory and tenant data.
BEGIN;

CREATE TABLE IF NOT EXISTS public.restaurant_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  capacity integer NOT NULL DEFAULT 2 CHECK (capacity BETWEEN 1 AND 100),
  section_name text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','reserved','disabled')),
  current_sale_id uuid REFERENCES public.sales(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_tables_branch_name_unique UNIQUE (tenant_id,branch_id,name)
);

CREATE INDEX IF NOT EXISTS restaurant_tables_branch_status_idx
  ON public.restaurant_tables (tenant_id,branch_id,status,name);
CREATE INDEX IF NOT EXISTS restaurant_tables_current_sale_idx
  ON public.restaurant_tables (current_sale_id) WHERE current_sale_id IS NOT NULL;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'takeaway'
    CHECK (order_type IN ('dine_in','takeaway','delivery')),
  ADD COLUMN IF NOT EXISTS table_id uuid REFERENCES public.restaurant_tables(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS delivery_customer_name text,
  ADD COLUMN IF NOT EXISTS delivery_customer_phone text,
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(12,2) NOT NULL DEFAULT 0
    CHECK (delivery_fee >= 0);

CREATE INDEX IF NOT EXISTS sales_table_active_idx
  ON public.sales (tenant_id,branch_id,table_id,created_at DESC)
  WHERE table_id IS NOT NULL AND status='completed';

ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;

-- Prevent browser clients from forging or clearing current_sale_id. Only the
-- SECURITY DEFINER checkout/release routines may change occupancy.
REVOKE INSERT, UPDATE, DELETE ON public.restaurant_tables FROM anon, authenticated;
GRANT SELECT ON public.restaurant_tables TO authenticated;
GRANT INSERT (tenant_id,branch_id,name,capacity,section_name,status)
  ON public.restaurant_tables TO authenticated;
GRANT UPDATE (name,capacity,section_name,status)
  ON public.restaurant_tables TO authenticated;
GRANT DELETE ON public.restaurant_tables TO authenticated;

INSERT INTO public.permissions (key,label_ar,label_en,category,description)
VALUES
 ('tables.view','عرض الطاولات','View restaurant tables','operations','View tables in assigned branches'),
 ('tables.manage','إدارة الطاولات','Manage restaurant tables','operations','Create, update and release tables')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (tenant_id,role_kind,builtin_role,custom_role_id,permission_key)
SELECT NULL,'builtin',role_name::public.app_role,NULL,permission_key
FROM (VALUES
 ('owner','tables.view'),('owner','tables.manage'),
 ('manager','tables.view'),('manager','tables.manage'),
 ('cashier','tables.view'),('waiter','tables.view'),('kitchen','tables.view'),
 ('cashier','notifications.view'),('waiter','notifications.view')
) AS defaults(role_name,permission_key)
WHERE EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
              WHERE t.typname='app_role' AND e.enumlabel=defaults.role_name)
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS restaurant_tables_branch_select ON public.restaurant_tables;
CREATE POLICY restaurant_tables_branch_select ON public.restaurant_tables
FOR SELECT TO authenticated
USING (
  private.has_permission((select auth.uid()),tenant_id,'tables.view')
  AND private.can_access_branch((select auth.uid()),tenant_id,branch_id)
);

DROP POLICY IF EXISTS restaurant_tables_branch_insert ON public.restaurant_tables;
CREATE POLICY restaurant_tables_branch_insert ON public.restaurant_tables
FOR INSERT TO authenticated
WITH CHECK (
  private.has_permission((select auth.uid()),tenant_id,'tables.manage')
  AND private.can_access_branch((select auth.uid()),tenant_id,branch_id)
);

DROP POLICY IF EXISTS restaurant_tables_branch_update ON public.restaurant_tables;
CREATE POLICY restaurant_tables_branch_update ON public.restaurant_tables
FOR UPDATE TO authenticated
USING (
  private.has_permission((select auth.uid()),tenant_id,'tables.manage')
  AND private.can_access_branch((select auth.uid()),tenant_id,branch_id)
)
WITH CHECK (
  private.has_permission((select auth.uid()),tenant_id,'tables.manage')
  AND private.can_access_branch((select auth.uid()),tenant_id,branch_id)
);

DROP POLICY IF EXISTS restaurant_tables_branch_delete ON public.restaurant_tables;
CREATE POLICY restaurant_tables_branch_delete ON public.restaurant_tables
FOR DELETE TO authenticated
USING (
  private.has_permission((select auth.uid()),tenant_id,'tables.manage')
  AND private.can_access_branch((select auth.uid()),tenant_id,branch_id)
  AND current_sale_id IS NULL
);

CREATE OR REPLACE FUNCTION private.create_pos_order(
  _tenant_id uuid,
  _branch_id uuid,
  _cashier_id uuid,
  _session_id uuid,
  _discount numeric,
  _customer_id uuid,
  _paid_amount numeric,
  _paid_method public.payment_method,
  _items jsonb,
  _order_type text,
  _table_id uuid DEFAULT NULL,
  _delivery_customer_name text DEFAULT NULL,
  _delivery_customer_phone text DEFAULT NULL,
  _delivery_address text DEFAULT NULL,
  _delivery_fee numeric DEFAULT 0
)
RETURNS public.sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_subtotal numeric(12,2);
  v_tax_rate numeric(5,2);
  v_base_total numeric(12,2);
  v_final_total numeric(12,2);
  v_base_paid numeric(12,2);
  v_extra_paid numeric(12,2);
  v_sale public.sales%ROWTYPE;
  v_table public.restaurant_tables%ROWTYPE;
  v_credit_limit numeric(14,2);
  v_customer_debt numeric(14,2);
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM _cashier_id THEN
    RAISE EXCEPTION 'Authenticated cashier identity mismatch' USING ERRCODE='42501';
  END IF;
  IF _order_type NOT IN ('dine_in','takeaway','delivery') THEN
    RAISE EXCEPTION 'Invalid order type' USING ERRCODE='22023';
  END IF;
  IF _delivery_fee IS NULL OR _delivery_fee < 0 OR _delivery_fee='NaN'::numeric THEN
    RAISE EXCEPTION 'Invalid delivery fee' USING ERRCODE='22023';
  END IF;

  IF _order_type='delivery' THEN
    IF _table_id IS NOT NULL
       OR nullif(btrim(_delivery_customer_name),'') IS NULL
       OR nullif(btrim(_delivery_customer_phone),'') IS NULL
       OR nullif(btrim(_delivery_address),'') IS NULL
       OR char_length(_delivery_customer_name)>120
       OR char_length(_delivery_customer_phone)>30
       OR char_length(_delivery_address)>500 THEN
      RAISE EXCEPTION 'Delivery requires customer name, phone and address and cannot use a table'
        USING ERRCODE='22023';
    END IF;
  ELSIF _order_type='dine_in' THEN
    IF NOT private.has_permission(auth.uid(),_tenant_id,'tables.view') THEN
      RAISE EXCEPTION 'Permission denied: tables.view' USING ERRCODE='42501';
    END IF;
    IF _table_id IS NULL OR _delivery_fee<>0 THEN
      RAISE EXCEPTION 'Dine-in orders require a table and cannot include a delivery fee'
        USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_table
      FROM public.restaurant_tables
     WHERE id=_table_id AND tenant_id=_tenant_id AND branch_id=_branch_id
       AND status='active'
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Selected table is unavailable or belongs to another branch'
        USING ERRCODE='23503';
    END IF;
    IF v_table.current_sale_id IS NOT NULL THEN
      RAISE EXCEPTION 'Selected table is already occupied' USING ERRCODE='55000';
    END IF;
  ELSE
    IF _table_id IS NOT NULL OR _delivery_fee<>0 THEN
      RAISE EXCEPTION 'Takeaway orders cannot use a table or delivery fee'
        USING ERRCODE='22023';
    END IF;
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(_items)=0 OR jsonb_array_length(_items)>300 THEN
    RAISE EXCEPTION 'Sale must contain between 1 and 300 items' USING ERRCODE='22023';
  END IF;

  SELECT coalesce(sum(round(p.sale_price * (item->>'quantity')::numeric,2)),0)
    INTO v_subtotal
    FROM jsonb_array_elements(_items) item
    JOIN public.products p ON p.id=(item->>'product_id')::uuid
   WHERE p.tenant_id=_tenant_id AND p.is_active=true;

  SELECT tax_rate INTO v_tax_rate FROM public.tenants WHERE id=_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found' USING ERRCODE='P0002'; END IF;
  IF v_subtotal<=0 THEN RAISE EXCEPTION 'Invalid sale items' USING ERRCODE='22023'; END IF;
  IF coalesce(_discount,0)<0 OR coalesce(_discount,0)>v_subtotal THEN
    RAISE EXCEPTION 'Invalid discount' USING ERRCODE='22023';
  END IF;

  v_base_total := round(greatest(v_subtotal-coalesce(_discount,0),0)
                 + round(greatest(v_subtotal-coalesce(_discount,0),0)*(v_tax_rate/100),2),2);
  v_final_total := v_base_total + _delivery_fee;
  IF _paid_amount IS NULL OR _paid_amount<0 OR _paid_amount>v_final_total THEN
    RAISE EXCEPTION 'Paid amount must be between zero and invoice total' USING ERRCODE='22023';
  END IF;
  IF _customer_id IS NULL AND _paid_amount<>v_final_total THEN
    RAISE EXCEPTION 'Select a customer when any part of the invoice remains unpaid' USING ERRCODE='22023';
  END IF;
  v_base_paid := least(_paid_amount,v_base_total);
  v_extra_paid := greatest(_paid_amount-v_base_total,0);

  v_sale := private.create_sale_with_customer(
    _tenant_id,_branch_id,_cashier_id,_session_id,_discount,_customer_id,
    v_base_paid,_paid_method,_items
  );

  UPDATE public.sales
     SET order_type=_order_type,
         table_id=_table_id,
         delivery_customer_name=CASE WHEN _order_type='delivery' THEN btrim(_delivery_customer_name) ELSE NULL END,
         delivery_customer_phone=CASE WHEN _order_type='delivery' THEN btrim(_delivery_customer_phone) ELSE NULL END,
         delivery_address=CASE WHEN _order_type='delivery' THEN btrim(_delivery_address) ELSE NULL END,
         delivery_fee=_delivery_fee,
         total=v_final_total,
         payment_method=CASE
           WHEN _paid_amount=0 THEN 'credit'::public.payment_method
           WHEN _paid_amount<v_final_total THEN 'mixed'::public.payment_method
           ELSE _paid_method
         END
   WHERE id=v_sale.id
   RETURNING * INTO v_sale;

  IF v_extra_paid>0 THEN
    INSERT INTO public.payments(tenant_id,sale_id,method,amount)
    VALUES (_tenant_id,v_sale.id,_paid_method,v_extra_paid);
  END IF;

  IF _customer_id IS NOT NULL THEN
    SELECT credit_limit INTO v_credit_limit
      FROM public.customers
     WHERE id=_customer_id AND tenant_id=_tenant_id
     FOR UPDATE;
    SELECT coalesce(sum(greatest(
      s.total
      - coalesce((SELECT sum(p.amount) FROM public.payments p WHERE p.sale_id=s.id AND p.tenant_id=s.tenant_id),0)
      - coalesce((SELECT sum(cp.amount) FROM public.customer_payments cp WHERE cp.sale_id=s.id AND cp.tenant_id=s.tenant_id),0)
      - coalesce((SELECT sum(r.total) FROM public.sale_refunds r WHERE r.sale_id=s.id AND r.tenant_id=s.tenant_id),0),0
    )),0)
    INTO v_customer_debt
    FROM public.sales s
    WHERE s.tenant_id=_tenant_id AND s.customer_id=_customer_id AND s.status='completed';
    IF v_customer_debt>v_credit_limit THEN
      RAISE EXCEPTION 'Customer credit limit exceeded after delivery fee' USING ERRCODE='22023';
    END IF;
  END IF;

  IF _order_type='dine_in' THEN
    UPDATE public.restaurant_tables
       SET current_sale_id=v_sale.id,updated_at=now()
     WHERE id=_table_id AND current_sale_id IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Selected table was assigned to another order' USING ERRCODE='55000';
    END IF;
  END IF;

  RETURN v_sale;
END;
$$;

REVOKE ALL ON FUNCTION private.create_pos_order(uuid,uuid,uuid,uuid,numeric,uuid,numeric,public.payment_method,jsonb,text,uuid,text,text,text,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.create_pos_order(uuid,uuid,uuid,uuid,numeric,uuid,numeric,public.payment_method,jsonb,text,uuid,text,text,text,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_pos_order(
  _tenant_id uuid,
  _branch_id uuid,
  _cashier_id uuid,
  _session_id uuid,
  _discount numeric,
  _customer_id uuid,
  _paid_amount numeric,
  _paid_method public.payment_method,
  _items jsonb,
  _order_type text,
  _table_id uuid DEFAULT NULL,
  _delivery_customer_name text DEFAULT NULL,
  _delivery_customer_phone text DEFAULT NULL,
  _delivery_address text DEFAULT NULL,
  _delivery_fee numeric DEFAULT 0
)
RETURNS public.sales
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public, private
AS $$
  SELECT private.create_pos_order(
    _tenant_id,_branch_id,_cashier_id,_session_id,_discount,_customer_id,
    _paid_amount,_paid_method,_items,_order_type,_table_id,
    _delivery_customer_name,_delivery_customer_phone,_delivery_address,_delivery_fee
  );
$$;

REVOKE ALL ON FUNCTION public.create_pos_order(uuid,uuid,uuid,uuid,numeric,uuid,numeric,public.payment_method,jsonb,text,uuid,text,text,text,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_pos_order(uuid,uuid,uuid,uuid,numeric,uuid,numeric,public.payment_method,jsonb,text,uuid,text,text,text,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION private.release_restaurant_table_on_sale_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_order record;
BEGIN
  IF NEW.status::text <> 'completed' AND OLD.status::text='completed' THEN
    -- Stop any outstanding kitchen ticket before freeing the table.
    FOR v_order IN
      SELECT id,tenant_id,branch_id,status
        FROM public.kitchen_orders
       WHERE sale_id=OLD.id AND status IN ('new','preparing','ready')
       FOR UPDATE
    LOOP
      UPDATE public.kitchen_orders
         SET status='cancelled',updated_at=now(),
             notes=coalesce(notes,'') ||
               CASE WHEN coalesce(notes,'')='' THEN '' ELSE chr(10) END ||
               'أُلغي البيع المرتبط بهذا الطلب'
       WHERE id=v_order.id;
      INSERT INTO public.kitchen_order_events
        (tenant_id,branch_id,kitchen_order_id,actor_id,old_status,new_status,notes)
      VALUES
        (v_order.tenant_id,v_order.branch_id,v_order.id,auth.uid(),
         v_order.status,'cancelled','أُلغي البيع المرتبط بهذا الطلب');
    END LOOP;

    IF OLD.table_id IS NOT NULL THEN
      UPDATE public.restaurant_tables
         SET current_sale_id=NULL,updated_at=now()
       WHERE id=OLD.table_id AND current_sale_id=OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.release_restaurant_table_on_sale_cancel() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_release_table_on_sale_cancel ON public.sales;
CREATE TRIGGER trg_release_table_on_sale_cancel
AFTER UPDATE OF status ON public.sales
FOR EACH ROW EXECUTE FUNCTION private.release_restaurant_table_on_sale_cancel();

CREATE OR REPLACE FUNCTION private.close_restaurant_table(_table_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_table public.restaurant_tables%ROWTYPE;
BEGIN
  SELECT * INTO v_table FROM public.restaurant_tables WHERE id=_table_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Table not found' USING ERRCODE='P0002'; END IF;
  IF NOT private.has_permission(auth.uid(),v_table.tenant_id,'tables.manage')
     OR NOT private.can_access_branch(auth.uid(),v_table.tenant_id,v_table.branch_id) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';
  END IF;
  IF v_table.current_sale_id IS NULL THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM public.sales
     WHERE id=v_table.current_sale_id AND status='completed'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.kitchen_orders
       WHERE sale_id=v_table.current_sale_id AND status IN ('new','preparing','ready')
    ) THEN
      RAISE EXCEPTION 'Cannot release a table while its kitchen order is still active'
        USING ERRCODE='55000';
    END IF;
  END IF;
  UPDATE public.restaurant_tables SET current_sale_id=NULL,updated_at=now()
   WHERE id=_table_id AND current_sale_id=v_table.current_sale_id;
END;
$$;
REVOKE ALL ON FUNCTION private.close_restaurant_table(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.close_restaurant_table(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.close_restaurant_table(_table_id uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public, private
AS $$ SELECT private.close_restaurant_table(_table_id); $$;
REVOKE ALL ON FUNCTION public.close_restaurant_table(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.close_restaurant_table(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.notify_branch_when_kitchen_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $$
DECLARE
  v_company_id uuid;
  v_invoice_no integer;
BEGIN
  IF NEW.status='ready' AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT company_id INTO v_company_id FROM public.branches
     WHERE id=NEW.branch_id AND tenant_id=NEW.tenant_id;
    SELECT invoice_no INTO v_invoice_no FROM public.sales
     WHERE id=NEW.sale_id AND tenant_id=NEW.tenant_id;
    INSERT INTO public.notifications
      (tenant_id,company_id,audience_type,audience_id,kind,urgency,title,body,payload,created_by)
    VALUES
      (NEW.tenant_id,v_company_id,'branch',NEW.branch_id,'kitchen_order_ready','normal',
       'الطلب جاهز للاستلام',
       'الطلب رقم '||coalesce(v_invoice_no::text,'—')||' أصبح جاهزاً.',
       jsonb_build_object('sale_id',NEW.sale_id,'kitchen_order_id',NEW.id,'invoice_no',v_invoice_no),
       auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.notify_branch_when_kitchen_ready() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_notify_branch_kitchen_ready ON public.kitchen_orders;
CREATE TRIGGER trg_notify_branch_kitchen_ready
AFTER UPDATE OF status ON public.kitchen_orders
FOR EACH ROW EXECUTE FUNCTION private.notify_branch_when_kitchen_ready();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime'
                   AND schemaname='public' AND tablename='restaurant_tables') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.restaurant_tables;
    END IF;
  END IF;
END $$;

COMMIT;
