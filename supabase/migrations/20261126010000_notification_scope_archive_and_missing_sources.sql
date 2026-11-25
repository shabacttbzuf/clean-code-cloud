-- Stage 10 hardening: enforce recipient visibility at the database boundary,
-- add per-user archive state, and connect the remaining real event sources.
-- No financial, stock, or production data is changed by this migration.
BEGIN;

-- Per-user archive state lives beside the existing read receipt. Existing rows
-- remain valid and unarchived by default.
ALTER TABLE public.notification_reads
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS notification_reads_user_archived_idx
  ON public.notification_reads (user_id, archived_at, notification_id);

-- One canonical visibility predicate is shared by notification reads and receipts.
-- SECURITY DEFINER is required to inspect the parent notification without RLS
-- recursion; auth.uid() is always taken from the caller, never from an argument.
CREATE OR REPLACE FUNCTION private.can_read_notification(_notification_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.id = _notification_id
      AND auth.uid() IS NOT NULL
      AND (
        private.is_super_owner(auth.uid())
        OR (
          private.is_tenant_member(auth.uid(), n.tenant_id)
          AND private.has_permission(auth.uid(), n.tenant_id, 'notifications.view')
          AND (
            n.company_id IS NULL
            OR EXISTS (
              SELECT 1 FROM public.user_roles ur
              WHERE ur.user_id = auth.uid()
                AND ur.tenant_id = n.tenant_id
                AND ur.role = 'owner'
                AND ur.company_id IS NULL
            )
            OR EXISTS (
              SELECT 1 FROM public.user_roles ur
              WHERE ur.user_id = auth.uid()
                AND ur.tenant_id = n.tenant_id
                AND ur.company_id = n.company_id
            )
          )
          AND CASE n.audience_type
            WHEN 'all' THEN true
            WHEN 'owner' THEN EXISTS (
              SELECT 1 FROM public.user_roles ur
              WHERE ur.user_id = auth.uid()
                AND ur.tenant_id = n.tenant_id
                AND ur.role = 'owner'
                AND (ur.company_id = n.company_id OR (n.company_id IS NULL AND ur.company_id IS NULL))
            )
            WHEN 'manager' THEN EXISTS (
              SELECT 1 FROM public.user_roles ur
              WHERE ur.user_id = auth.uid()
                AND ur.tenant_id = n.tenant_id
                AND ur.role = 'manager'
                AND (ur.company_id = n.company_id OR (n.company_id IS NULL AND ur.company_id IS NULL))
            )
            WHEN 'user' THEN n.audience_id = auth.uid()
            WHEN 'branch' THEN private.can_access_branch(auth.uid(), n.tenant_id, n.audience_id)
            WHEN 'department' THEN EXISTS (
              SELECT 1
              FROM public.departments d
              WHERE d.id = n.audience_id
                AND d.tenant_id = n.tenant_id
                AND (
                  EXISTS (
                    SELECT 1 FROM public.user_roles ur
                    WHERE ur.user_id = auth.uid()
                      AND ur.tenant_id = n.tenant_id
                      AND ur.department_id = d.id
                      AND (ur.company_id IS NULL OR ur.company_id = d.company_id)
                  )
                  OR EXISTS (
                    SELECT 1 FROM public.user_roles ur
                    WHERE ur.user_id = auth.uid()
                      AND ur.tenant_id = n.tenant_id
                      AND ur.role IN ('owner','manager')
                      AND (ur.company_id = d.company_id OR (ur.role = 'owner' AND ur.company_id IS NULL))
                  )
                )
            )
            ELSE false
          END
          AND CASE n.kind
            WHEN 'sale_recorded' THEN private.has_permission(auth.uid(), n.tenant_id, 'sales.view')
            WHEN 'sale_status_changed' THEN private.has_permission(auth.uid(), n.tenant_id, 'sales.view')
            WHEN 'kitchen_order_ready' THEN private.has_permission(auth.uid(), n.tenant_id, 'kitchen.view')
            WHEN 'kitchen_order_delayed' THEN private.has_permission(auth.uid(), n.tenant_id, 'kitchen.view')
            WHEN 'low_stock' THEN private.has_permission(auth.uid(), n.tenant_id, 'inventory.view')
            WHEN 'customer_credit_invoice_issued' THEN private.has_permission(auth.uid(), n.tenant_id, 'sales.view')
            WHEN 'customer_invoice_payment_received' THEN private.has_permission(auth.uid(), n.tenant_id, 'sales.view')
            WHEN 'customer_invoice_balance_cleared' THEN private.has_permission(auth.uid(), n.tenant_id, 'sales.view')
            WHEN 'hr_leave_requested' THEN private.has_permission(auth.uid(), n.tenant_id, 'hr.leaves.view')
            WHEN 'campaign_activated' THEN private.has_permission(auth.uid(), n.tenant_id, 'ads.manage')
            WHEN 'promotion_activated' THEN private.has_permission(auth.uid(), n.tenant_id, 'promotions.manage')
            WHEN 'admin_account_status_changed' THEN private.has_permission(auth.uid(), n.tenant_id, 'users.view')
            ELSE true
          END
        )
      )
  );
$function$;

REVOKE ALL ON FUNCTION private.can_read_notification(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_read_notification(uuid) TO authenticated, service_role;

-- Remove permissive SELECT policies whose OR-combination previously allowed
-- same-company users to bypass audience and notification permission checks.
DROP POLICY IF EXISTS company_scope_notifications_select ON public.notifications;
DROP POLICY IF EXISTS notifications_read ON public.notifications;
DROP POLICY IF EXISTS permission_gate_notifications_select ON public.notifications;
CREATE POLICY notifications_select_scoped
  ON public.notifications FOR SELECT TO authenticated
  USING (private.can_read_notification(id));

-- Receipt ownership alone is not enough: a user must be an authorized recipient
-- of the parent notification before reading, creating, updating, or deleting a receipt.
DROP POLICY IF EXISTS "Users read own notification receipts" ON public.notification_reads;
DROP POLICY IF EXISTS permission_gate_notification_reads_select ON public.notification_reads;
DROP POLICY IF EXISTS "Users create own notification receipts" ON public.notification_reads;
DROP POLICY IF EXISTS permission_gate_notification_reads_insert ON public.notification_reads;
DROP POLICY IF EXISTS "Users update own notification receipts" ON public.notification_reads;
DROP POLICY IF EXISTS permission_gate_notification_reads_update ON public.notification_reads;
DROP POLICY IF EXISTS "users delete own notification receipts" ON public.notification_reads;
DROP POLICY IF EXISTS permission_gate_notification_reads_delete ON public.notification_reads;

CREATE POLICY notification_reads_select_scoped
  ON public.notification_reads FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND private.can_read_notification(notification_id));

CREATE POLICY notification_reads_insert_scoped
  ON public.notification_reads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND private.can_read_notification(notification_id));

CREATE POLICY notification_reads_update_scoped
  ON public.notification_reads FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND private.can_read_notification(notification_id))
  WITH CHECK (user_id = auth.uid() AND private.can_read_notification(notification_id));

CREATE POLICY notification_reads_delete_scoped
  ON public.notification_reads FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND private.can_read_notification(notification_id));

-- Event-level idempotency keys prevent duplicate notifications under concurrent
-- trigger execution/retries. The source row remains the authoritative event.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_sale_event_dedupe_idx
  ON public.notifications (tenant_id, kind, (payload ->> 'sale_id'), (payload ->> 'status'))
  WHERE kind IN ('sale_recorded','sale_status_changed');

CREATE UNIQUE INDEX IF NOT EXISTS notifications_campaign_event_dedupe_idx
  ON public.notifications (tenant_id, kind, (payload ->> 'campaign_id'))
  WHERE kind = 'campaign_activated';

CREATE UNIQUE INDEX IF NOT EXISTS notifications_offer_event_dedupe_idx
  ON public.notifications (tenant_id, kind, (payload ->> 'offer_id'))
  WHERE kind = 'promotion_activated';

CREATE UNIQUE INDEX IF NOT EXISTS notifications_profile_event_dedupe_idx
  ON public.notifications (tenant_id, kind, (payload ->> 'profile_id'), (payload ->> 'status'), (payload ->> 'event_at'))
  WHERE kind = 'admin_account_status_changed';

-- Completed sales and terminal sale-state transitions create non-financial
-- operational alerts. No totals, payment details, customer PII, or ledger rows
-- are copied into the notification payload.
CREATE OR REPLACE FUNCTION private.notify_sale_operational_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
DECLARE
  v_company_id uuid;
  v_actor_id uuid;
  v_kind text;
  v_audience text;
  v_title text;
  v_body text;
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status::text = 'completed' THEN
    v_kind := 'sale_recorded';
    v_audience := 'branch';
    v_title := 'تم تسجيل عملية بيع جديدة';
    v_body := 'تم تسجيل الطلب رقم ' || NEW.invoice_no::text || ' في الفرع.';
  ELSIF TG_OP = 'UPDATE'
    AND OLD.status IS DISTINCT FROM NEW.status
    AND NEW.status::text IN ('refunded','void') THEN
    v_kind := 'sale_status_changed';
    v_audience := 'manager';
    v_title := CASE WHEN NEW.status::text = 'refunded' THEN 'تم تسجيل مرتجع بيع' ELSE 'تم إلغاء عملية بيع' END;
    v_body := 'تغيرت حالة الطلب رقم ' || NEW.invoice_no::text || '.';
  ELSE
    RETURN NEW;
  END IF;

  SELECT b.company_id INTO v_company_id
  FROM public.branches b
  WHERE b.id = NEW.branch_id AND b.tenant_id = NEW.tenant_id;
  IF v_company_id IS NULL THEN RETURN NEW; END IF;

  SELECT ur.user_id INTO v_actor_id
  FROM public.user_roles ur
  WHERE ur.tenant_id = NEW.tenant_id
    AND ur.role IN ('owner','manager')
    AND (ur.company_id = v_company_id OR (ur.role = 'owner' AND ur.company_id IS NULL))
  ORDER BY CASE WHEN ur.role = 'owner' THEN 0 ELSE 1 END, ur.created_at
  LIMIT 1;
  IF v_actor_id IS NULL THEN RETURN NEW; END IF;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_actor_id::text, true);
    INSERT INTO public.notifications (
      tenant_id, company_id, audience_type, audience_id, kind, urgency,
      title, body, payload, action_path, action_label, created_by
    )
    VALUES (
      NEW.tenant_id, v_company_id, v_audience,
      CASE WHEN v_audience = 'branch' THEN NEW.branch_id ELSE NULL END,
      v_kind, 'normal', v_title, v_body,
      jsonb_build_object('sale_id', NEW.id, 'invoice_no', NEW.invoice_no,
                         'branch_id', NEW.branch_id, 'status', NEW.status::text),
      '/sales/' || NEW.id::text, 'عرض العملية', v_actor_id
    )
    ON CONFLICT DO NOTHING;
    PERFORM set_config('request.jwt.claim.sub', COALESCE(v_previous_sub, ''), true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claim.sub', COALESCE(v_previous_sub, ''), true);
    RAISE WARNING 'Sale notification skipped for sale %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.notify_sale_operational_events() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_sale_operational_events ON public.sales;
CREATE TRIGGER trg_notify_sale_operational_events
AFTER INSERT OR UPDATE OF status ON public.sales
FOR EACH ROW EXECUTE FUNCTION private.notify_sale_operational_events();

-- Notify company managers only when a campaign actually becomes active.
CREATE OR REPLACE FUNCTION private.notify_campaign_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
DECLARE
  v_actor_id uuid;
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
BEGIN
  IF NEW.status <> 'active' OR (TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status) THEN
    RETURN NEW;
  END IF;
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;

  SELECT ur.user_id INTO v_actor_id
  FROM public.user_roles ur
  WHERE ur.tenant_id = NEW.tenant_id
    AND ur.role IN ('owner','manager')
    AND (ur.company_id = NEW.company_id OR (ur.role = 'owner' AND ur.company_id IS NULL))
  ORDER BY CASE WHEN ur.role = 'owner' THEN 0 ELSE 1 END, ur.created_at
  LIMIT 1;
  IF v_actor_id IS NULL THEN RETURN NEW; END IF;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_actor_id::text, true);
    INSERT INTO public.notifications (
      tenant_id, company_id, audience_type, kind, urgency,
      title, body, payload, action_path, action_label, created_by
    )
    VALUES (
      NEW.tenant_id, NEW.company_id, 'manager', 'campaign_activated', 'normal',
      'تم تفعيل حملة تسويقية',
      'أصبحت الحملة «' || NEW.title || '» نشطة.',
      jsonb_build_object('campaign_id', NEW.id, 'starts_at', NEW.starts_at, 'ends_at', NEW.ends_at),
      '/ads', 'إدارة الحملات', v_actor_id
    )
    ON CONFLICT DO NOTHING;
    PERFORM set_config('request.jwt.claim.sub', COALESCE(v_previous_sub, ''), true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claim.sub', COALESCE(v_previous_sub, ''), true);
    RAISE WARNING 'Campaign notification skipped for campaign %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.notify_campaign_activation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_campaign_activation ON public.marketing_campaigns;
CREATE TRIGGER trg_notify_campaign_activation
AFTER INSERT OR UPDATE OF status ON public.marketing_campaigns
FOR EACH ROW EXECUTE FUNCTION private.notify_campaign_activation();

-- Promotional offers use the real active transition and their existing company/
-- branch scope. Branch-targeted offers are only visible to members of that branch.
CREATE OR REPLACE FUNCTION private.notify_promotion_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
DECLARE
  v_company_id uuid;
  v_actor_id uuid;
  v_audience text;
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
BEGIN
  IF NEW.status <> 'active' OR (TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status) THEN
    RETURN NEW;
  END IF;

  v_company_id := NEW.company_id;
  IF v_company_id IS NULL AND NEW.branch_id IS NOT NULL THEN
    SELECT b.company_id INTO v_company_id
    FROM public.branches b
    WHERE b.id = NEW.branch_id AND b.tenant_id = NEW.tenant_id;
  END IF;
  IF v_company_id IS NULL THEN RETURN NEW; END IF;

  SELECT ur.user_id INTO v_actor_id
  FROM public.user_roles ur
  WHERE ur.tenant_id = NEW.tenant_id AND ur.company_id = v_company_id
    AND ur.role IN ('owner','manager')
  ORDER BY CASE WHEN ur.role = 'owner' THEN 0 ELSE 1 END, ur.created_at
  LIMIT 1;
  IF v_actor_id IS NULL THEN RETURN NEW; END IF;

  v_audience := CASE WHEN NEW.branch_id IS NULL THEN 'manager' ELSE 'branch' END;
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_actor_id::text, true);
    INSERT INTO public.notifications (
      tenant_id, company_id, audience_type, audience_id, kind, urgency,
      title, body, payload, action_path, action_label, created_by
    )
    VALUES (
      NEW.tenant_id, v_company_id, v_audience, NEW.branch_id,
      'promotion_activated', 'normal',
      'تم تفعيل عرض ترويجي',
      'أصبح العرض «' || NEW.name || '» نشطاً.',
      jsonb_build_object('offer_id', NEW.id, 'branch_id', NEW.branch_id),
      '/promotions', 'إدارة العروض', v_actor_id
    )
    ON CONFLICT DO NOTHING;
    PERFORM set_config('request.jwt.claim.sub', COALESCE(v_previous_sub, ''), true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claim.sub', COALESCE(v_previous_sub, ''), true);
    RAISE WARNING 'Promotion notification skipped for offer %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.notify_promotion_activation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_promotion_activation ON public.promotional_offers;
CREATE TRIGGER trg_notify_promotion_activation
AFTER INSERT OR UPDATE OF status ON public.promotional_offers
FOR EACH ROW EXECUTE FUNCTION private.notify_promotion_activation();

-- Account lifecycle alerts are administrative metadata only; never include email,
-- phone, national ID, or device/IP details in notification content or payload.
CREATE OR REPLACE FUNCTION private.notify_admin_account_status_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
DECLARE
  v_actor_id uuid;
  v_audience text;
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
BEGIN
  IF NEW.tenant_id IS NULL OR NEW.company_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status::text <> 'pending_approval' THEN RETURN NEW; END IF;
  ELSIF OLD.status IS NOT DISTINCT FROM NEW.status
    AND OLD.company_id IS NOT DISTINCT FROM NEW.company_id
    AND OLD.tenant_id IS NOT DISTINCT FROM NEW.tenant_id THEN
    RETURN NEW;
  ELSIF NEW.status::text NOT IN ('pending_approval','suspended','frozen','archived') THEN
    RETURN NEW;
  END IF;

  SELECT ur.user_id INTO v_actor_id
  FROM public.user_roles ur
  WHERE ur.tenant_id = NEW.tenant_id
    AND ur.role IN ('owner','manager')
    AND (ur.company_id = NEW.company_id OR (ur.role = 'owner' AND ur.company_id IS NULL))
  ORDER BY CASE WHEN ur.role = 'owner' THEN 0 ELSE 1 END, ur.created_at
  LIMIT 1;
  IF v_actor_id IS NULL THEN RETURN NEW; END IF;

  v_audience := 'manager';
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_actor_id::text, true);
    INSERT INTO public.notifications (
      tenant_id, company_id, audience_type, kind, urgency,
      title, body, payload, action_path, action_label, created_by
    )
    VALUES (
      NEW.tenant_id, NEW.company_id, v_audience, 'admin_account_status_changed', 'urgent',
      'تغيرت حالة حساب مستخدم',
      'تغيرت حالة حساب أحد المستخدمين إلى ' || NEW.status::text || '.',
      jsonb_build_object('profile_id', NEW.id, 'status', NEW.status::text,
                         'event_at', NEW.updated_at),
      '/users', 'إدارة المستخدمين', v_actor_id
    )
    ON CONFLICT DO NOTHING;
    PERFORM set_config('request.jwt.claim.sub', COALESCE(v_previous_sub, ''), true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claim.sub', COALESCE(v_previous_sub, ''), true);
    RAISE WARNING 'Account status notification skipped for profile %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.notify_admin_account_status_events() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_admin_account_status_events ON public.profiles;
CREATE TRIGGER trg_notify_admin_account_status_events
AFTER INSERT OR UPDATE OF status, company_id, tenant_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.notify_admin_account_status_events();

COMMIT;
