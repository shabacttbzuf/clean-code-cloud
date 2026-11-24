-- Notify HR recipients from real leave-request creation and decision events.
-- Notifications are informational only; this trigger never changes the HR record.
BEGIN;

CREATE OR REPLACE FUNCTION private.notify_leave_request_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, pg_temp
AS $function$
DECLARE
  v_employee public.employees%ROWTYPE;
  v_company_id uuid;
  v_employee_user_id uuid;
  v_start_date date;
  v_end_date date;
  v_status text;
BEGIN
  SELECT * INTO v_employee
  FROM public.employees
  WHERE id = NEW.employee_id
    AND tenant_id = NEW.tenant_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_employee_user_id := v_employee.user_id;
  IF v_employee.branch_id IS NOT NULL THEN
    SELECT company_id INTO v_company_id
    FROM public.branches
    WHERE id = v_employee.branch_id
      AND tenant_id = NEW.tenant_id;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    INSERT INTO public.notifications (
      tenant_id, company_id, audience_type, kind, urgency,
      title, body, payload, action_path, action_label
    )
    VALUES
    (
      NEW.tenant_id, v_company_id, 'owner', 'hr_leave_requested', 'normal',
      'طلب إجازة جديد',
      'تم تقديم طلب إجازة جديد يحتاج إلى المراجعة.',
      jsonb_build_object('leave_request_id', NEW.id, 'employee_id', NEW.employee_id),
      '/hr/leaves', 'مراجعة الطلب'
    ),
    (
      NEW.tenant_id, v_company_id, 'manager', 'hr_leave_requested', 'normal',
      'طلب إجازة جديد',
      'تم تقديم طلب إجازة جديد يحتاج إلى المراجعة.',
      jsonb_build_object('leave_request_id', NEW.id, 'employee_id', NEW.employee_id),
      '/hr/leaves', 'مراجعة الطلب'
    );
  ELSIF TG_OP = 'UPDATE'
    AND OLD.status = 'pending'
    AND NEW.status IN ('approved', 'rejected')
    AND v_employee_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = v_employee_user_id
        AND ur.tenant_id = NEW.tenant_id
    )
  THEN
    INSERT INTO public.notifications (
      tenant_id, company_id, audience_type, audience_id, kind, urgency,
      title, body, payload, action_path, action_label
    )
    VALUES (
      NEW.tenant_id,
      v_company_id,
      'user',
      v_employee_user_id,
      CASE WHEN NEW.status = 'approved' THEN 'hr_leave_approved' ELSE 'hr_leave_rejected' END,
      'normal',
      CASE WHEN NEW.status = 'approved' THEN 'تمت الموافقة على طلب الإجازة' ELSE 'تم رفض طلب الإجازة' END,
      CASE WHEN NEW.status = 'approved'
        THEN 'تمت الموافقة على طلب الإجازة المقدم منك.'
        ELSE 'تم رفض طلب الإجازة المقدم منك. يرجى مراجعة التفاصيل مع الإدارة.'
      END,
      jsonb_build_object(
        'leave_request_id', NEW.id,
        'status', NEW.status,
        'start_date', NEW.start_date,
        'end_date', NEW.end_date
      ),
      '/hr/leaves',
      'عرض طلباتي'
    );
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.notify_leave_request_events() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_leave_request_events ON public.leave_requests;
CREATE TRIGGER trg_notify_leave_request_events
AFTER INSERT OR UPDATE OF status ON public.leave_requests
FOR EACH ROW
EXECUTE FUNCTION private.notify_leave_request_events();

COMMIT;
